import { and, eq, inArray, isNull } from 'drizzle-orm';

import { datasetRefreshOperations, datasetRelationColumns, datasetRelations, datasets, fileAssets } from '@dory/database/postgres/schemas/local-files';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';
import { translateDatabase } from '@dory/database/i18n';

import { getClient } from '../../client';

export type LocalFileAssetCreateInput = {
    organizationId: string;
    createdByUserId: string;
    backend: string;
    sourceType: string;
    path: string;
    storageKey?: string | null;
    sizeBytes?: string | null;
    mtimeMs?: string | null;
    metadata?: string;
};

export type DatasetCreateInput = {
    organizationId: string;
    createdByUserId: string;
    connectionId: string;
    name: string;
    schemaName: string;
};

export type DatasetRelationCreateInput = {
    organizationId: string;
    datasetId: string;
    fileAssetId: string;
    sourceType: string;
    sheetName?: string | null;
    relationName: string;
    mode: string;
    duckdbSchema: string;
    duckdbRelation: string;
    physicalTableName?: string | null;
    sourceFingerprint?: string | null;
    lastSourceFingerprint?: string | null;
    schemaDriftStatus?: string;
    refreshStrategy?: string;
    readSql: string;
};

export type DatasetRelationColumnSnapshotInput = {
    organizationId: string;
    datasetId: string;
    relationId: string;
    columnName: string;
    columnType: string;
    nullable?: string | null;
    detectedSemantic?: string | null;
    sampleValues?: string;
    summary?: string;
    ordinalPosition: number;
};

export class PostgresLocalFilesRepository {
    private db!: PostgresDBClient;

    async init() {
        try {
            const client = await getClient();
            if (!client) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
            this.db = client as PostgresDBClient;
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    async createDatasetWithRelations(input: {
        fileAsset: LocalFileAssetCreateInput;
        dataset: DatasetCreateInput;
        relations: Omit<DatasetRelationCreateInput, 'datasetId' | 'fileAssetId'>[];
    }) {
        return this.db.transaction(async tx => {
            const [fileAsset] = await tx.insert(fileAssets).values(input.fileAsset).returning();
            const [dataset] = await tx.insert(datasets).values(input.dataset).returning();
            if (!fileAsset || !dataset) {
                throw new DatabaseError('Failed to create local file dataset', 500);
            }

            const relationRows = input.relations.length
                ? await tx
                      .insert(datasetRelations)
                      .values(
                          input.relations.map(relation => ({
                              ...relation,
                              datasetId: dataset.id,
                              fileAssetId: fileAsset.id,
                          })),
                      )
                      .returning()
                : [];

            return {
                fileAsset,
                dataset,
                relations: relationRows,
            };
        });
    }

    async getDataset(organizationId: string, datasetId: string) {
        const [dataset] = await this.db
            .select()
            .from(datasets)
            .where(and(eq(datasets.organizationId, organizationId), eq(datasets.id, datasetId), isNull(datasets.deletedAt)))
            .limit(1);
        if (!dataset) return null;

        const relations = await this.db
            .select()
            .from(datasetRelations)
            .where(and(eq(datasetRelations.organizationId, organizationId), eq(datasetRelations.datasetId, datasetId), isNull(datasetRelations.deletedAt)));

        const assetIds = [...new Set(relations.map(relation => relation.fileAssetId))];
        const assets = assetIds.length ? await this.db.select().from(fileAssets).where(inArray(fileAssets.id, assetIds)) : [];

        return {
            dataset,
            relations,
            fileAssets: assets,
        };
    }

    async getDatasetByConnectionId(organizationId: string, connectionId: string) {
        const [dataset] = await this.db
            .select()
            .from(datasets)
            .where(and(eq(datasets.organizationId, organizationId), eq(datasets.connectionId, connectionId), isNull(datasets.deletedAt)))
            .limit(1);
        if (!dataset) return null;
        return this.getDataset(organizationId, dataset.id);
    }

    async replaceDatasetSourceAndRelations(
        organizationId: string,
        datasetId: string,
        input: {
            fileAsset: LocalFileAssetCreateInput;
            dataset: Pick<DatasetCreateInput, 'name'>;
            relations: Omit<DatasetRelationCreateInput, 'datasetId' | 'fileAssetId'>[];
        },
    ) {
        return this.db.transaction(async tx => {
            const [dataset] = await tx
                .update(datasets)
                .set({
                    name: input.dataset.name,
                    refreshStatus: 'idle',
                    lastRefreshError: null,
                })
                .where(and(eq(datasets.organizationId, organizationId), eq(datasets.id, datasetId), isNull(datasets.deletedAt)))
                .returning();

            if (!dataset) {
                throw new DatabaseError('Local Files dataset not found', 404);
            }

            const existingRelations = await tx
                .select()
                .from(datasetRelations)
                .where(and(eq(datasetRelations.organizationId, organizationId), eq(datasetRelations.datasetId, datasetId), isNull(datasetRelations.deletedAt)));

            const existingAssetIds = [...new Set(existingRelations.map(relation => relation.fileAssetId))];
            const [fileAsset] = existingAssetIds.length
                ? await tx
                      .update(fileAssets)
                      .set({
                          backend: input.fileAsset.backend,
                          sourceType: input.fileAsset.sourceType,
                          path: input.fileAsset.path,
                          storageKey: input.fileAsset.storageKey ?? null,
                          sizeBytes: input.fileAsset.sizeBytes ?? null,
                          mtimeMs: input.fileAsset.mtimeMs ?? null,
                          status: 'ready',
                          metadata: input.fileAsset.metadata ?? '{}',
                      })
                      .where(and(eq(fileAssets.organizationId, organizationId), eq(fileAssets.id, existingAssetIds[0])))
                      .returning()
                : await tx.insert(fileAssets).values(input.fileAsset).returning();

            if (!fileAsset) {
                throw new DatabaseError('Failed to update local file asset', 500);
            }

            const existingRelationIds = existingRelations.map(relation => relation.id);
            if (existingRelationIds.length) {
                await tx.delete(datasetRelationColumns).where(inArray(datasetRelationColumns.relationId, existingRelationIds));
                await tx
                    .update(datasetRelations)
                    .set({
                        deletedAt: new Date(),
                    })
                    .where(inArray(datasetRelations.id, existingRelationIds));
            }

            const relationRows = input.relations.length
                ? await tx
                      .insert(datasetRelations)
                      .values(
                          input.relations.map(relation => ({
                              ...relation,
                              datasetId,
                              fileAssetId: fileAsset.id,
                          })),
                      )
                      .returning()
                : [];

            return {
                fileAsset,
                dataset,
                relations: relationRows,
            };
        });
    }

    async replaceColumnSnapshots(relationId: string, columns: DatasetRelationColumnSnapshotInput[]) {
        await this.db.transaction(async tx => {
            await tx.delete(datasetRelationColumns).where(eq(datasetRelationColumns.relationId, relationId));
            if (columns.length) {
                await tx.insert(datasetRelationColumns).values(columns);
            }
        });
    }

    async markDatasetRefresh(organizationId: string, datasetId: string, input: { status: string; error?: string | null }) {
        await this.db
            .update(datasets)
            .set({
                refreshStatus: input.status,
                lastRefreshError: input.error ?? null,
                lastRefreshAt: input.status === 'success' ? new Date() : undefined,
            })
            .where(and(eq(datasets.organizationId, organizationId), eq(datasets.id, datasetId)));
    }

    async markRelationsRefreshed(relationIds: string[], input: { status: string; error?: string | null }) {
        if (!relationIds.length) return;
        await this.db
            .update(datasetRelations)
            .set({
                status: input.status,
                lastRefreshError: input.error ?? null,
                lastRefreshAt: input.status === 'ready' ? new Date() : undefined,
            })
            .where(inArray(datasetRelations.id, relationIds));
    }

    async updateRelationRefreshState(
        relationId: string,
        input: {
            status: string;
            sourceFingerprint?: string | null;
            lastSourceFingerprint?: string | null;
            schemaDriftStatus?: string;
            error?: string | null;
        },
    ) {
        await this.db
            .update(datasetRelations)
            .set({
                status: input.status,
                sourceFingerprint: input.sourceFingerprint ?? undefined,
                lastSourceFingerprint: input.lastSourceFingerprint ?? undefined,
                schemaDriftStatus: input.schemaDriftStatus ?? undefined,
                lastRefreshError: input.error ?? null,
                lastRefreshAt: input.status === 'ready' ? new Date() : undefined,
            })
            .where(eq(datasetRelations.id, relationId));
    }

    async createRefreshOperation(input: {
        organizationId: string;
        datasetId: string;
        relationId?: string | null;
        reason: string;
        sourceFingerprint?: string | null;
        previousSourceFingerprint?: string | null;
    }) {
        const [operation] = await this.db.insert(datasetRefreshOperations).values(input).returning();
        if (!operation) {
            throw new DatabaseError('Failed to create dataset refresh operation', 500);
        }
        return operation;
    }

    async finishRefreshOperation(
        operationId: string,
        input: {
            status: string;
            schemaDriftStatus?: string;
            sourceFingerprint?: string | null;
            previousSourceFingerprint?: string | null;
            error?: string | null;
        },
    ) {
        await this.db
            .update(datasetRefreshOperations)
            .set({
                status: input.status,
                schemaDriftStatus: input.schemaDriftStatus ?? undefined,
                sourceFingerprint: input.sourceFingerprint ?? undefined,
                previousSourceFingerprint: input.previousSourceFingerprint ?? undefined,
                error: input.error ?? null,
                finishedAt: new Date(),
            })
            .where(eq(datasetRefreshOperations.id, operationId));
    }

    async getColumnSnapshotsForConnectionRelation(organizationId: string, connectionId: string, tableRef: string) {
        const [schemaName, relationName] = tableRef.includes('.') ? tableRef.split('.', 2) : [null, tableRef];
        const datasetRows = await this.db
            .select()
            .from(datasets)
            .where(
                and(
                    eq(datasets.organizationId, organizationId),
                    eq(datasets.connectionId, connectionId),
                    schemaName ? eq(datasets.schemaName, schemaName) : isNull(datasets.deletedAt),
                    isNull(datasets.deletedAt),
                ),
            );
        if (!datasetRows.length) return null;

        const relationRows = await this.db
            .select()
            .from(datasetRelations)
            .where(
                and(
                    eq(datasetRelations.organizationId, organizationId),
                    inArray(
                        datasetRelations.datasetId,
                        datasetRows.map(dataset => dataset.id),
                    ),
                    eq(datasetRelations.relationName, relationName),
                    isNull(datasetRelations.deletedAt),
                ),
            )
            .limit(1);

        const relation = relationRows[0];
        if (!relation) return null;

        return this.db.select().from(datasetRelationColumns).where(eq(datasetRelationColumns.relationId, relation.id)).orderBy(datasetRelationColumns.ordinalPosition);
    }

    async getColumnSnapshotsForRelation(relationId: string) {
        return this.db.select().from(datasetRelationColumns).where(eq(datasetRelationColumns.relationId, relationId)).orderBy(datasetRelationColumns.ordinalPosition);
    }
}
