import 'server-only';

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { getDoryArtifactStore } from '@dory/artifacts';
import type { DBService } from '@dory/database';
import { ArrowIpcFileDataset, schemaToIpc } from '@dory/dataset';
import type { BaseConnection } from '@dory/drivers/core';
import {
    CommitUnknownError,
    IMPORT_MANIFEST_VERSION,
    TRANSFORM_VERSION,
    analyzeCsv,
    datasetSchemaHash,
    detectCsv,
    hashImportPlan,
    parseImportPlan,
    parseDatasetProfile,
    parseImportTarget,
    prepareImportDataset,
    previewImportTransform,
    transcodeCsvToUtf8,
    validateTargetCoverage,
    PartialWriteError,
    type CsvEncoding,
    type CsvParsingOptions,
    type DatasetProfileV2,
    type ImportPlanV1,
    type ImportRunStatus,
    type WriteResult,
} from '@dory/import';

import { getOrCreateConnectionPool } from '@/lib/connection/connection-service';

import { getImportConfig } from './config';

type Run = NonNullable<Awaited<ReturnType<DBService['importRuns']['get']>>>;

export class ImportServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ImportServiceError';
    }
}

export async function createImportRun(db: DBService, input: { organizationId: string; userId: string; connectionId?: string | null }) {
    getImportRunner(db).wake();
    const config = getImportConfig();
    const expiresAt = new Date(Date.now() + config.artifactRetentionDays * 24 * 60 * 60 * 1000);
    const run = await db.importRuns.create({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        connectionId: input.connectionId ?? null,
        artifactsExpireAt: expiresAt,
    });
    const paths = getDoryArtifactStore().importRuns.paths(input.organizationId, run.id);
    const updated = await db.importRuns.update(input.organizationId, run.id, { artifactPrefix: paths.prefix });
    await db.importRuns.appendEvent(input.organizationId, run.id, 'run.created', { status: updated.status });
    return updated;
}

export async function getImportRun(db: DBService, organizationId: string, runId: string) {
    getImportRunner(db).wake();
    const run = await db.importRuns.get(organizationId, runId);
    if (!run) throw new ImportServiceError('Import run not found', 404, 'IMPORT_RUN_NOT_FOUND');
    return run;
}

export async function uploadImportSource(db: DBService, input: { organizationId: string; runId: string; fileName: string; contentLength?: number | null; body: Readable }) {
    const run = await getImportRun(db, input.organizationId, input.runId);
    if (!['draft', 'failed'].includes(run.status)) throw new ImportServiceError('This import run no longer accepts a source file', 409, 'IMPORT_RUN_STATE');
    if (run.sourceHash && run.sourceObjectPath)
        throw new ImportServiceError('The source artifact is immutable. Create a new import run to upload another file.', 409, 'IMPORT_SOURCE_IMMUTABLE');
    const extension = sourceExtension(input.fileName);
    const config = getImportConfig();
    if (input.contentLength && input.contentLength > config.maxFileBytes)
        throw new ImportServiceError('The source file exceeds the configured size limit', 413, 'IMPORT_FILE_TOO_LARGE');

    const artifacts = getDoryArtifactStore().importRuns;
    const paths = artifacts.paths(input.organizationId, input.runId, extension);
    const meter = new HashAndLimitTransform(config.maxFileBytes);
    await db.importRuns.update(input.organizationId, input.runId, {
        status: 'uploading',
        phase: 'uploading',
        sourceName: input.fileName,
        sourceExtension: extension,
        sourceObjectPath: paths.source,
        errorCode: null,
        errorMessage: null,
    });
    await db.importRuns.appendEvent(input.organizationId, input.runId, 'upload.started', { fileName: input.fileName, maxBytes: config.maxFileBytes });

    try {
        input.body.on('error', error => meter.destroy(error));
        input.body.pipe(meter);
        await artifacts.put(paths.source, meter, extension === 'tsv' ? 'text/tab-separated-values' : 'text/csv');
        if (meter.bytes === 0) throw new ImportServiceError('The source file is empty', 400, 'IMPORT_FILE_EMPTY');
    } catch (error) {
        await artifacts.delete(paths.source).catch(() => undefined);
        const tooLarge = error instanceof ImportServiceError || (error instanceof Error && error.message === 'IMPORT_FILE_TOO_LARGE');
        const failed = await db.importRuns.update(input.organizationId, input.runId, {
            status: 'failed',
            phase: 'uploading',
            sourceHash: null,
            sourceBytes: null,
            sourceObjectPath: null,
            errorCode: tooLarge ? 'IMPORT_FILE_TOO_LARGE' : 'IMPORT_UPLOAD_FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
        });
        await db.importRuns.appendEvent(input.organizationId, input.runId, 'upload.failed', { message: failed.errorMessage });
        await writeManifest(db, failed).catch(() => undefined);
        await writeEventsArtifact(db, failed).catch(() => undefined);
        if (tooLarge && !(error instanceof ImportServiceError)) throw new ImportServiceError('The source file exceeds the configured size limit', 413, 'IMPORT_FILE_TOO_LARGE');
        throw error;
    }

    const updated = await db.importRuns.update(input.organizationId, input.runId, {
        status: 'draft',
        phase: 'uploaded',
        sourceHash: meter.digest(),
        sourceBytes: meter.bytes,
        sourceObjectPath: paths.source,
        artifactPrefix: paths.prefix,
        sourceArrowPath: null,
        preparedArrowPath: null,
        profile: null,
        plan: null,
        progress: null,
        processedRows: 0,
        filteredRows: 0,
        pendingRows: 0,
        insertedRows: 0,
        batchCount: 0,
    });
    await db.importRuns.appendEvent(input.organizationId, input.runId, 'upload.completed', { bytes: meter.bytes, sha256: updated.sourceHash });
    return updated;
}

export async function analyzeImportSource(db: DBService, input: { organizationId: string; runId: string; parsing?: Partial<CsvParsingOptions> }) {
    let run = await getImportRun(db, input.organizationId, input.runId);
    if (!run.sourceObjectPath || !run.sourceName || !run.sourceHash) throw new ImportServiceError('Upload a CSV file before analysis', 409, 'IMPORT_SOURCE_REQUIRED');
    if (run.status === 'running' || run.status === 'queued') throw new ImportServiceError('The import is already executing', 409, 'IMPORT_RUN_STATE');

    const artifacts = getDoryArtifactStore().importRuns;
    const paths = artifacts.paths(input.organizationId, input.runId, run.sourceExtension ?? 'csv');
    const workDir = await ensureWorkDir(input.runId);
    let sourcePath: string;
    let detection: Awaited<ReturnType<typeof detectCsv>>;
    let parsing: CsvParsingOptions;
    try {
        sourcePath = await materializeForRead(run.sourceObjectPath, path.join(workDir, `source.${run.sourceExtension ?? 'csv'}`));
        detection = await detectCsv(sourcePath);
        parsing = mergeParsing(detection.options, input.parsing);
    } catch (error) {
        await removeWorkDir(workDir);
        throw error;
    }
    if (detection.requiresEncodingSelection && !input.parsing?.encoding) {
        await db.importRuns.update(input.organizationId, input.runId, { parsingOptions: detection.options, phase: 'encoding_required' });
        await removeWorkDir(workDir);
        throw new ImportServiceError('Encoding confidence is low. Select the source encoding and analyze again.', 422, 'IMPORT_ENCODING_REQUIRED', detection);
    }

    run = await db.importRuns.update(input.organizationId, input.runId, {
        status: 'analyzing',
        phase: 'analyzing',
        parsingOptions: parsing,
        sourceArrowPath: null,
        preparedArrowPath: null,
        profile: null,
        plan: null,
        progress: null,
        processedRows: 0,
        filteredRows: 0,
        pendingRows: 0,
        insertedRows: 0,
        batchCount: 0,
        errorCode: null,
        errorMessage: null,
    });
    await db.importRuns.appendEvent(input.organizationId, input.runId, 'analysis.started', { parsing });

    let utf8Path: string;
    let sourceArrowLocal: string;
    try {
        utf8Path = parsing.encoding === 'utf8' ? sourcePath : await transcodeCsvToUtf8(sourcePath, path.join(workDir, 'source.utf8.csv'), parsing.encoding);
        sourceArrowLocal = await pathForWrite(paths.sourceArrow, path.join(workDir, 'source.arrow'));
    } catch (error) {
        await markAnalysisFailed(db, input.organizationId, input.runId, error);
        await removeWorkDir(workDir);
        throw error;
    }

    try {
        const result = await analyzeCsv({
            sourcePath: utf8Path,
            sourceName: run.sourceName!,
            sourceHash: run.sourceHash!,
            outputArrowPath: sourceArrowLocal,
            parsing,
        });
        await persistGeneratedFile(paths.sourceArrow, sourceArrowLocal, 'application/vnd.apache.arrow.file');
        await artifacts.put(paths.schema, Buffer.from(schemaToIpc(result.dataset.schema)), 'application/vnd.apache.arrow.file');
        await artifacts.putJson(paths.profile, result.profile);
        await artifacts.putJson(paths.transform, { version: TRANSFORM_VERSION, operations: [] });
        const updated = await db.importRuns.update(input.organizationId, input.runId, {
            status: 'ready',
            phase: 'ready',
            parsingOptions: parsing,
            profile: result.profile,
            sourceArrowPath: paths.sourceArrow,
            processedRows: 0,
            progress: { phase: 'ready', rows: result.profile.rows, schemaHash: datasetSchemaHash(result.dataset) },
        });
        await writeManifest(db, updated);
        await db.importRuns.appendEvent(input.organizationId, input.runId, 'analysis.completed', {
            rows: result.profile.rows,
            columns: result.profile.columns.length,
            schemaHash: datasetSchemaHash(result.dataset),
        });
        return updated;
    } catch (error) {
        await markAnalysisFailed(db, input.organizationId, input.runId, error);
        throw error;
    } finally {
        await removeWorkDir(workDir);
    }
}

export async function inspectImportTarget(db: DBService, connection: BaseConnection, input: { organizationId: string; runId: string; target: ImportPlanV1['target'] }) {
    const run = await getImportRun(db, input.organizationId, input.runId);
    if (run.status !== 'ready') throw new ImportServiceError('Analyze the source before selecting a target', 409, 'IMPORT_RUN_STATE');
    if (run.connectionId && connection.config.id !== run.connectionId)
        throw new ImportServiceError('The selected connection does not match this import run', 409, 'IMPORT_CONNECTION_MISMATCH');
    return connection.getDataWriter().inspectTarget(parseImportTarget(input.target));
}

export async function saveImportPlan(db: DBService, connection: BaseConnection, input: { organizationId: string; runId: string; plan: unknown }) {
    const run = await getImportRun(db, input.organizationId, input.runId);
    if (run.status !== 'ready') throw new ImportServiceError('Analyze the source before configuring the import', 409, 'IMPORT_RUN_STATE');
    const plan = parseImportPlan(input.plan);
    const schemaHash = importRunSchemaHash(run);
    if (!schemaHash || plan.sourceSchemaHash !== schemaHash) {
        throw new ImportServiceError('The analyzed source schema changed. Review the mapping and save it again.', 409, 'IMPORT_SCHEMA_CHANGED');
    }
    if (!sameParsingOptions(plan.parsing, run.parsingOptions)) {
        throw new ImportServiceError('The CSV parsing settings changed. Analyze the source again before saving the mapping.', 409, 'IMPORT_PARSING_CHANGED');
    }
    const profile = importRunProfile(run);
    if (!profile) throw new ImportServiceError('This import uses an obsolete profile. Analyze the source again.', 409, 'IMPORT_PROFILE_VERSION');
    const sourceColumns = new Set(profile.columns.map(column => column.name));
    const unknownSources = plan.columns.filter(column => !sourceColumns.has(column.source)).map(column => column.source);
    if (unknownSources.length) {
        throw new ImportServiceError(`Source columns are not present in the analyzed dataset: ${unknownSources.join(', ')}`, 422, 'IMPORT_SOURCE_COLUMNS', {
            columns: unknownSources,
        });
    }
    if (run.connectionId && connection.config.id !== run.connectionId)
        throw new ImportServiceError('The selected connection does not match this import run', 409, 'IMPORT_CONNECTION_MISMATCH');
    const writer = connection.getDataWriter();
    const target = await writer.inspectTarget(plan.target);
    if (plan.target.mode === 'existing') {
        if (!target.exists) throw new ImportServiceError('The target table does not exist', 422, 'IMPORT_TARGET_NOT_FOUND');
        const targetNames = new Set(target.columns.map(column => column.name));
        const unknownTargets = plan.columns.filter(column => !column.ignored && !targetNames.has(column.target)).map(column => column.target);
        if (unknownTargets.length) {
            throw new ImportServiceError(`Mapped target columns do not exist: ${unknownTargets.join(', ')}`, 422, 'IMPORT_TARGET_COLUMNS', { columns: unknownTargets });
        }
        const missing = validateTargetCoverage(target, plan.columns);
        if (missing.length) throw new ImportServiceError(`Required target columns are not mapped: ${missing.join(', ')}`, 422, 'IMPORT_REQUIRED_COLUMNS', { columns: missing });
    } else if (target.exists) {
        throw new ImportServiceError('The target table already exists', 409, 'IMPORT_TARGET_EXISTS');
    }
    const writeCapability = capabilityForPlan(target, plan);
    if (!writeCapability.supported) {
        throw new ImportServiceError('The selected write mode is not supported for this target', 422, 'IMPORT_WRITE_MODE_UNSUPPORTED', {
            operation: importOperation(plan),
            reason: writeCapability.reason,
        });
    }
    const updated = await db.importRuns.update(input.organizationId, input.runId, {
        connectionId: connection.config.id,
        plan,
        progress: {
            phase: 'ready',
            schemaHash,
            planHash: hashImportPlan(plan),
            createSql: plan.target.mode === 'create' ? await writer.previewCreateTable(plan) : null,
            writeCapability,
        },
    });
    const paths = getDoryArtifactStore().importRuns.paths(input.organizationId, input.runId, run.sourceExtension ?? 'csv');
    await getDoryArtifactStore().importRuns.putJson(paths.transform, plan.transform);
    await db.importRuns.appendEvent(input.organizationId, input.runId, 'plan.saved', { planHash: hashImportPlan(plan), target: plan.target });
    await writeManifest(db, updated);
    return { run: updated, target, createSql: plan.target.mode === 'create' ? await writer.previewCreateTable(plan) : null };
}

export async function previewImportRunTransform(db: DBService, input: { organizationId: string; runId: string; plan: unknown }) {
    const run = await getImportRun(db, input.organizationId, input.runId);
    if (run.status !== 'ready' || !run.sourceArrowPath) throw new ImportServiceError('Analyze the source before previewing transforms', 409, 'IMPORT_RUN_STATE');
    if (!importRunProfile(run)) throw new ImportServiceError('This import uses an obsolete profile. Analyze the source again.', 409, 'IMPORT_PROFILE_VERSION');
    const plan = parseImportPlan(input.plan);
    const schemaHash = importRunSchemaHash(run);
    if (!schemaHash || plan.sourceSchemaHash !== schemaHash) {
        throw new ImportServiceError('The analyzed source schema changed. Review the mapping again.', 409, 'IMPORT_SCHEMA_CHANGED');
    }
    const workDir = await ensureWorkDir(`${input.runId}-preview`);
    try {
        const sourceArrowLocal = await materializeForRead(run.sourceArrowPath, path.join(workDir, 'source.arrow'));
        return await previewImportTransform({ sourceArrowPath: sourceArrowLocal, plan });
    } finally {
        await removeWorkDir(workDir);
    }
}

export async function queueImportRun(db: DBService, connection: BaseConnection, organizationId: string, runId: string) {
    const run = await getImportRun(db, organizationId, runId);
    if (['queued', 'running', 'completed'].includes(run.status)) return run;
    if (run.status === 'commit_unknown') throw new ImportServiceError('This import may already be committed and cannot be retried automatically', 409, 'IMPORT_COMMIT_UNKNOWN');
    if (run.status !== 'ready' || !run.plan || !run.sourceArrowPath) throw new ImportServiceError('Complete analysis and mapping before execution', 409, 'IMPORT_RUN_NOT_READY');
    if (!importRunProfile(run)) throw new ImportServiceError('This import uses an obsolete profile. Analyze the source again.', 409, 'IMPORT_PROFILE_VERSION');
    if (connection.config.id !== run.connectionId) throw new ImportServiceError('The selected connection does not match this import run', 409, 'IMPORT_CONNECTION_MISMATCH');
    const target = await connection.getDataWriter().inspectTarget(parseImportPlan(run.plan).target);
    const plan = parseImportPlan(run.plan);
    assertTargetState(target, plan);
    const writeCapability = capabilityForPlan(target, plan);
    if (!writeCapability.supported) {
        throw new ImportServiceError('The selected write mode is no longer supported for this target', 409, 'IMPORT_WRITE_MODE_UNSUPPORTED', {
            operation: importOperation(plan),
            reason: writeCapability.reason,
        });
    }
    const schemaHash = importRunSchemaHash(run);
    const updated = await db.importRuns.update(organizationId, runId, {
        status: 'queued',
        phase: 'queued',
        cancelRequested: false,
        processedRows: 0,
        filteredRows: 0,
        pendingRows: 0,
        insertedRows: 0,
        batchCount: 0,
        progress: {
            phase: 'queued',
            rowsWritten: 0,
            batches: 0,
            rowsCommitted: 0,
            pendingCommit: false,
            writeCapability,
            ...(schemaHash ? { schemaHash } : {}),
        },
        errorCode: null,
        errorMessage: null,
    });
    await db.importRuns.appendEvent(organizationId, runId, 'run.queued', {});
    getImportRunner(db).wake();
    return updated;
}

export async function cancelImportRun(db: DBService, organizationId: string, runId: string) {
    const run = await getImportRun(db, organizationId, runId);
    if (['completed', 'failed', 'canceled', 'commit_unknown'].includes(run.status)) return run;
    if (run.status === 'queued' || run.status === 'ready' || run.status === 'draft') {
        const canceled = await db.importRuns.update(organizationId, runId, { status: 'canceled', phase: 'canceled', cancelRequested: true, completedAt: new Date() });
        await db.importRuns.appendEvent(organizationId, runId, 'run.canceled', {});
        await writeManifest(db, canceled).catch(() => undefined);
        await writeEventsArtifact(db, canceled).catch(() => undefined);
        return canceled;
    }
    const updated = await db.importRuns.update(organizationId, runId, { cancelRequested: true });
    getImportRunner(db).cancel(runId);
    await db.importRuns.appendEvent(organizationId, runId, 'cancel.requested', {});
    return updated;
}

export async function listImportRunEvents(db: DBService, organizationId: string, runId: string, after: number) {
    await getImportRun(db, organizationId, runId);
    return db.importRuns.listEvents(organizationId, runId, after);
}

class ImportRunner {
    private pumping = false;
    private recovering = false;
    private initialized = false;
    private readonly controllers = new Map<string, AbortController>();

    constructor(private readonly db: DBService) {}

    wake() {
        if (!this.initialized) {
            this.initialized = true;
            void this.recover().catch(() => undefined);
            void this.cleanupExpired().catch(() => undefined);
            const timer = setInterval(() => void this.pump().catch(() => undefined), 5_000);
            timer.unref();
            const recovery = setInterval(() => void this.recover().catch(() => undefined), 15_000);
            recovery.unref();
            const cleanup = setInterval(() => void this.cleanupExpired().catch(() => undefined), 60 * 60 * 1000);
            cleanup.unref();
        }
        void this.pump().catch(() => undefined);
    }

    cancel(runId: string) {
        this.controllers.get(runId)?.abort();
    }

    private async recover() {
        if (this.recovering) return;
        this.recovering = true;
        try {
            const stale = await this.db.importRuns.listStaleRunning(new Date(Date.now() - 30_000));
            for (const run of stale) {
                if (this.controllers.has(run.id)) continue;
                const status: ImportRunStatus = run.phase === 'committing' ? 'commit_unknown' : 'failed';
                const recovered = await this.db.importRuns.update(run.organizationId, run.id, {
                    status,
                    phase: status,
                    errorCode: status === 'commit_unknown' ? 'IMPORT_COMMIT_UNKNOWN' : 'IMPORT_PROCESS_RESTARTED',
                    errorMessage: status === 'commit_unknown' ? 'The process restarted while commit status was unknown' : 'The process restarted before the import committed',
                    completedAt: new Date(),
                });
                await this.db.importRuns.appendEvent(run.organizationId, run.id, `run.${status}`, { recovered: true });
                await writeManifest(this.db, recovered).catch(() => undefined);
                await writeEventsArtifact(this.db, recovered).catch(() => undefined);
            }
            await this.pump();
        } finally {
            this.recovering = false;
        }
    }

    private async pump() {
        if (this.pumping) return;
        this.pumping = true;
        try {
            const config = getImportConfig();
            while (this.controllers.size < config.concurrency) {
                const [run] = await this.db.importRuns.claimQueued(1);
                if (!run) break;
                const controller = new AbortController();
                this.controllers.set(run.id, controller);
                void this.execute(run.id, run.organizationId, controller)
                    .catch(() => undefined)
                    .finally(() => {
                        this.controllers.delete(run.id);
                        void this.pump().catch(() => undefined);
                    });
            }
        } finally {
            this.pumping = false;
        }
    }

    private async execute(runId: string, organizationId: string, controller: AbortController) {
        let heartbeat: NodeJS.Timeout | null = null;
        let workDir: string | null = null;
        let committedResult: WriteResult | null = null;
        let preparedFilteredRows = 0;
        try {
            let run = await getImportRun(this.db, organizationId, runId);
            if (!run.connectionId || !run.plan || !run.sourceArrowPath) throw new Error('Import run is missing its connection, plan, or source dataset');
            const profile = importRunProfile(run);
            if (!profile) throw new Error('The import profile version is obsolete; analyze the source again');
            const plan = parseImportPlan(run.plan);
            const pool = await getOrCreateConnectionPool(organizationId, run.connectionId);
            if (!pool) throw new Error('Import connection is unavailable');
            const writer = pool.instance.getDataWriter();
            const target = await writer.inspectTarget(plan.target);
            assertTargetState(target, plan);
            const writeCapability = capabilityForPlan(target, plan);
            if (!writeCapability.supported) {
                throw new ImportServiceError(`Import ${importOperation(plan)} is no longer supported for this target`, 409, 'IMPORT_WRITE_MODE_UNSUPPORTED', {
                    operation: importOperation(plan),
                    reason: writeCapability.reason,
                });
            }
            heartbeat = setInterval(() => {
                void this.db.importRuns
                    .get(organizationId, runId)
                    .then(current => {
                        if (current?.cancelRequested) controller.abort();
                        return this.db.importRuns.update(organizationId, runId, { heartbeatAt: new Date() });
                    })
                    .catch(() => undefined);
            }, 2_000);
            heartbeat.unref();
            workDir = await ensureWorkDir(runId);
            const sourceArrowLocal = await materializeForRead(run.sourceArrowPath, path.join(workDir, 'source.arrow'));
            const sourceDataset = await ArrowIpcFileDataset.open({
                filePath: sourceArrowLocal,
                rowCount: profile.rows,
                metadata: { source: run.sourceName ?? 'source.csv', sourceHash: run.sourceHash ?? undefined, artifactPath: run.sourceArrowPath },
            });
            if (datasetSchemaHash(sourceDataset) !== plan.sourceSchemaHash) {
                throw new Error('The source dataset schema no longer matches the saved import plan');
            }
            const artifacts = getDoryArtifactStore().importRuns;
            const paths = artifacts.paths(organizationId, runId, run.sourceExtension ?? 'csv');
            const preparedLocal = await pathForWrite(paths.preparedArrow, path.join(workDir, 'prepared.arrow'));
            await this.db.importRuns.update(organizationId, runId, { phase: 'preparing', heartbeatAt: new Date() });
            await this.db.importRuns.appendEvent(organizationId, runId, 'prepare.started', {});
            const prepared = await prepareImportDataset({ sourceArrowPath: sourceArrowLocal, outputArrowPath: preparedLocal, sourceDataset, plan, signal: controller.signal });
            preparedFilteredRows = prepared.filteredRows;
            await persistGeneratedFile(paths.preparedArrow, preparedLocal, 'application/vnd.apache.arrow.file');
            run = await this.db.importRuns.update(organizationId, runId, {
                preparedArrowPath: paths.preparedArrow,
                phase: 'writing',
                filteredRows: prepared.filteredRows,
                heartbeatAt: new Date(),
                progress: {
                    phase: 'writing',
                    sourceRows: prepared.inputRows,
                    preparedRows: prepared.outputRows,
                    filteredRows: prepared.filteredRows,
                    rowsWritten: 0,
                    rowsCommitted: 0,
                    batches: 0,
                    pendingCommit: false,
                    writeCapability,
                },
            });
            await this.db.importRuns.appendEvent(organizationId, runId, 'prepare.completed', {
                sourceRows: prepared.inputRows,
                preparedRows: prepared.outputRows,
                filteredRows: prepared.filteredRows,
            });

            let lastProgressAt = 0;
            committedResult = await writer.write({
                dataset: prepared.dataset,
                plan,
                batchSize: plan.batchSize,
                signal: controller.signal,
                onProgress: async progress => {
                    const now = Date.now();
                    if (!progress.pendingCommit || progress.phase === 'committing' || now - lastProgressAt >= 250) {
                        lastProgressAt = now;
                        await this.db.importRuns.update(organizationId, runId, {
                            phase: progress.phase,
                            progress: {
                                ...progress,
                                sourceRows: prepared.inputRows,
                                preparedRows: prepared.outputRows,
                                filteredRows: prepared.filteredRows,
                            },
                            processedRows: progress.rowsWritten,
                            pendingRows: Math.max(0, progress.rowsWritten - progress.rowsCommitted),
                            insertedRows: progress.rowsCommitted,
                            batchCount: progress.batches,
                            heartbeatAt: new Date(),
                        });
                    }
                },
            });
            await completeImportRun(this.db, organizationId, runId, committedResult, preparedFilteredRows);
        } catch (error) {
            let failure = error;
            if (committedResult) {
                try {
                    await completeImportRun(this.db, organizationId, runId, committedResult, preparedFilteredRows);
                    return;
                } catch (completionError) {
                    failure = new CommitUnknownError(
                        completionError instanceof Error ? `The target committed, but the import run could not record completion: ${completionError.message}` : undefined,
                    );
                }
            }
            const canceled = controller.signal.aborted || (failure instanceof DOMException && failure.name === 'AbortError');
            const status: ImportRunStatus = canceled ? 'canceled' : failure instanceof CommitUnknownError ? 'commit_unknown' : 'failed';
            const persisted = await this.db.importRuns.get(organizationId, runId);
            const committedRows = Math.max(persisted?.insertedRows ?? 0, failure instanceof PartialWriteError ? failure.committedRows : 0);
            const partial = committedRows > 0 || failure instanceof PartialWriteError;
            const current = await this.db.importRuns.update(organizationId, runId, {
                status,
                phase: status,
                pendingRows: 0,
                insertedRows: committedRows,
                processedRows: Math.max(persisted?.processedRows ?? 0, committedRows),
                errorCode: canceled
                    ? partial
                        ? 'IMPORT_CANCELED_PARTIAL'
                        : null
                    : status === 'commit_unknown'
                      ? 'IMPORT_COMMIT_UNKNOWN'
                      : partial
                        ? 'IMPORT_PARTIAL_WRITE'
                        : failure instanceof ImportServiceError
                          ? failure.code
                          : 'IMPORT_EXECUTION_FAILED',
                errorMessage: canceled
                    ? partial
                        ? 'The import was canceled after some rows had already committed. Review the target table.'
                        : null
                    : failure instanceof Error
                      ? failure.message
                      : String(failure),
                heartbeatAt: new Date(),
                completedAt: new Date(),
            });
            await this.db.importRuns.appendEvent(organizationId, runId, `run.${status}`, canceled ? {} : { message: failure instanceof Error ? failure.message : String(failure) });
            await writeManifest(this.db, current).catch(() => undefined);
            await writeEventsArtifact(this.db, current).catch(() => undefined);
        } finally {
            if (heartbeat) clearInterval(heartbeat);
            if (workDir) await removeWorkDir(workDir);
        }
    }

    private async cleanupExpired() {
        const runs = await this.db.importRuns.listExpiredArtifacts(new Date());
        const artifacts = getDoryArtifactStore().importRuns;
        for (const run of runs) {
            for (const objectPath of [run.sourceObjectPath, run.sourceArrowPath, run.preparedArrowPath]) {
                if (objectPath) await artifacts.delete(objectPath).catch(() => undefined);
            }
            const updated = await this.db.importRuns.update(run.organizationId, run.id, { artifactsExpireAt: null });
            await this.db.importRuns.appendEvent(run.organizationId, run.id, 'artifacts.expired', {});
            await writeManifest(this.db, updated).catch(() => undefined);
            await writeEventsArtifact(this.db, updated).catch(() => undefined);
        }
    }
}

const globalForImportRunner = globalThis as typeof globalThis & { __doryImportRunner?: ImportRunner };

function getImportRunner(db: DBService) {
    globalForImportRunner.__doryImportRunner ??= new ImportRunner(db);
    return globalForImportRunner.__doryImportRunner;
}

function importRunSchemaHash(run: Run): string | null {
    if (!run.progress || typeof run.progress !== 'object' || Array.isArray(run.progress)) return null;
    const value = (run.progress as Record<string, unknown>).schemaHash;
    return typeof value === 'string' ? value : null;
}

function importRunProfile(run: Run): DatasetProfileV2 | null {
    try {
        return parseDatasetProfile(run.profile);
    } catch {
        return null;
    }
}

function sameParsingOptions(plan: CsvParsingOptions, stored: unknown) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return false;
    const value = stored as Record<string, unknown>;
    return value.delimiter === plan.delimiter && value.hasHeader === plan.hasHeader && value.encoding === plan.encoding && value.quoteChar === plan.quoteChar;
}

async function completeImportRun(db: DBService, organizationId: string, runId: string, result: WriteResult, filteredRows: number) {
    const completed = await db.importRuns.update(organizationId, runId, {
        status: 'completed',
        phase: 'completed',
        processedRows: result.insertedRows,
        filteredRows,
        pendingRows: 0,
        insertedRows: result.insertedRows,
        batchCount: result.batches,
        heartbeatAt: new Date(),
        completedAt: new Date(),
        progress: {
            phase: 'completed',
            sourceRows: result.insertedRows + filteredRows,
            preparedRows: result.insertedRows,
            rowsWritten: result.insertedRows,
            rowsCommitted: result.insertedRows,
            filteredRows,
            batches: result.batches,
            pendingCommit: false,
            writeCapability: { supported: true, atomicity: result.atomicity },
        },
    });
    await db.importRuns.appendEvent(organizationId, runId, 'run.completed', result).catch(() => undefined);
    await writeManifest(db, completed).catch(() => undefined);
    await writeEventsArtifact(db, completed).catch(() => undefined);
    return completed;
}

function importOperation(plan: ImportPlanV1) {
    return plan.target.mode === 'create' ? ('create' as const) : plan.mode;
}

function capabilityForPlan(target: Awaited<ReturnType<ReturnType<BaseConnection['getDataWriter']>['inspectTarget']>>, plan: ImportPlanV1) {
    return target.writeCapabilities[importOperation(plan)];
}

function assertTargetState(target: Awaited<ReturnType<ReturnType<BaseConnection['getDataWriter']>['inspectTarget']>>, plan: ImportPlanV1) {
    if (plan.target.mode === 'create' && target.exists) throw new ImportServiceError('The target table already exists', 409, 'IMPORT_TARGET_EXISTS');
    if (plan.target.mode === 'existing' && !target.exists) throw new ImportServiceError('The target table does not exist', 409, 'IMPORT_TARGET_NOT_FOUND');
}

async function writeManifest(db: DBService, run: Run) {
    const artifacts = getDoryArtifactStore().importRuns;
    const paths = artifacts.paths(run.organizationId, run.id, run.sourceExtension ?? 'csv');
    const plan = run.plan as ImportPlanV1 | null;
    await artifacts.putJson(paths.manifest, {
        version: IMPORT_MANIFEST_VERSION,
        runId: run.id,
        sourceHash: run.sourceHash,
        sourceBytes: run.sourceBytes,
        schemaHash: plan?.sourceSchemaHash ?? null,
        planHash: plan ? hashImportPlan(plan) : null,
        artifacts: {
            source: run.sourceObjectPath,
            sourceArrow: run.sourceArrowPath,
            preparedArrow: run.preparedArrowPath,
            schema: paths.schema,
            profile: paths.profile,
            transform: paths.transform,
            events: paths.events,
        },
        target: plan?.target ?? null,
        status: run.status,
        counts: {
            source: importRunProfile(run)?.rows ?? null,
            filtered: run.filteredRows,
            processed: run.processedRows,
            inserted: run.insertedRows,
            batches: run.batchCount,
        },
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        completedAt: run.completedAt,
    });
}

async function writeEventsArtifact(db: DBService, run: Run) {
    const events = await db.importRuns.listEvents(run.organizationId, run.id, 0);
    const body = `${events.map(event => JSON.stringify(event)).join('\n')}\n`;
    const paths = getDoryArtifactStore().importRuns.paths(run.organizationId, run.id, run.sourceExtension ?? 'csv');
    await getDoryArtifactStore().importRuns.put(paths.events, body, 'application/x-ndjson');
}

async function ensureWorkDir(runId: string) {
    const dir = path.join(getImportConfig().tempDir, runId.replace(/[^a-zA-Z0-9_.-]/g, '_'));
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return dir;
}

async function removeWorkDir(workDir: string) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
}

async function markAnalysisFailed(db: DBService, organizationId: string, runId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await db.importRuns.update(organizationId, runId, {
        status: 'failed',
        phase: 'analyzing',
        errorCode: 'IMPORT_ANALYSIS_FAILED',
        errorMessage: message,
    });
    await db.importRuns.appendEvent(organizationId, runId, 'analysis.failed', { message });
    await writeManifest(db, failed).catch(() => undefined);
    await writeEventsArtifact(db, failed).catch(() => undefined);
}

async function materializeForRead(objectPath: string, temporaryPath: string) {
    const artifacts = getDoryArtifactStore().importRuns;
    const local = artifacts.localPath(objectPath);
    if (local) return local;
    await mkdir(path.dirname(temporaryPath), { recursive: true, mode: 0o700 });
    await pipeline(await artifacts.get(objectPath), createWriteStream(temporaryPath, { mode: 0o600 }));
    return temporaryPath;
}

async function pathForWrite(objectPath: string, temporaryPath: string) {
    const local = getDoryArtifactStore().importRuns.localPath(objectPath);
    const output = local ?? temporaryPath;
    await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
    return output;
}

async function persistGeneratedFile(objectPath: string, localPath: string, contentType: string) {
    const artifacts = getDoryArtifactStore().importRuns;
    if (artifacts.localPath(objectPath) === localPath) return;
    await artifacts.put(objectPath, createReadStream(localPath), contentType);
}

function sourceExtension(fileName: string) {
    const extension = path.extname(fileName).toLocaleLowerCase().slice(1);
    if (extension !== 'csv' && extension !== 'tsv') throw new ImportServiceError('Only CSV and TSV files are supported', 415, 'IMPORT_FILE_TYPE');
    return extension;
}

function mergeParsing(detected: CsvParsingOptions, override?: Partial<CsvParsingOptions>): CsvParsingOptions {
    if (override?.hasHeader !== undefined && typeof override.hasHeader !== 'boolean') {
        throw new ImportServiceError('Header setting must be a boolean', 400, 'IMPORT_PARSING_OPTIONS');
    }
    const delimiter = override?.delimiter ?? detected.delimiter;
    if (![',', '\t', ';', '|'].includes(delimiter)) throw new ImportServiceError('Unsupported delimiter', 400, 'IMPORT_PARSING_OPTIONS');
    const encoding = override?.encoding ?? detected.encoding;
    if (!['utf8', 'utf16le', 'utf16be', 'gb18030', 'big5', 'shift_jis', 'windows1252'].includes(encoding)) {
        throw new ImportServiceError('Unsupported encoding', 400, 'IMPORT_PARSING_OPTIONS');
    }
    const quoteChar = override?.quoteChar ?? detected.quoteChar;
    if (quoteChar.length !== 1) throw new ImportServiceError('Quote character must contain one character', 400, 'IMPORT_PARSING_OPTIONS');
    return { delimiter, encoding: encoding as CsvEncoding, hasHeader: override?.hasHeader ?? detected.hasHeader, quoteChar };
}

class HashAndLimitTransform extends Transform {
    private readonly hash = createHash('sha256');
    bytes = 0;
    private finalized = false;

    constructor(private readonly maxBytes: number) {
        super();
    }

    override _transform(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
        this.bytes += buffer.length;
        if (this.bytes > this.maxBytes) {
            callback(new Error('IMPORT_FILE_TOO_LARGE'));
            return;
        }
        this.hash.update(buffer);
        callback(null, buffer);
    }

    digest() {
        if (this.finalized) throw new Error('Upload hash was already finalized');
        this.finalized = true;
        return this.hash.digest('hex');
    }
}
