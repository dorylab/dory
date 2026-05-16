import fs from 'node:fs/promises';
import path from 'node:path';

import { buildReadSql, fingerprintSourceStat, inspectSource, normalizeDatasetSchemaName, normalizeRelationName, statSource } from '@dory/files';
import type { DBService } from '@dory/database';
import type { BaseConnection } from '@dory/drivers/core';
import type {
    DatasetColumnSnapshot,
    LocalFilesDatasetDetailResponse,
    LocalFileRelationManifest,
    LocalFileRelationMode,
    LocalFilesCreateRequest,
    LocalFilesInspectRequest,
    LocalFilesRefreshRequest,
    LocalFilesUpdateRequest,
} from '@dory/shared/types/local-files';
import { newEntityId } from '@dory/shared/id';
import { getRuntimeForServer, isDesktopRuntime } from '@dory/shared/runtime';

import { getOrCreateConnectionPool } from '@/lib/connection/connection-service';

type LocalFilesContext = {
    db: DBService;
    userId: string;
    organizationId: string;
};

type DescribeRow = {
    column_name?: string;
    column_type?: string;
    null?: string;
    nullable?: string;
};

type RefreshRelationInput = {
    id: string;
    datasetId: string;
    schemaName: string;
    relationName: string;
    previousSourceFingerprint?: string | null;
    manifest: LocalFileRelationManifest;
};

const DATASET_CONNECTION_OPTION_MODE = 'localFilesDataset';

function assertLocalFilesRuntime() {
    if (isDesktopRuntime()) return;

    const runtime = getRuntimeForServer();
    if (runtime && runtime !== 'web' && runtime !== 'docker') {
        throw new Error('Open Files are only available in desktop or self-hosted web runtime');
    }
}

function quoteIdentifier(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
}

function qualifiedRelation(schemaName: string, relationName: string) {
    return `${quoteIdentifier(schemaName)}.${quoteIdentifier(relationName)}`;
}

function physicalTableName(relationName: string) {
    return `_${normalizeRelationName(relationName)}_cache`;
}

function sourceDescriptorFromPath(backend: string, filePath: string) {
    if (backend !== 'serverPath') {
        throw new Error(`Unsupported file backend: ${backend}`);
    }
    return {
        backend: 'serverPath' as const,
        filePath,
    };
}

function localFilesConnectionOptions(input: { datasetId?: string | null; schemaName?: string | null; sourcePath: string; sourceType: string }) {
    return JSON.stringify({
        mode: DATASET_CONNECTION_OPTION_MODE,
        managedBy: 'local-files',
        createIfMissing: true,
        datasetId: input.datasetId ?? null,
        schemaName: input.schemaName ?? null,
        sourcePath: input.sourcePath,
        sourceType: input.sourceType,
    });
}

function getStorageRoot() {
    return process.env.DORY_LOCAL_FILES_STORAGE_DIR?.trim() || path.join(process.cwd(), 'localdata', 'local-files');
}

function getWorkspacePath(organizationId: string, connectionId?: string) {
    const safeOrganizationId = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (connectionId) {
        const safeConnectionId = connectionId.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(getStorageRoot(), safeOrganizationId, 'datasets', safeConnectionId, 'workspace.duckdb');
    }
    return path.join(getStorageRoot(), safeOrganizationId, 'workspace.duckdb');
}

function schemaNameForDataset(name: string, connectionId: string, explicitSchemaName?: string) {
    const base = normalizeDatasetSchemaName(explicitSchemaName || name);
    const suffix = connectionId
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-8)
        .toLowerCase();
    return normalizeDatasetSchemaName(`${base}_${suffix || 'dataset'}`);
}

function parseOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return {};
}

function safeJsonStringify(value: unknown) {
    return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
}

export function isLocalFilesDatasetConnection(connection: { type?: string | null; options?: string | null }) {
    if (connection.type !== 'duckdb') return false;
    const options = parseOptions(connection.options);
    return options.managedBy === 'local-files' && options.mode === DATASET_CONNECTION_OPTION_MODE;
}

async function cleanupIncompleteLocalFilesConnection(ctx: LocalFilesContext, name: string) {
    const existingConnections = await ctx.db.connections.list(ctx.organizationId);
    const incompleteConnection = existingConnections.find(item => {
        if (item.connection.name !== name || !isLocalFilesDatasetConnection(item.connection)) return false;
        const options = parseOptions(item.connection.options);
        return typeof options.datasetId !== 'string' || !options.datasetId;
    });
    if (!incompleteConnection?.connection.id) return;
    await ctx.db.connections.delete(ctx.organizationId, incompleteConnection.connection.id);
}

function inferSemantic(columnName: string, columnType: string): string | null {
    const name = columnName.toLowerCase();
    const type = columnType.toLowerCase();
    if (/(^|_)id$/.test(name) || name.endsWith('_id')) return 'identifier';
    if (name.includes('email')) return 'email';
    if (name.includes('phone')) return 'phone';
    if (name.includes('url') || name.includes('uri')) return 'url';
    if (name.includes('date') || name.includes('time') || type.includes('date') || type.includes('time')) return 'temporal';
    if (name.includes('amount') || name.includes('price') || name.includes('cost') || name.includes('revenue')) return 'money';
    if (type.includes('int') || type.includes('double') || type.includes('decimal') || type.includes('float')) return 'numeric';
    return null;
}

async function getWorkspaceConnection(ctx: LocalFilesContext, connectionId: string): Promise<BaseConnection> {
    const poolEntry = await getOrCreateConnectionPool(ctx.organizationId, connectionId);
    if (!poolEntry) {
        throw new Error('Failed to initialize Local Files DuckDB workspace');
    }
    return poolEntry.instance;
}

async function loadDuckDbExtensions(connection: BaseConnection) {
    try {
        await connection.command('INSTALL excel');
    } catch {
        // Extension may already be installed or unavailable in offline deployments.
    }
    try {
        await connection.command('LOAD excel');
    } catch {
        // CSV/JSON/Parquet still work without the Excel extension.
    }
}

async function createOrReplaceRelationViews(connection: BaseConnection, schemaName: string, relations: LocalFileRelationManifest[]) {
    await connection.command(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`);
    for (const relation of relations) {
        await materializeRelation(connection, schemaName, relation);
    }
}

async function materializeRelation(connection: BaseConnection, schemaName: string, relation: LocalFileRelationManifest) {
    const relationName = normalizeRelationName(relation.relationName);
    if (relation.mode === 'materialized') {
        throw new Error('Materialized Local Files relations are reserved for a future release');
    }

    await connection.command(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`);

    if (relation.mode === 'cached') {
        const tableName = physicalTableName(relationName);
        await connection.command(`CREATE OR REPLACE TABLE ${qualifiedRelation(schemaName, tableName)} AS ${buildReadSql({ ...relation, relationName })}`);
        await connection.command(`CREATE OR REPLACE VIEW ${qualifiedRelation(schemaName, relationName)} AS SELECT * FROM ${qualifiedRelation(schemaName, tableName)}`);
        return;
    }

    await connection.command(`CREATE OR REPLACE VIEW ${qualifiedRelation(schemaName, relationName)} AS ${buildReadSql({ ...relation, relationName })}`);
}

async function dropRelation(connection: BaseConnection, schemaName: string, relation: { relationName: string; mode?: string | null; physicalTableName?: string | null }) {
    const relationName = normalizeRelationName(relation.relationName);
    await connection.command(`DROP VIEW IF EXISTS ${qualifiedRelation(schemaName, relationName)}`);
    if (relation.mode === 'cached') {
        await connection.command(`DROP TABLE IF EXISTS ${qualifiedRelation(schemaName, relation.physicalTableName ?? physicalTableName(relationName))}`);
    }
}

function parseNullable(value: string | undefined): boolean | null {
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (normalized === 'yes' || normalized === 'true') return true;
    if (normalized === 'no' || normalized === 'false') return false;
    return null;
}

async function collectColumnSnapshots(connection: BaseConnection, schemaName: string, relationName: string): Promise<DatasetColumnSnapshot[]> {
    const qualified = qualifiedRelation(schemaName, relationName);
    const describe = await connection.query<DescribeRow>(`DESCRIBE SELECT * FROM ${qualified}`);
    const summarize = await connection.query<Record<string, unknown>>(`SUMMARIZE SELECT * FROM ${qualified}`);
    const summaryByColumn = new Map<string, Record<string, unknown>>();
    for (const row of summarize.rows ?? []) {
        const name = String(row.column_name ?? row.name ?? '');
        if (name) summaryByColumn.set(name, row);
    }

    const snapshots: DatasetColumnSnapshot[] = [];
    for (const row of describe.rows ?? []) {
        const name = row.column_name;
        if (!name) continue;
        const type = row.column_type ?? 'UNKNOWN';
        const sampleResult = await connection.query<{ value: unknown }>(
            `SELECT DISTINCT ${quoteIdentifier(name)} AS value FROM ${qualified} WHERE ${quoteIdentifier(name)} IS NOT NULL LIMIT 5`,
        );
        snapshots.push({
            name,
            type,
            nullable: parseNullable(row.null ?? row.nullable),
            detectedSemantic: inferSemantic(name, type),
            sampleValues: (sampleResult.rows ?? []).map(sample => sample.value),
            summary: summaryByColumn.get(name) ?? null,
        });
    }

    return snapshots;
}

async function refreshSnapshots(ctx: LocalFilesContext, connection: BaseConnection, datasetId: string, schemaName: string, relations: Array<{ id: string; relationName: string }>) {
    for (const relation of relations) {
        const snapshots = await collectColumnSnapshots(connection, schemaName, relation.relationName);
        await ctx.db.localFiles.replaceColumnSnapshots(
            relation.id,
            snapshots.map((snapshot, index) => ({
                organizationId: ctx.organizationId,
                datasetId,
                relationId: relation.id,
                columnName: snapshot.name,
                columnType: snapshot.type,
                nullable: snapshot.nullable == null ? null : snapshot.nullable ? 'true' : 'false',
                detectedSemantic: snapshot.detectedSemantic,
                sampleValues: safeJsonStringify(snapshot.sampleValues),
                summary: safeJsonStringify(snapshot.summary ?? {}),
                ordinalPosition: index,
            })),
        );
    }
}

function columnSignature(columns: DatasetColumnSnapshot[]) {
    return columns.map(column => `${column.name}:${column.type}:${column.nullable}`).join('|');
}

function existingColumnSignature(rows: Array<{ columnName: string; columnType: string; nullable: string | null }>) {
    return rows.map(column => `${column.columnName}:${column.columnType}:${column.nullable == null ? 'null' : column.nullable === 'true'}`).join('|');
}

async function runRefreshPipeline(ctx: LocalFilesContext, connection: BaseConnection, relation: RefreshRelationInput, reason: string) {
    const stat = await statSource(relation.manifest.source);
    const sourceFingerprint = fingerprintSourceStat(stat);
    const operation = await ctx.db.localFiles.createRefreshOperation({
        organizationId: ctx.organizationId,
        datasetId: relation.datasetId,
        relationId: relation.id,
        reason,
        sourceFingerprint,
        previousSourceFingerprint: relation.previousSourceFingerprint ?? null,
    });

    try {
        const manifest = {
            ...relation.manifest,
            sourceFingerprint,
        };
        await materializeRelation(connection, relation.schemaName, manifest);

        const nextSnapshots = await collectColumnSnapshots(connection, relation.schemaName, relation.relationName);
        const previousSnapshots = await ctx.db.localFiles.getColumnSnapshotsForRelation(relation.id);
        const schemaDriftStatus = previousSnapshots?.length && existingColumnSignature(previousSnapshots) !== columnSignature(nextSnapshots) ? 'changed' : 'none';

        await ctx.db.localFiles.replaceColumnSnapshots(
            relation.id,
            nextSnapshots.map((snapshot, index) => ({
                organizationId: ctx.organizationId,
                datasetId: relation.datasetId,
                relationId: relation.id,
                columnName: snapshot.name,
                columnType: snapshot.type,
                nullable: snapshot.nullable == null ? null : snapshot.nullable ? 'true' : 'false',
                detectedSemantic: snapshot.detectedSemantic,
                sampleValues: safeJsonStringify(snapshot.sampleValues),
                summary: safeJsonStringify(snapshot.summary ?? {}),
                ordinalPosition: index,
            })),
        );
        await ctx.db.localFiles.updateRelationRefreshState(relation.id, {
            status: 'ready',
            sourceFingerprint,
            lastSourceFingerprint: sourceFingerprint,
            schemaDriftStatus,
        });
        await ctx.db.localFiles.finishRefreshOperation(operation.id, {
            status: 'success',
            schemaDriftStatus,
            sourceFingerprint,
            previousSourceFingerprint: relation.previousSourceFingerprint ?? null,
        });

        return { schemaDriftStatus, sourceFingerprint };
    } catch (error: any) {
        const message = error?.message ?? String(error);
        await ctx.db.localFiles.updateRelationRefreshState(relation.id, {
            status: 'error',
            sourceFingerprint,
            schemaDriftStatus: 'unknown',
            error: message,
        });
        await ctx.db.localFiles.finishRefreshOperation(operation.id, {
            status: 'error',
            schemaDriftStatus: 'unknown',
            sourceFingerprint,
            previousSourceFingerprint: relation.previousSourceFingerprint ?? null,
            error: message,
        });
        throw error;
    }
}

export async function inspectLocalFiles(ctx: LocalFilesContext, request: LocalFilesInspectRequest) {
    assertLocalFilesRuntime();
    const source = await statSource(request.source);
    const relations = await inspectSource(request.source);
    return {
        source,
        relations,
    };
}

export async function createLocalFilesDataset(ctx: LocalFilesContext, request: LocalFilesCreateRequest) {
    assertLocalFilesRuntime();
    const source = await statSource(request.source);
    const connectionId = newEntityId();
    const workspacePath = getWorkspacePath(ctx.organizationId, connectionId);
    await fs.mkdir(path.dirname(workspacePath), { recursive: true });
    await cleanupIncompleteLocalFilesConnection(ctx, request.name.trim());
    let visibleConnection = await ctx.db.connections.create(ctx.userId, ctx.organizationId, {
        connection: {
            id: connectionId,
            type: 'duckdb',
            engine: 'duckdb',
            name: request.name.trim(),
            description: 'Open Files dataset',
            host: null,
            port: null,
            httpPort: null,
            database: null,
            path: workspacePath,
            options: localFilesConnectionOptions({
                sourcePath: source.path,
                sourceType: source.sourceType,
            }),
            status: 'Connected',
            environment: 'local-files',
            tags: 'local-files',
        },
        identities: [
            {
                name: 'DuckDB',
                username: 'duckdb',
                role: null,
                isDefault: true,
                database: null,
            },
        ],
        ssh: {
            enabled: false,
            host: null,
            port: null,
            username: null,
            authMethod: null,
        },
    } as any);

    try {
        const connection = await getWorkspaceConnection(ctx, visibleConnection.connection.id);
        await loadDuckDbExtensions(connection);

        const schemaName = schemaNameForDataset(request.name, visibleConnection.connection.id, request.schemaName);
        const requestedMode: LocalFileRelationMode = request.mode ?? 'virtual';
        const relations = request.relations.map(relation => ({
            ...relation,
            relationName: normalizeRelationName(relation.relationName),
            mode: relation.mode ?? requestedMode,
        }));

        const created = await ctx.db.localFiles.createDatasetWithRelations({
            fileAsset: {
                organizationId: ctx.organizationId,
                createdByUserId: ctx.userId,
                backend: source.backend,
                sourceType: source.sourceType,
                path: source.path,
                sizeBytes: String(source.sizeBytes),
                mtimeMs: String(Math.round(source.mtimeMs)),
            },
            dataset: {
                organizationId: ctx.organizationId,
                createdByUserId: ctx.userId,
                connectionId: visibleConnection.connection.id,
                name: request.name.trim(),
                schemaName,
            },
            relations: relations.map(relation => ({
                organizationId: ctx.organizationId,
                sourceType: relation.sourceType,
                sheetName: relation.sheetName ?? null,
                relationName: relation.relationName,
                mode: relation.mode,
                duckdbSchema: schemaName,
                duckdbRelation: relation.relationName,
                physicalTableName: relation.mode === 'cached' ? physicalTableName(relation.relationName) : null,
                sourceFingerprint: relation.sourceFingerprint,
                lastSourceFingerprint: null,
                schemaDriftStatus: 'unknown',
                refreshStrategy: 'manual',
                readSql: buildReadSql(relation),
            })),
        });

        for (const createdRelation of created.relations) {
            const manifest = relations.find(relation => relation.relationName === createdRelation.relationName);
            if (!manifest) continue;
            await runRefreshPipeline(
                ctx,
                connection,
                {
                    id: createdRelation.id,
                    datasetId: created.dataset.id,
                    schemaName,
                    relationName: createdRelation.relationName,
                    previousSourceFingerprint: null,
                    manifest,
                },
                'create',
            );
        }
        await ctx.db.localFiles.markDatasetRefresh(ctx.organizationId, created.dataset.id, { status: 'success' });
        await ctx.db.localFiles.markRelationsRefreshed(
            created.relations.map(relation => relation.id),
            { status: 'ready' },
        );
        visibleConnection = await ctx.db.connections.patchConnectionFields(ctx.organizationId, visibleConnection.connection.id, {
            options: localFilesConnectionOptions({
                datasetId: created.dataset.id,
                schemaName: created.dataset.schemaName,
                sourcePath: source.path,
                sourceType: source.sourceType,
            }),
        });

        return {
            connection: visibleConnection,
            dataset: created.dataset,
            fileAsset: created.fileAsset,
            relations: created.relations,
        };
    } catch (error) {
        await ctx.db.connections.delete(ctx.organizationId, visibleConnection.connection.id).catch(cleanupError => {
            console.warn('[local-files] failed to clean up incomplete dataset connection:', cleanupError);
        });
        throw error;
    }
}

function toDatasetDetail(record: {
    dataset: {
        id: string;
        connectionId: string;
        name: string;
        schemaName: string;
        status: string;
        refreshStatus: string;
    };
    relations: Array<{
        fileAssetId: string;
        sourceType: string;
        sheetName: string | null;
        relationName: string;
        mode: string;
        sourceFingerprint: string | null;
    }>;
    fileAssets: Array<{
        id: string;
        backend: string;
        sourceType: string;
        path: string;
        sizeBytes: string | null;
        mtimeMs: string | null;
    }>;
}): LocalFilesDatasetDetailResponse {
    const firstAsset = record.fileAssets[0];
    if (!firstAsset) {
        throw new Error('Local Files source asset not found');
    }
    const assetById = new Map(record.fileAssets.map(asset => [asset.id, asset]));
    const source: LocalFilesDatasetDetailResponse['source'] = {
        backend: firstAsset.backend as LocalFilesDatasetDetailResponse['source']['backend'],
        path: firstAsset.path,
        sizeBytes: Number(firstAsset.sizeBytes ?? 0),
        mtimeMs: Number(firstAsset.mtimeMs ?? 0),
        sourceType: firstAsset.sourceType as LocalFilesDatasetDetailResponse['source']['sourceType'],
    };

    return {
        dataset: {
            id: record.dataset.id,
            connectionId: record.dataset.connectionId,
            name: record.dataset.name,
            schemaName: record.dataset.schemaName,
            status: record.dataset.status,
            refreshStatus: record.dataset.refreshStatus,
        },
        source,
        relations: record.relations.map(relation => {
            const asset = assetById.get(relation.fileAssetId) ?? firstAsset;
            return {
                sourceType: relation.sourceType as LocalFileRelationManifest['sourceType'],
                source: sourceDescriptorFromPath(asset.backend, asset.path),
                duckdbPath: asset.path,
                sheetName: relation.sheetName ?? undefined,
                relationName: relation.relationName,
                mode: relation.mode as LocalFileRelationMode,
                sourceFingerprint: relation.sourceFingerprint ?? '',
            };
        }),
    };
}

export async function getLocalFilesDataset(ctx: LocalFilesContext, request: { datasetId?: string | null; connectionId?: string | null }) {
    assertLocalFilesRuntime();
    const record =
        (request.connectionId ? await ctx.db.localFiles.getDatasetByConnectionId(ctx.organizationId, request.connectionId) : null) ??
        (request.datasetId ? await ctx.db.localFiles.getDataset(ctx.organizationId, request.datasetId) : null);
    if (!record) {
        throw new Error('Local Files dataset not found');
    }
    return toDatasetDetail(record);
}

export async function updateLocalFilesDataset(ctx: LocalFilesContext, datasetId: string, request: LocalFilesUpdateRequest) {
    assertLocalFilesRuntime();
    const existing = await ctx.db.localFiles.getDataset(ctx.organizationId, datasetId);
    if (!existing) {
        throw new Error('Local Files dataset not found');
    }

    const source = await statSource(request.source);
    const connection = await getWorkspaceConnection(ctx, existing.dataset.connectionId);
    await loadDuckDbExtensions(connection);

    for (const relation of existing.relations) {
        await dropRelation(connection, existing.dataset.schemaName, relation);
    }

    const requestedMode: LocalFileRelationMode = request.mode ?? 'virtual';
    const sourceFingerprint = fingerprintSourceStat(source);
    const relations = request.relations.map(relation => ({
        ...relation,
        source: request.source,
        duckdbPath: source.path,
        sourceFingerprint,
        sourceType: source.sourceType,
        relationName: normalizeRelationName(relation.relationName),
        mode: relation.mode ?? requestedMode,
    }));

    const updated = await ctx.db.localFiles.replaceDatasetSourceAndRelations(ctx.organizationId, datasetId, {
        fileAsset: {
            organizationId: ctx.organizationId,
            createdByUserId: ctx.userId,
            backend: source.backend,
            sourceType: source.sourceType,
            path: source.path,
            sizeBytes: String(source.sizeBytes),
            mtimeMs: String(Math.round(source.mtimeMs)),
        },
        dataset: {
            name: request.name.trim(),
        },
        relations: relations.map(relation => ({
            organizationId: ctx.organizationId,
            sourceType: relation.sourceType,
            sheetName: relation.sheetName ?? null,
            relationName: relation.relationName,
            mode: relation.mode,
            duckdbSchema: existing.dataset.schemaName,
            duckdbRelation: relation.relationName,
            physicalTableName: relation.mode === 'cached' ? physicalTableName(relation.relationName) : null,
            sourceFingerprint: relation.sourceFingerprint,
            lastSourceFingerprint: null,
            schemaDriftStatus: 'unknown',
            refreshStrategy: 'manual',
            readSql: buildReadSql(relation),
        })),
    });

    for (const updatedRelation of updated.relations) {
        const manifest = relations.find(relation => relation.relationName === updatedRelation.relationName);
        if (!manifest) continue;
        await runRefreshPipeline(
            ctx,
            connection,
            {
                id: updatedRelation.id,
                datasetId: updated.dataset.id,
                schemaName: updated.dataset.schemaName,
                relationName: updatedRelation.relationName,
                previousSourceFingerprint: null,
                manifest,
            },
            'manual',
        );
    }
    await ctx.db.localFiles.markDatasetRefresh(ctx.organizationId, updated.dataset.id, { status: 'success' });
    await ctx.db.localFiles.markRelationsRefreshed(
        updated.relations.map(relation => relation.id),
        { status: 'ready' },
    );
    const connectionItem = await ctx.db.connections.patchConnectionFields(ctx.organizationId, updated.dataset.connectionId, {
        name: updated.dataset.name,
        options: localFilesConnectionOptions({
            datasetId: updated.dataset.id,
            schemaName: updated.dataset.schemaName,
            sourcePath: source.path,
            sourceType: source.sourceType,
        }),
    });

    return {
        connection: connectionItem,
        dataset: updated.dataset,
        fileAsset: updated.fileAsset,
        relations: updated.relations,
    };
}

export async function refreshLocalFilesDataset(ctx: LocalFilesContext, request: LocalFilesRefreshRequest) {
    assertLocalFilesRuntime();
    const record = await ctx.db.localFiles.getDataset(ctx.organizationId, request.datasetId);
    if (!record) {
        throw new Error('Local Files dataset not found');
    }

    const connection = await getWorkspaceConnection(ctx, record.dataset.connectionId);
    await loadDuckDbExtensions(connection);

    const relations = record.relations.map(relation => {
        const asset = record.fileAssets.find(item => item.id === relation.fileAssetId);
        return {
            sourceType: relation.sourceType as LocalFileRelationManifest['sourceType'],
            source: {
                backend: 'serverPath' as const,
                filePath: asset?.path ?? '',
            },
            duckdbPath: asset?.path ?? '',
            sheetName: relation.sheetName ?? undefined,
            relationName: relation.relationName,
            mode: relation.mode as LocalFileRelationMode,
            sourceFingerprint: relation.sourceFingerprint ?? '',
            previousSourceFingerprint: relation.lastSourceFingerprint,
            id: relation.id,
        };
    });
    if (relations.some(relation => !relation.duckdbPath)) {
        throw new Error('Local Files source asset not found');
    }

    for (const relation of relations) {
        await runRefreshPipeline(
            ctx,
            connection,
            {
                id: relation.id,
                datasetId: record.dataset.id,
                schemaName: record.dataset.schemaName,
                relationName: relation.relationName,
                previousSourceFingerprint: relation.previousSourceFingerprint,
                manifest: relation,
            },
            'manual',
        );
    }
    await ctx.db.localFiles.markDatasetRefresh(ctx.organizationId, record.dataset.id, { status: 'success' });
    await ctx.db.localFiles.markRelationsRefreshed(
        record.relations.map(relation => relation.id),
        { status: 'ready' },
    );

    return record;
}
