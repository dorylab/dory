import { getDoryArtifactStore, type ComparisonSnapshotArtifactRef } from '@dory/artifacts';
import type { DBService } from '@dory/database';
import {
    compareSchemaSnapshots,
    schemaChangesToResultRows,
    schemaDialectFamily,
    stableSchemaHash,
    type ComparisonEndpoint,
    type SchemaComparisonResult,
} from '@dory/schema-compare';

import { ensureConnectionPoolForUser } from '@/lib/connection/utils';

export type CreateSchemaComparisonInput = {
    organizationId: string;
    userId: string;
    current: ComparisonEndpoint;
    desired: ComparisonEndpoint;
    workId?: string | null;
    previousComparisonId?: string | null;
};

export type CreateSchemaComparisonOutput = {
    job: Awaited<ReturnType<DBService['comparisons']['get']>>;
    comparison: SchemaComparisonResult;
    topChanges: SchemaComparisonResult['changes'];
};

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
    return 'comparison_failed';
}

export async function createSchemaComparison(db: DBService, input: CreateSchemaComparisonInput): Promise<CreateSchemaComparisonOutput> {
    await db.comparisons.markStaleRunningFailed(new Date(Date.now() - 15 * 60 * 1000)).catch(() => undefined);
    if (input.workId) {
        const work = await db.works.getById({
            organizationId: input.organizationId,
            userId: input.userId,
            workId: input.workId,
        });
        if (!work) throw new Error('Agent Run not found in this organization.');
    }

    const [currentRecord, desiredRecord] = await Promise.all([
        db.connections.getById(input.organizationId, input.current.connectionId),
        db.connections.getById(input.organizationId, input.desired.connectionId),
    ]);
    if (!currentRecord || !desiredRecord) throw new Error('One or both comparison connections were not found.');

    const currentFamily = schemaDialectFamily(currentRecord.connection.type);
    const desiredFamily = schemaDialectFamily(desiredRecord.connection.type);
    if (!currentFamily || !desiredFamily || currentFamily !== desiredFamily) {
        throw new Error(`Schema Compare requires the same dialect family. Current is ${currentRecord.connection.type}; Desired is ${desiredRecord.connection.type}.`);
    }

    const job = await db.comparisons.create({
        organizationId: input.organizationId,
        userId: input.userId,
        currentEndpoint: input.current,
        desiredEndpoint: input.desired,
        dialectFamily: currentFamily,
        workId: input.workId,
        previousComparisonId: input.previousComparisonId,
    });
    let snapshotArtifactRef: ComparisonSnapshotArtifactRef | null = null;
    let resultSetId: string | null = null;

    try {
        const [currentPool, desiredPool] = await Promise.all([
            ensureConnectionPoolForUser(input.userId, input.organizationId, input.current.connectionId, input.current.identityId ?? null),
            ensureConnectionPoolForUser(input.userId, input.organizationId, input.desired.connectionId, input.desired.identityId ?? null),
        ]);
        const [currentSnapshot, desiredSnapshot] = await Promise.all([
            currentPool.entry.instance.getSchemaSnapshot({
                database: input.current.database,
                schemas: input.current.schemas,
            }),
            desiredPool.entry.instance.getSchemaSnapshot({
                database: input.desired.database,
                schemas: input.desired.schemas,
            }),
        ]);
        const comparison = compareSchemaSnapshots(currentSnapshot, desiredSnapshot);
        snapshotArtifactRef = await getDoryArtifactStore().comparisons.putSnapshots({
            organizationId: input.organizationId,
            comparisonId: job.id,
            current: currentSnapshot,
            desired: desiredSnapshot,
        });
        await db.comparisons.setArtifacts({
            organizationId: input.organizationId,
            comparisonId: job.id,
            snapshotArtifactRef,
            currentSnapshotHash: currentSnapshot.contentHash,
            desiredSnapshotHash: desiredSnapshot.contentHash,
        });
        const persisted = await db.resultSets.persistDerivedResultSet({
            organizationId: input.organizationId,
            userId: input.userId,
            comparisonId: job.id,
            rows: schemaChangesToResultRows(comparison.changes),
            kind: 'schema-diff',
            workId: input.workId,
            agentRunId: input.workId,
            sourceConnectionType: currentFamily,
            sourceDatabaseName: `${input.current.database} → ${input.desired.database}`,
            contentHash: stableSchemaHash(comparison),
        });
        resultSetId = persisted.resultSetId;
        await db.comparisons.setArtifacts({
            organizationId: input.organizationId,
            comparisonId: job.id,
            resultSetId,
        });
        const completed = await db.comparisons.complete({
            organizationId: input.organizationId,
            comparisonId: job.id,
            comparison,
            snapshotArtifactRef,
            resultSetId,
            expiresAt: new Date(persisted.expiresAt),
        });
        return {
            job: completed,
            comparison,
            topChanges: comparison.changes.slice(0, 20),
        };
    } catch (error) {
        if (resultSetId) {
            await db.resultSets
                .deleteResultSet({
                    organizationId: input.organizationId,
                    resultSetId,
                })
                .catch(() => undefined);
        }
        if (snapshotArtifactRef) {
            await getDoryArtifactStore()
                .comparisons.deleteComparison(snapshotArtifactRef)
                .catch(() => undefined);
        }
        await db.comparisons
            .fail({
                organizationId: input.organizationId,
                comparisonId: job.id,
                code: errorCode(error),
                message: errorMessage(error),
            })
            .catch(() => undefined);
        throw error;
    }
}
