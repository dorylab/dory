import 'server-only';

import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getDoryArtifactStore } from '@dory/artifacts';
import type { DBService } from '@dory/database';
import { createExportWriter, hashExportPlan, parseExportPlan, type ExportPlan, type TableExportPlanV1 } from '@dory/export';

import { getOrCreateConnectionPool } from '@/lib/connection/connection-service';

const EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['queued', 'running']);

type ExportRun = NonNullable<Awaited<ReturnType<DBService['exportRuns']['get']>>>;

export class ExportServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string,
    ) {
        super(message);
        this.name = 'ExportServiceError';
    }
}

function safeFilePart(value: string) {
    const normalized = value
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'table';
}

function exportFileName(plan: ExportPlan, now = new Date()) {
    const stamp = now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
    const extension = plan.output.format === 'arrow' ? 'arrow' : plan.output.format;
    return `${safeFilePart(plan.source.table)}-${stamp}.${extension}`;
}

function columnNames(columns: Array<{ columnName: string }>) {
    return columns.map(column => column.columnName);
}

function consistencyForDriver(driverType: string) {
    if (driverType === 'postgres' || driverType === 'neon' || driverType === 'supabase') return 'postgres-statement-snapshot';
    if (driverType === 'mysql' || driverType === 'mariadb') return 'mysql-consistent-read';
    if (driverType === 'sqlite' || driverType === 'duckdb') return 'read-transaction';
    return 'driver-statement-snapshot';
}

async function validatePlanForOrganization(organizationId: string, plan: ExportPlan) {
    const pool = await getOrCreateConnectionPool(organizationId, plan.source.connectionId);
    if (!pool) throw new ExportServiceError('Export connection is unavailable', 404, 'EXPORT_CONNECTION_UNAVAILABLE');
    const availableColumns = columnNames(await pool.instance.describeTable(plan.source.database, plan.source.table));
    const available = new Set(availableColumns);
    const referenced = [
        ...plan.columns,
        ...plan.operations.filters.map(filter => filter.col),
        ...plan.operations.searchColumns,
        ...(plan.operations.sort ? [plan.operations.sort.column] : []),
    ];
    if (new Set(plan.columns).size !== plan.columns.length) throw new ExportServiceError('Export columns cannot contain duplicates', 400, 'EXPORT_COLUMNS_INVALID');
    const missing = Array.from(new Set(referenced.filter(column => !available.has(column))));
    if (missing.length) throw new ExportServiceError(`The table schema changed; missing columns: ${missing.join(', ')}`, 409, 'EXPORT_SCHEMA_CHANGED');
    return pool;
}

export async function createTableExportRun(db: DBService, input: { organizationId: string; userId: string; plan: unknown }) {
    const plan = parseExportPlan(input.plan);
    await validatePlanForOrganization(input.organizationId, plan);
    const run = await db.exportRuns.create({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        connectionId: plan.source.connectionId,
        databaseName: plan.source.database,
        tableName: plan.source.table,
        plan,
        planHash: hashExportPlan(plan),
    });
    await db.exportRuns.appendEvent(input.organizationId, run.id, 'run.queued', { format: plan.output.format });
    getExportRunner(db).wake();
    return serializeRun(run);
}

export async function listTableExportRuns(
    db: DBService,
    input: { organizationId: string; connectionId: string; databaseName: string; tableName: string; limit: number; cursor?: string | null },
) {
    getExportRunner(db).wake();
    const cursor = decodeCursor(input.cursor);
    const rows = await db.exportRuns.listTable({ ...input, cursor });
    return {
        rows: rows.map(serializeRun),
        nextCursor: rows.length === input.limit ? encodeCursor(rows[rows.length - 1]!) : null,
    };
}

export async function cancelTableExportRun(db: DBService, organizationId: string, connectionId: string, runId: string) {
    const run = await db.exportRuns.get(organizationId, runId);
    if (!run) throw new ExportServiceError('Export run not found', 404, 'EXPORT_RUN_NOT_FOUND');
    if (run.connectionId !== connectionId) throw new ExportServiceError('Export run not found', 404, 'EXPORT_RUN_NOT_FOUND');
    if (!ACTIVE_STATUSES.has(run.status)) return serializeRun(run);
    if (run.status === 'queued') {
        const canceled = await db.exportRuns.update(organizationId, runId, { status: 'canceled', phase: 'canceled', cancelRequested: true, completedAt: new Date() });
        await db.exportRuns.appendEvent(organizationId, runId, 'run.canceled', {});
        return serializeRun(canceled);
    }
    const updated = await db.exportRuns.update(organizationId, runId, { cancelRequested: true });
    getExportRunner(db).cancel(runId);
    await db.exportRuns.appendEvent(organizationId, runId, 'cancel.requested', {});
    return serializeRun(updated);
}

export async function openTableExport(db: DBService, organizationId: string, exportId: string) {
    const run = await db.exportRuns.get(organizationId, exportId);
    if (!run || run.status !== 'completed' || !run.objectPath || !run.fileName || !run.contentType) {
        throw new ExportServiceError('Export file not found', 404, 'EXPORT_FILE_NOT_FOUND');
    }
    if (!run.artifactExpiresAt || run.artifactExpiresAt.getTime() <= Date.now()) {
        throw new ExportServiceError('Export file has expired', 404, 'EXPORT_FILE_EXPIRED');
    }
    const artifacts = getDoryArtifactStore().exportRuns;
    if (!(await artifacts.exists(run.objectPath))) throw new ExportServiceError('Export file not found', 404, 'EXPORT_FILE_NOT_FOUND');
    return {
        stream: await artifacts.get(run.objectPath),
        fileName: run.fileName,
        contentType: run.contentType,
        byteSize: run.byteSize ?? undefined,
    };
}

class ExportRunner {
    private pumping = false;
    private readonly controllers = new Map<string, AbortController>();

    constructor(private readonly db: DBService) {}

    wake() {
        void this.recoverAndPump();
    }

    cancel(runId: string) {
        this.controllers.get(runId)?.abort(new DOMException('The export was canceled', 'AbortError'));
    }

    private async recoverAndPump() {
        const stale = await this.db.exportRuns.listStaleRunning(new Date(Date.now() - 30_000));
        for (const run of stale) {
            await getDoryArtifactStore()
                .exportRuns.deleteRun(run.organizationId, run.id)
                .catch(() => undefined);
            await this.db.exportRuns.update(run.organizationId, run.id, {
                status: 'failed',
                phase: 'failed',
                errorCode: 'EXPORT_PROCESS_RESTARTED',
                errorMessage: 'The process restarted before the export completed',
                completedAt: new Date(),
            });
        }
        await this.cleanupExpired();
        await this.pump();
    }

    private async pump() {
        if (this.pumping || this.controllers.size >= 1) return;
        this.pumping = true;
        try {
            const [run] = await this.db.exportRuns.claimQueued(1);
            if (!run) return;
            const controller = new AbortController();
            this.controllers.set(run.id, controller);
            void this.execute(run, controller)
                .catch(() => undefined)
                .finally(() => {
                    this.controllers.delete(run.id);
                    this.pumping = false;
                    void this.pump();
                });
        } finally {
            if (this.controllers.size === 0) this.pumping = false;
        }
    }

    private async execute(run: ExportRun, controller: AbortController) {
        let heartbeat: NodeJS.Timeout | null = null;
        let workDir: string | null = null;
        let outputPath: string | null = null;
        const artifacts = getDoryArtifactStore().exportRuns;
        try {
            const plan = parseExportPlan(run.plan);
            const pool = await validatePlanForOrganization(run.organizationId, plan);
            heartbeat = setInterval(() => {
                void this.db.exportRuns
                    .get(run.organizationId, run.id)
                    .then(current => {
                        if (current?.cancelRequested) controller.abort(new DOMException('The export was canceled', 'AbortError'));
                        return this.db.exportRuns.update(run.organizationId, run.id, { heartbeatAt: new Date() });
                    })
                    .catch(() => undefined);
            }, 2_000);
            heartbeat.unref();

            const streamResult = await pool.instance.readTable(
                {
                    database: plan.source.database,
                    table: plan.source.table,
                    columns: plan.columns,
                    window: { kind: 'all' },
                    options: {
                        filters: plan.operations.filters,
                        search: plan.operations.search,
                        searchColumns: plan.operations.searchColumns,
                        sort: plan.operations.sort,
                    },
                },
                { signal: controller.signal },
            );
            const fileName = exportFileName(plan);
            workDir = await mkdtemp(path.join(os.tmpdir(), `dory-export-${run.id}-`));
            outputPath = path.join(workDir, fileName);
            const writer = createExportWriter(plan.output.format);
            const result = await writer.write({
                stream: streamResult.stream,
                outputPath,
                signal: controller.signal,
                onProgress: async progress => {
                    await this.db.exportRuns.update(run.organizationId, run.id, {
                        phase: progress.phase,
                        progress,
                        processedRows: progress.rows,
                        batchCount: progress.batches,
                        heartbeatAt: new Date(),
                    });
                },
            });
            if (controller.signal.aborted) throw controller.signal.reason;
            await this.db.exportRuns.update(run.organizationId, run.id, { phase: 'uploading', heartbeatAt: new Date() });
            const paths = artifacts.paths(run.organizationId, run.id, fileName);
            await this.db.exportRuns.update(run.organizationId, run.id, {
                objectPath: paths.output,
                manifestPath: paths.manifest,
                fileName,
                contentType: result.contentType,
                heartbeatAt: new Date(),
            });
            await artifacts.put(paths.output, createReadStream(outputPath), result.contentType);
            if (controller.signal.aborted) throw controller.signal.reason;
            const uploadedSize = (await artifacts.stat(paths.output))?.byteSize ?? (await stat(outputPath)).size;
            const manifest = {
                version: 1,
                runId: run.id,
                plan,
                planHash: hashExportPlan(plan),
                file: { path: paths.output, fileName, contentType: result.contentType, byteSize: uploadedSize },
                rowCount: result.rowCount,
                batchCount: result.batchCount,
                createdAt: new Date().toISOString(),
            };
            await artifacts.putJson(paths.manifest, manifest);
            if (controller.signal.aborted) throw controller.signal.reason;
            const completed = await this.db.exportRuns.update(run.organizationId, run.id, {
                status: 'completed',
                phase: 'completed',
                processedRows: result.rowCount,
                batchCount: result.batchCount,
                byteSize: uploadedSize,
                objectPath: paths.output,
                manifestPath: paths.manifest,
                fileName,
                contentType: result.contentType,
                consistency: consistencyForDriver(pool.instance.config.type),
                artifactExpiresAt: new Date(Date.now() + EXPORT_RETENTION_MS),
                completedAt: new Date(),
                heartbeatAt: new Date(),
            });
            await this.db.exportRuns.appendEvent(run.organizationId, run.id, 'run.completed', { rows: result.rowCount, bytes: uploadedSize });
            return completed;
        } catch (error) {
            const canceled = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
            await artifacts.deleteRun(run.organizationId, run.id).catch(() => undefined);
            await this.db.exportRuns.update(run.organizationId, run.id, {
                status: canceled ? 'canceled' : 'failed',
                phase: canceled ? 'canceled' : 'failed',
                errorCode: canceled ? null : error instanceof ExportServiceError ? error.code : 'EXPORT_FAILED',
                errorMessage: canceled ? null : error instanceof Error ? error.message : String(error),
                completedAt: new Date(),
                heartbeatAt: new Date(),
            });
            await this.db.exportRuns.appendEvent(run.organizationId, run.id, canceled ? 'run.canceled' : 'run.failed', {
                message: canceled ? undefined : error instanceof Error ? error.message : String(error),
            });
        } finally {
            if (heartbeat) clearInterval(heartbeat);
            if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    private async cleanupExpired() {
        const runs = await this.db.exportRuns.listExpiredArtifacts(new Date());
        const artifacts = getDoryArtifactStore().exportRuns;
        for (const run of runs) {
            await artifacts.deleteRun(run.organizationId, run.id).catch(() => undefined);
            await this.db.exportRuns.update(run.organizationId, run.id, { objectPath: null, manifestPath: null, artifactExpiresAt: null });
            await this.db.exportRuns.appendEvent(run.organizationId, run.id, 'artifacts.expired', {});
        }
    }
}

const globalForExportRunner = globalThis as typeof globalThis & { __doryExportRunner?: ExportRunner };

function getExportRunner(db: DBService) {
    // Next.js keeps globalThis across development hot reloads. Replace an
    // instance created by an older module so queued jobs use the current
    // writer implementation instead of stale bundled code.
    if (!(globalForExportRunner.__doryExportRunner instanceof ExportRunner)) {
        globalForExportRunner.__doryExportRunner = new ExportRunner(db);
    }
    return globalForExportRunner.__doryExportRunner;
}

function serializeRun(run: ExportRun) {
    return {
        id: run.id,
        connectionId: run.connectionId,
        database: run.databaseName,
        table: run.tableName,
        status: run.status,
        phase: run.phase,
        plan: run.plan as TableExportPlanV1,
        progress: run.progress,
        processedRows: run.processedRows,
        batchCount: run.batchCount,
        byteSize: run.byteSize,
        fileName: run.fileName,
        downloadUrl: run.status === 'completed' && run.objectPath ? `/api/table-exports/${encodeURIComponent(run.id)}` : null,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
        artifactExpiresAt: run.artifactExpiresAt?.toISOString() ?? null,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
    };
}

function encodeCursor(run: Pick<ExportRun, 'createdAt' | 'id'>) {
    return Buffer.from(JSON.stringify({ createdAt: run.createdAt.toISOString(), id: run.id })).toString('base64url');
}

function decodeCursor(value?: string | null) {
    if (!value) return null;
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: string; id?: string };
        const createdAt = new Date(parsed.createdAt ?? '');
        return parsed.id && Number.isFinite(createdAt.getTime()) ? { createdAt, id: parsed.id } : null;
    } catch {
        return null;
    }
}
