import fs from 'node:fs/promises';
import path from 'node:path';

import { buildReadSql, fingerprintSourceStat, inspectSource, normalizeDatasetSchemaName, normalizeRelationName, statSource } from '@dory/files';
import type { DBService } from '@dory/database';
import type { BaseConnection } from '@dory/drivers/core';
import type {
    DatasetColumnSnapshot,
    LocalFileRelationManifest,
    LocalFileRelationMode,
    LocalFilesCreateRequest,
    LocalFilesInspectRequest,
    LocalFilesRefreshRequest,
} from '@dory/shared/types/local-files';
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

const WORKSPACE_CONNECTION_OPTION_MODE = 'localFilesWorkspace';

function assertSelfHostedNodeRuntime() {
    if (isDesktopRuntime()) {
        throw new Error('Local Files are only available in self-hosted web runtime');
    }
    const runtime = getRuntimeForServer();
    if (runtime && runtime !== 'web' && runtime !== 'docker') {
        throw new Error('Local Files are only available in self-hosted web runtime');
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

function getStorageRoot() {
    return process.env.DORY_LOCAL_FILES_STORAGE_DIR?.trim() || path.join(process.cwd(), 'localdata', 'local-files');
}

function getWorkspacePath(organizationId: string) {
    const safeOrganizationId = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(getStorageRoot(), safeOrganizationId, 'workspace.duckdb');
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

function isLocalFilesWorkspaceConnection(connection: { type?: string | null; options?: string | null }) {
    if (connection.type !== 'duckdb') return false;
    return parseOptions(connection.options).mode === WORKSPACE_CONNECTION_OPTION_MODE;
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

async function ensureWorkspaceConnection(ctx: LocalFilesContext) {
    const existing = (await ctx.db.connections.list(ctx.organizationId)).find(item => isLocalFilesWorkspaceConnection(item.connection));
    if (existing) {
        await fs.mkdir(path.dirname(existing.connection.path ?? getWorkspacePath(ctx.organizationId)), { recursive: true });
        return existing;
    }

    const workspacePath = getWorkspacePath(ctx.organizationId);
    await fs.mkdir(path.dirname(workspacePath), { recursive: true });

    return ctx.db.connections.create(ctx.userId, ctx.organizationId, {
        connection: {
            type: 'duckdb',
            engine: 'duckdb',
            name: `Local Files Workspace ${ctx.organizationId.slice(0, 8)}`,
            description: 'Dory-managed DuckDB workspace for Local Files datasets',
            host: null,
            port: null,
            httpPort: null,
            database: null,
            path: workspacePath,
            options: JSON.stringify({
                mode: WORKSPACE_CONNECTION_OPTION_MODE,
                createIfMissing: true,
                managedBy: 'local-files',
            }),
            status: 'Connected',
            environment: 'local-files',
            tags: 'local-files,managed',
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
    assertSelfHostedNodeRuntime();
    const source = await statSource(request.source);
    const relations = await inspectSource(request.source);
    return {
        source,
        relations,
    };
}

export async function createLocalFilesDataset(ctx: LocalFilesContext, request: LocalFilesCreateRequest) {
    assertSelfHostedNodeRuntime();
    const source = await statSource(request.source);
    const workspace = await ensureWorkspaceConnection(ctx);
    const connection = await getWorkspaceConnection(ctx, workspace.connection.id);
    await loadDuckDbExtensions(connection);

    const schemaName = normalizeDatasetSchemaName(request.schemaName || request.name);
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
            connectionId: workspace.connection.id,
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

    return {
        connection: workspace,
        dataset: created.dataset,
        fileAsset: created.fileAsset,
        relations: created.relations,
    };
}

export async function refreshLocalFilesDataset(ctx: LocalFilesContext, request: LocalFilesRefreshRequest) {
    assertSelfHostedNodeRuntime();
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
