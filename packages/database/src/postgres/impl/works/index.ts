import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import {
    agentRunResultSets,
    artifacts,
    findingArtifacts,
    findings,
    queryRuns,
    resultSets as resultSetsTable,
    tabs,
    workChartStates,
    workEvents,
    workQueryResultSets,
    workQuerySessions,
    works,
    type WorkStatus,
} from '@dory/database/postgres/schemas';
import { translateDatabase } from '@dory/database/i18n';
import { getDoryArtifactStore, type DoryArtifactStore } from '@dory/artifacts';
import { createDataSchema, rowDataStream, schemaToIpc } from '@dory/data-plane';
import {
    buildResultSetPreview,
    createDefaultResultSetDataWriter,
    inferResultSetColumns,
    resultSetDataAvailability,
    type ResultSetArtifactRef,
    type ResultSetDataWriter,
    type ResultSetManifest,
} from '@dory/resultset';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import type { PostgresDBClient } from '@dory/shared';

const DEFAULT_WORK_TITLE = 'Agent Run';

export type WorkRecord = typeof works.$inferSelect;
export type WorkEventRecord = typeof workEvents.$inferSelect;

export type WorkListPage = {
    rows: WorkRecord[];
    total: number;
};

export type ResolveWorkInput = {
    organizationId: string;
    userId: string;
    tokenId?: string | null;
    connectionId?: string | null;
    workId?: string | null;
    externalSessionId?: string | null;
    title?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type WorkEventCreateInput = {
    workId: string;
    organizationId: string;
    userId: string;
    tokenId?: string | null;
    connectionId?: string | null;
    toolName: string;
    actionId?: string | null;
    status: 'success' | 'error';
    inputSummary?: Record<string, unknown> | null;
    outputSummary?: Record<string, unknown> | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
};

export type WorkFinishInput = {
    organizationId: string;
    userId: string;
    workId: string;
    status: Extract<WorkStatus, 'active' | 'completed' | 'error'>;
    summaryTitle?: string | null;
    findings: Array<string | WorkFindingInput>;
    steps: string[];
};

export type WorkFindingInput = {
    title: string;
    content?: string | null;
    evidenceArtifactIds?: string[];
};

export type WorkFinding = {
    id: string;
    title: string;
    content: string | null;
    createdAt: Date;
    evidence: Array<{ id: string; title: string; type: string; rowCount: number | null }>;
};

export type WorkSqlSnapshotPayload = {
    session: {
        sessionId: string;
        userId?: string | null;
        tabId?: string | null;
        connectionId?: string | null;
        database?: string | null;
        sqlText: string;
        status: 'running' | 'success' | 'error' | 'canceled' | string;
        errorMessage?: string | null;
        startedAt?: string | Date | number | null;
        finishedAt?: string | Date | number | null;
        durationMs?: number | null;
        resultSetCount?: number | null;
        stopOnError?: boolean | null;
        source?: string | null;
    };
    queryResultSets: Array<Record<string, unknown> & { sessionId: string; setIndex: number; sqlText: string }>;
    results: unknown[][];
};

export type WorkSqlSnapshotArtifact = {
    artifactId: string;
    resultSetId: string;
    title: string;
    rowCount: number;
};

function toDate(value: unknown, fallback?: Date | null): Date | null {
    if (value instanceof Date) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
    if (typeof value === 'string' && value) return new Date(value);
    return fallback ?? null;
}

function getString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function getNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown): boolean {
    return value === true;
}

function compactToolInput(input: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const key of [
        'operation',
        'connectionId',
        'database',
        'table',
        'query',
        'limit',
        'workspaceMode',
        'targetTabId',
        'tabName',
        'workId',
        'externalSessionId',
        'title',
        'status',
        'summaryTitle',
        'userQuestion',
        'question',
        'prompt',
    ]) {
        if (typeof input[key] !== 'undefined') out[key] = input[key];
    }
    if (typeof input.sql === 'string') {
        out.sqlLength = input.sql.length;
    }
    if (Array.isArray(input.findings)) {
        out.findingCount = input.findings.length;
    }
    if (Array.isArray(input.steps)) {
        out.stepCount = input.steps.length;
    }
    return out;
}

function cleanSummaryItems(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function normalizeFinding(input: string | WorkFindingInput) {
    if (typeof input === 'string') return { title: input.trim(), content: null, evidenceArtifactIds: [] };
    return {
        title: input.title.trim(),
        content: input.content?.trim() || null,
        evidenceArtifactIds: [...new Set(input.evidenceArtifactIds ?? [])],
    };
}

function getAgentRunSummaryMetadata(metadata: Record<string, unknown>) {
    const raw = metadata.agentRunSummary;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            summaryTitle: null,
            findings: [],
            steps: [],
            sections: [],
        };
    }

    const record = raw as Record<string, unknown>;
    const summaryTitle = typeof record.summaryTitle === 'string' && record.summaryTitle.trim() ? record.summaryTitle.trim() : null;
    const sections = Array.isArray(record.sections)
        ? record.sections
              .map(section => {
                  if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
                  const sectionRecord = section as Record<string, unknown>;
                  const findings = cleanSummaryItems(sectionRecord.findings);
                  const steps = cleanSummaryItems(sectionRecord.steps);
                  const finishedAt = typeof sectionRecord.finishedAt === 'string' && sectionRecord.finishedAt.trim() ? sectionRecord.finishedAt : null;
                  if ((!findings.length && !steps.length) || !finishedAt) return null;

                  return {
                      summaryTitle: typeof sectionRecord.summaryTitle === 'string' && sectionRecord.summaryTitle.trim() ? sectionRecord.summaryTitle.trim() : null,
                      findings,
                      steps,
                      finishedAt,
                  };
              })
              .filter((section): section is { summaryTitle: string | null; findings: string[]; steps: string[]; finishedAt: string } => Boolean(section))
        : [];

    return {
        summaryTitle,
        findings: cleanSummaryItems(record.findings),
        steps: cleanSummaryItems(record.steps),
        sections,
    };
}

export class PostgresWorksRepository {
    private db!: PostgresDBClient;

    constructor(
        private readonly artifacts: DoryArtifactStore = getDoryArtifactStore(),
        private readonly fullDataWriter: ResultSetDataWriter = createDefaultResultSetDataWriter(),
    ) {}

    async init() {
        try {
            this.db = (await getClient()) as PostgresDBClient;
            if (!this.db) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError(translateDatabase('Database.Errors.NotInitialized'), 500);
    }

    async create(input: ResolveWorkInput): Promise<WorkRecord> {
        this.assertInited();
        if (input.externalSessionId?.trim()) {
            const existing = await this.resolveExisting(input);
            if (existing) return existing;
        }

        const now = new Date();
        const [row] = await this.db
            .insert(works)
            .values({
                workId: input.workId?.trim() || newEntityId(),
                organizationId: input.organizationId,
                userId: input.userId,
                tokenId: input.tokenId ?? null,
                connectionId: input.connectionId ?? null,
                externalSessionId: input.externalSessionId ?? null,
                title: input.title?.trim() || DEFAULT_WORK_TITLE,
                status: 'active',
                metadata: input.metadata ?? null,
                createdAt: now,
                updatedAt: now,
                lastActiveAt: now,
                archivedAt: null,
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to create Work', 500);
        return row as WorkRecord;
    }

    async resolve(input: ResolveWorkInput): Promise<WorkRecord> {
        const existing = await this.resolveExisting(input);
        if (existing) return existing;

        return this.create(input);
    }

    async resolveExisting(input: ResolveWorkInput): Promise<WorkRecord | null> {
        this.assertInited();
        const now = new Date();
        const requestedWorkId = input.workId?.trim();

        if (requestedWorkId) {
            const row = await this.getById({
                organizationId: input.organizationId,
                userId: input.userId,
                workId: requestedWorkId,
            });
            if (!row) return null;
            return this.prepareExistingWork(row, input, now);
        }

        const externalSessionId = input.externalSessionId?.trim();
        if (externalSessionId) {
            const conds = [
                eq(works.organizationId, input.organizationId),
                eq(works.userId, input.userId),
                eq(works.externalSessionId, externalSessionId),
                input.tokenId ? eq(works.tokenId, input.tokenId) : isNull(works.tokenId),
                isNull(works.archivedAt),
            ];
            const [existing] = await this.db
                .select()
                .from(works)
                .where(and(...conds))
                .orderBy(desc(works.lastActiveAt))
                .limit(1);

            if (existing) {
                return this.prepareExistingWork(existing as WorkRecord, input, now);
            }
        }

        return null;
    }

    async touch(workId: string, now = new Date()) {
        this.assertInited();
        await this.db.update(works).set({ updatedAt: now, lastActiveAt: now }).where(eq(works.workId, workId));
    }

    private async prepareExistingWork(row: WorkRecord, input: ResolveWorkInput, now: Date): Promise<WorkRecord> {
        const requestedConnectionId = input.connectionId?.trim() || null;
        if (requestedConnectionId && row.connectionId && row.connectionId !== requestedConnectionId) {
            throw Object.assign(new Error(`Work ${row.workId} is already bound to connection ${row.connectionId}; received ${requestedConnectionId}.`), {
                code: 'WORK_CONNECTION_MISMATCH',
                status: 409,
                details: {
                    workId: row.workId,
                    expectedConnectionId: row.connectionId,
                    receivedConnectionId: requestedConnectionId,
                },
            });
        }

        const requestedTitle = input.title?.trim() || null;
        const patch: {
            connectionId?: string | null;
            title?: string;
            updatedAt: Date;
            lastActiveAt: Date;
        } = {
            updatedAt: now,
            lastActiveAt: now,
        };

        if (requestedConnectionId && !row.connectionId) {
            patch.connectionId = requestedConnectionId;
        }

        if (requestedTitle && row.title === DEFAULT_WORK_TITLE) {
            patch.title = requestedTitle;
        }

        await this.db.update(works).set(patch).where(eq(works.workId, row.workId));
        return { ...row, ...patch } as WorkRecord;
    }

    async getById(params: { organizationId: string; userId: string; workId: string }): Promise<WorkRecord | null> {
        this.assertInited();
        const [row] = await this.db
            .select()
            .from(works)
            .where(and(eq(works.workId, params.workId), eq(works.organizationId, params.organizationId), eq(works.userId, params.userId)))
            .limit(1);
        return (row as WorkRecord | undefined) ?? null;
    }

    async list(params: { organizationId: string; userId: string; limit?: number; offset?: number }): Promise<WorkRecord[]> {
        this.assertInited();
        const parsedOffset = Number(params.offset ?? 0);
        const offset = Number.isFinite(parsedOffset) ? Math.max(Math.floor(parsedOffset), 0) : 0;
        return (await this.db
            .select()
            .from(works)
            .where(and(eq(works.organizationId, params.organizationId), eq(works.userId, params.userId), isNull(works.archivedAt)))
            .orderBy(desc(works.lastActiveAt))
            .limit(params.limit ?? 100)
            .offset(offset)) as WorkRecord[];
    }

    async listPage(params: { organizationId: string; userId: string; limit?: number; offset?: number }): Promise<WorkListPage> {
        this.assertInited();
        const parsedLimit = Number(params.limit ?? 20);
        const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(Math.floor(parsedLimit), 100)) : 20;
        const parsedOffset = Number(params.offset ?? 0);
        const offset = Number.isFinite(parsedOffset) ? Math.max(Math.floor(parsedOffset), 0) : 0;
        const whereCondition = and(eq(works.organizationId, params.organizationId), eq(works.userId, params.userId), isNull(works.archivedAt));

        const [rows, totalRows] = await Promise.all([
            this.db.select().from(works).where(whereCondition).orderBy(desc(works.lastActiveAt)).limit(limit).offset(offset),
            this.db.select({ total: count() }).from(works).where(whereCondition),
        ]);

        return {
            rows: rows as WorkRecord[],
            total: totalRows[0]?.total ?? 0,
        };
    }

    async archive(params: { organizationId: string; userId: string; workId: string }): Promise<WorkRecord | null> {
        this.assertInited();
        const now = new Date();
        const [existing] = await this.db
            .select()
            .from(works)
            .where(and(eq(works.workId, params.workId), eq(works.organizationId, params.organizationId), eq(works.userId, params.userId), isNull(works.archivedAt)))
            .limit(1);
        if (!existing) return null;

        const [row] = await this.db
            .update(works)
            .set({
                status: 'archived',
                archivedAt: now,
                updatedAt: now,
                lastActiveAt: now,
            })
            .where(and(eq(works.workId, params.workId), eq(works.organizationId, params.organizationId), eq(works.userId, params.userId), isNull(works.archivedAt)))
            .returning();

        if (row) {
            try {
                await this.purgeWorkspaceArtifacts(params);
            } catch (error) {
                await this.db
                    .update(works)
                    .set({
                        status: existing.status,
                        archivedAt: null,
                        updatedAt: new Date(),
                        lastActiveAt: existing.lastActiveAt,
                    })
                    .where(and(eq(works.workId, params.workId), eq(works.organizationId, params.organizationId), eq(works.userId, params.userId)));
                throw error;
            }
        }

        return (row as WorkRecord | undefined) ?? null;
    }

    private async purgeWorkspaceArtifacts(params: { organizationId: string; userId: string; workId: string }): Promise<void> {
        const resultSetRows = await this.db
            .select({
                id: resultSetsTable.id,
                artifactRefJson: resultSetsTable.artifactRefJson,
            })
            .from(resultSetsTable)
            .where(or(eq(resultSetsTable.workId, params.workId), eq(resultSetsTable.agentRunId, params.workId)));
        const resultSetIds = resultSetRows.map(row => row.id);

        await Promise.all(resultSetRows.map(row => this.artifacts.resultSets.deleteResultSet(row.artifactRefJson)));
        await this.artifacts.agentRuns.deleteAgentRun(this.artifacts.agentRuns.ref(params.organizationId, params.workId));

        await Promise.all([
            resultSetIds.length ? this.db.delete(agentRunResultSets).where(inArray(agentRunResultSets.resultSetId, resultSetIds)) : Promise.resolve(),
            this.db.delete(agentRunResultSets).where(eq(agentRunResultSets.agentRunId, params.workId)),
            this.db.delete(resultSetsTable).where(or(eq(resultSetsTable.workId, params.workId), eq(resultSetsTable.agentRunId, params.workId))),
            this.db.delete(queryRuns).where(or(eq(queryRuns.workId, params.workId), eq(queryRuns.agentRunId, params.workId))),
            this.db.delete(workQueryResultSets).where(eq(workQueryResultSets.workId, params.workId)),
            this.db.delete(workQuerySessions).where(eq(workQuerySessions.workId, params.workId)),
            this.db.delete(workChartStates).where(eq(workChartStates.workId, params.workId)),
            this.db.delete(tabs).where(and(eq(tabs.userId, params.userId), eq(tabs.workId, params.workId))),
        ]);
    }

    async listEvents(params: { organizationId: string; userId: string; workId: string }): Promise<WorkEventRecord[]> {
        this.assertInited();
        return (await this.db
            .select()
            .from(workEvents)
            .where(and(eq(workEvents.organizationId, params.organizationId), eq(workEvents.userId, params.userId), eq(workEvents.workId, params.workId)))
            .orderBy(desc(workEvents.createdAt))) as WorkEventRecord[];
    }

    async recordEvent(input: WorkEventCreateInput): Promise<WorkEventRecord> {
        this.assertInited();
        const [row] = await this.db
            .insert(workEvents)
            .values({
                workId: input.workId,
                organizationId: input.organizationId,
                userId: input.userId,
                tokenId: input.tokenId ?? null,
                connectionId: input.connectionId ?? null,
                toolName: input.toolName,
                actionId: input.actionId ?? null,
                status: input.status,
                inputSummary: input.inputSummary ?? null,
                outputSummary: input.outputSummary ?? null,
                errorCode: input.errorCode ?? null,
                errorMessage: input.errorMessage ?? null,
                durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
            })
            .returning();

        await this.appendAgentRunEvent(input, row);
        await this.touch(input.workId);
        return row as WorkEventRecord;
    }

    async finishWithSummary(input: WorkFinishInput): Promise<WorkRecord> {
        this.assertInited();
        const existing = await this.getById({
            organizationId: input.organizationId,
            userId: input.userId,
            workId: input.workId,
        });
        if (!existing) {
            throw Object.assign(new Error(`Work not found: ${input.workId}.`), {
                code: 'WORK_NOT_FOUND',
                status: 404,
                details: {
                    workId: input.workId,
                },
            });
        }

        const now = new Date();
        const finishedAt = now.toISOString();
        const currentMetadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata : {};
        const existingSummary = getAgentRunSummaryMetadata(currentMetadata);
        const normalizedFindings = input.findings.map(normalizeFinding).filter(finding => finding.title);
        const newFindings = normalizedFindings.map(finding => finding.title);
        const newSteps = cleanSummaryItems(input.steps);
        const nextFindings = [...existingSummary.findings, ...newFindings];
        const nextSteps = [...existingSummary.steps, ...newSteps];
        const metadata = {
            ...currentMetadata,
            agentRunSummary: {
                summaryTitle: input.summaryTitle?.trim() || existingSummary.summaryTitle,
                findings: nextFindings,
                steps: nextSteps,
                sections: [
                    ...existingSummary.sections,
                    {
                        summaryTitle: input.summaryTitle?.trim() || null,
                        findings: newFindings,
                        steps: newSteps,
                        finishedAt,
                    },
                ],
                updatedAt: finishedAt,
            },
        };

        // Agents sometimes omit evidence IDs even when the Run produced snapshots.
        // Use those snapshots as a new-Finding fallback; explicit IDs still take
        // precedence and a Run with no Artifacts remains uncited.
        const inferredEvidenceArtifactIds = await this.db
            .select({ id: artifacts.id })
            .from(artifacts)
            .where(
                and(
                    eq(artifacts.organizationId, input.organizationId),
                    or(eq(artifacts.workId, input.workId), eq(artifacts.agentRunId, input.workId)),
                ),
            )
            .orderBy(desc(artifacts.createdAt))
            .limit(20);
        const findingsToCreate = normalizedFindings.map(finding =>
            !finding.evidenceArtifactIds.length && inferredEvidenceArtifactIds.length
                ? { ...finding, evidenceArtifactIds: inferredEvidenceArtifactIds.map(artifact => artifact.id) }
                : finding,
        );

        const [row] = await this.db.transaction(async tx => {
            const evidenceIds = [...new Set(findingsToCreate.flatMap(finding => finding.evidenceArtifactIds))];
            if (evidenceIds.length) {
                const evidenceRows = await tx
                    .select({ id: artifacts.id })
                    .from(artifacts)
                    .where(
                        and(
                            eq(artifacts.organizationId, input.organizationId),
                            or(eq(artifacts.workId, input.workId), eq(artifacts.agentRunId, input.workId)),
                            inArray(artifacts.id, evidenceIds),
                        ),
                    );
                if (evidenceRows.length !== evidenceIds.length) {
                    throw new DatabaseError('Finding evidence must be an Artifact produced by this Agent Run', 400);
                }
            }
            for (const finding of findingsToCreate) {
                const [created] = await tx
                    .insert(findings)
                    .values({ organizationId: input.organizationId, workId: input.workId, title: finding.title, content: finding.content })
                    .returning({ id: findings.id });
                if (finding.evidenceArtifactIds.length) {
                    await tx.insert(findingArtifacts).values(finding.evidenceArtifactIds.map(artifactId => ({ findingId: created.id, artifactId })));
                }
            }
            return tx
                .update(works)
                .set({ status: input.status, metadata, updatedAt: now, lastActiveAt: now })
                .where(and(eq(works.workId, input.workId), eq(works.organizationId, input.organizationId), eq(works.userId, input.userId)))
                .returning();
        });

        if (!row) throw new DatabaseError('Failed to finish Work', 500);
        return row as WorkRecord;
    }

    async listFindings(input: { organizationId: string; userId: string; workId: string }): Promise<WorkFinding[]> {
        this.assertInited();
        const owned = await this.getById(input);
        if (!owned) throw new DatabaseError('Work not found', 404);
        const rows = await this.db
            .select({ finding: findings, artifact: artifacts, rowCount: resultSetsTable.rowCount })
            .from(findings)
            .leftJoin(findingArtifacts, eq(findingArtifacts.findingId, findings.id))
            .leftJoin(artifacts, eq(artifacts.id, findingArtifacts.artifactId))
            .leftJoin(resultSetsTable, and(eq(resultSetsTable.organizationId, artifacts.organizationId), eq(resultSetsTable.id, artifacts.sourceResultSetId)))
            .where(and(eq(findings.organizationId, input.organizationId), eq(findings.workId, input.workId)))
            .orderBy(findings.createdAt);
        const grouped = new Map<string, WorkFinding>();
        for (const row of rows) {
            const finding = grouped.get(row.finding.id) ?? { id: row.finding.id, title: row.finding.title, content: row.finding.content, createdAt: row.finding.createdAt, evidence: [] };
            if (row.artifact) finding.evidence.push({ id: row.artifact.id, title: row.artifact.title, type: row.artifact.type, rowCount: row.rowCount ?? null });
            grouped.set(finding.id, finding);
        }
        return [...grouped.values()];
    }

    summarizeInput(input: unknown) {
        return input && typeof input === 'object' && !Array.isArray(input) ? compactToolInput(input as Record<string, unknown>) : {};
    }

    async saveSqlSnapshot(workId: string, payload: WorkSqlSnapshotPayload): Promise<WorkSqlSnapshotArtifact[]> {
        this.assertInited();
        const session = payload.session;
        const sessionId = session.sessionId;
        const work = await this.getWorkById(workId);
        if (!work) throw new DatabaseError('Work not found', 404);

        await this.db
            .insert(workQuerySessions)
            .values({
                workId,
                sessionId,
                userId: session.userId ?? '',
                tabId: session.tabId ?? '',
                connectionId: session.connectionId ?? null,
                database: session.database ?? null,
                sqlText: session.sqlText,
                status: session.status,
                errorMessage: session.errorMessage ?? null,
                startedAt: toDate(session.startedAt, new Date()) ?? new Date(),
                finishedAt: toDate(session.finishedAt, null),
                durationMs: session.durationMs ?? null,
                resultSetCount: session.resultSetCount ?? payload.queryResultSets.length,
                stopOnError: Boolean(session.stopOnError),
                source: session.source ?? null,
            })
            .onConflictDoUpdate({
                target: [workQuerySessions.workId, workQuerySessions.sessionId],
                set: {
                    userId: session.userId ?? '',
                    tabId: session.tabId ?? '',
                    connectionId: session.connectionId ?? null,
                    database: session.database ?? null,
                    sqlText: session.sqlText,
                    status: session.status,
                    errorMessage: session.errorMessage ?? null,
                    startedAt: toDate(session.startedAt, new Date()) ?? new Date(),
                    finishedAt: toDate(session.finishedAt, null),
                    durationMs: session.durationMs ?? null,
                    resultSetCount: session.resultSetCount ?? payload.queryResultSets.length,
                    stopOnError: Boolean(session.stopOnError),
                    source: session.source ?? null,
                },
            });

        await this.db.delete(workQueryResultSets).where(and(eq(workQueryResultSets.workId, workId), eq(workQueryResultSets.sessionId, sessionId)));

        const compatibilityRows: Array<typeof workQueryResultSets.$inferInsert> = [];
        const savedArtifacts: WorkSqlSnapshotArtifact[] = [];
        const now = new Date();

        for (const [index, resultSet] of payload.queryResultSets.entries()) {
            const rows = Array.isArray(payload.results[index]) ? payload.results[index]! : [];
            const artifactId = `rs_${newEntityId()}`;
            const queryRunId = `qr_${newEntityId()}`;
            const actorType = inferActorType(session.source);
            const status = getString(resultSet.status) ?? session.status ?? 'success';
            const columns = inferResultSetColumns(rows, resultSet.columns);
            const rowCount = getNumber(resultSet.rowCount) ?? rows.length;
            const preview = buildResultSetPreview({
                columns,
                rows,
                rowCount,
            });
            const schemaIpc = Buffer.from(
                schemaToIpc(createDataSchema(columns.map(column => ({ name: column.name, type: column.databaseType ?? column.logicalType, nullable: column.nullable })))),
            );
            const limited = getBoolean(resultSet.limited) || preview.truncated;
            const manifest: ResultSetManifest = {
                format: 'dory.resultset.v2',
                artifactId,
                organizationId: work.organizationId,
                kind: 'sql-result-set',
                status,
                source: {
                    type: 'query-run',
                    queryRunId,
                    connectionId: session.connectionId ?? work.connectionId ?? null,
                    workspaceId: null,
                    tabId: session.tabId ?? null,
                    workId,
                    agentRunId: workId,
                    actorType,
                    actorId: session.userId ?? work.userId ?? null,
                },
                sql: {
                    text: resultSet.sqlText || session.sqlText,
                    dialect: session.database ?? null,
                    operation: getString(resultSet.sqlOp) ?? 'unknown',
                },
                error:
                    status === 'error'
                        ? {
                              message: getString(resultSet.errorMessage) ?? session.errorMessage ?? null,
                              code: getString(resultSet.errorCode),
                              sqlState: getString(resultSet.errorSqlState),
                              meta: resultSet.errorMeta ?? undefined,
                          }
                        : undefined,
                schema: columns,
                rowCount,
                previewRowCount: preview.previewRowCount,
                limited,
                limit: getNumber(resultSet.limit),
                files: {},
                lineage: {},
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
                contentHash: null,
            };
            const fullData = await this.writeFullDataArtifact({
                artifactId,
                status,
                columns,
                rows,
            });
            manifest.batchCount = fullData?.batchCount ?? (rows.length ? 1 : 0);

            const { ref, manifest: persistedManifest } = await this.artifacts.resultSets
                .putResultSet({
                    organizationId: work.organizationId,
                    artifactId,
                    manifest,
                    schema: schemaIpc,
                    preview: rows.length || status === 'success' ? preview : null,
                    dataParts: fullData?.parts ?? null,
                })
                .finally(() => fullData?.cleanup?.().catch(() => undefined));

            try {
                await this.db.insert(queryRuns).values({
                    id: queryRunId,
                    organizationId: work.organizationId,
                    connectionId: session.connectionId ?? work.connectionId ?? null,
                    workspaceId: null,
                    tabId: session.tabId ?? null,
                    workId,
                    agentRunId: workId,
                    sessionId,
                    setIndex: resultSet.setIndex,
                    actorType,
                    actorId: session.userId ?? work.userId ?? null,
                    sql: resultSet.sqlText || session.sqlText,
                    status,
                    durationMs: getNumber(resultSet.durationMs) ?? session.durationMs ?? null,
                    errorMessage: getString(resultSet.errorMessage) ?? session.errorMessage ?? null,
                    resultSetId: artifactId,
                    createdAt: now,
                    updatedAt: now,
                });

                await this.db.insert(resultSetsTable).values({
                    id: artifactId,
                    organizationId: work.organizationId,
                    connectionId: session.connectionId ?? work.connectionId ?? null,
                    workspaceId: null,
                    tabId: session.tabId ?? null,
                    workId,
                    agentRunId: workId,
                    sessionId,
                    setIndex: resultSet.setIndex,
                    sourceQueryRunId: queryRunId,
                    sourceType: 'query-run',
                    kind: 'sql-result-set',
                    status,
                    rowCount,
                    previewRowCount: preview.previewRowCount,
                    limited,
                    limit: getNumber(resultSet.limit),
                    schemaJson: columns,
                    sql: resultSet.sqlText || session.sqlText,
                    operation: getString(resultSet.sqlOp),
                    errorMessage: getString(resultSet.errorMessage) ?? session.errorMessage ?? null,
                    artifactRefJson: ref,
                    dataAvailability: resultSetDataAvailability(persistedManifest),
                    createdByActorType: actorType,
                    createdByActorId: session.userId ?? work.userId ?? null,
                    byteSize: persistedManifest.byteSize ?? 0,
                    createdAt: now,
                    updatedAt: now,
                });

                await this.db
                    .insert(artifacts)
                    .values({
                        id: `artifact_${artifactId}`,
                        organizationId: work.organizationId,
                        type: 'result_set',
                        title: getString(resultSet.title) ?? `Result Set ${artifactId.slice(3, 11)}`,
                        status: status === 'error' ? 'unavailable' : 'ready',
                        resourceId: artifactId,
                        sourceResultSetId: artifactId,
                        connectionId: session.connectionId ?? work.connectionId ?? null,
                        workId,
                        agentRunId: workId,
                        sourceType: 'query-run',
                        createdByActorType: actorType,
                        createdByActorId: session.userId ?? work.userId ?? null,
                        byteSize: persistedManifest.byteSize ?? 0,
                        expiresAt: null,
                        createdAt: now,
                        updatedAt: now,
                    })
                    .onConflictDoNothing();

                await this.db.insert(agentRunResultSets).values({
                    agentRunId: workId,
                    resultSetId: artifactId,
                    queryRunId,
                    role: 'generated',
                    createdAt: now,
                });

                savedArtifacts.push({
                    artifactId: `artifact_${artifactId}`,
                    resultSetId: artifactId,
                    title: getString(resultSet.title) ?? `Result Set ${artifactId.slice(3, 11)}`,
                    rowCount,
                });
            } catch (error) {
                await this.artifacts.resultSets.deleteResultSet(ref).catch(() => undefined);
                throw error;
            }

            compatibilityRows.push({
                workId,
                sessionId,
                setIndex: resultSet.setIndex,
                sqlText: resultSet.sqlText,
                sqlOp: getString(resultSet.sqlOp),
                title: getString(resultSet.title),
                columns: resultSet.columns ?? null,
                stats: resultSet.stats ?? null,
                viewState: resultSet.viewState ?? null,
                aiProfileVersion: getNumber(resultSet.aiProfileVersion) ?? 1,
                rowCount,
                limited,
                limit: getNumber(resultSet.limit),
                affectedRows: getNumber(resultSet.affectedRows),
                status,
                errorMessage: getString(resultSet.errorMessage),
                errorCode: getString(resultSet.errorCode),
                errorSqlState: getString(resultSet.errorSqlState),
                errorMeta: resultSet.errorMeta ?? null,
                warnings: resultSet.warnings ?? null,
                startedAt: toDate(resultSet.startedAt, null),
                finishedAt: toDate(resultSet.finishedAt, null),
                durationMs: getNumber(resultSet.durationMs),
                resultSetId: artifactId,
                artifactRefJson: ref,
            });
        }

        if (payload.queryResultSets.length) {
            await this.db.insert(workQueryResultSets).values(compatibilityRows);
        }

        const currentResultSetId = compatibilityRows.at(-1)?.resultSetId ?? null;
        if (currentResultSetId && session.tabId && session.userId) {
            await this.db
                .update(tabs)
                .set({ currentResultSetId, updatedAt: now })
                .where(and(eq(tabs.tabId, session.tabId), eq(tabs.userId, session.userId)));
        }

        return savedArtifacts;
    }

    async getSnapshot(params: { organizationId: string; userId: string; workId: string }) {
        this.assertInited();
        const work = await this.getById(params);
        if (!work) return null;

        const [tabRows, sessionRows, resultSetRows, chartRows] = await Promise.all([
            this.db
                .select()
                .from(tabs)
                .where(and(eq(tabs.userId, params.userId), eq(tabs.workId, params.workId)))
                .orderBy(tabs.orderIndex, tabs.createdAt),
            this.db.select().from(workQuerySessions).where(eq(workQuerySessions.workId, params.workId)).orderBy(workQuerySessions.startedAt),
            this.db.select().from(workQueryResultSets).where(eq(workQueryResultSets.workId, params.workId)).orderBy(workQueryResultSets.sessionId, workQueryResultSets.setIndex),
            this.db.select().from(workChartStates).where(eq(workChartStates.workId, params.workId)),
        ]);

        const sessions = await Promise.all(
            sessionRows.map(async session => {
                const sets = resultSetRows.filter(resultSet => resultSet.sessionId === session.sessionId);
                return {
                    session,
                    queryResultSets: sets,
                    results: await Promise.all(
                        sets.map(async resultSet => {
                            return this.readPreviewRows(resultSet.artifactRefJson);
                        }),
                    ),
                };
            }),
        );

        return {
            work,
            tabs: tabRows,
            sessions,
            chartStates: chartRows,
        };
    }

    private async getWorkById(workId: string): Promise<WorkRecord | null> {
        const [row] = await this.db.select().from(works).where(eq(works.workId, workId)).limit(1);
        return (row as WorkRecord | undefined) ?? null;
    }

    private async readPreviewRows(ref: ResultSetArtifactRef | null | undefined): Promise<unknown[]> {
        if (!ref) return [];
        try {
            const preview = await this.artifacts.resultSets.readPreview(ref);
            return preview?.rows ?? [];
        } catch (error) {
            console.warn('[works] saved result preview is unavailable', {
                artifactId: ref.artifactId,
                error,
            });
            return [];
        }
    }

    private async writeFullDataArtifact(input: { artifactId: string; status: string; columns: ResultSetManifest['schema']; rows: unknown[] }) {
        if (input.status !== 'success') return null;
        if (!input.columns.length) return null;
        try {
            return await this.fullDataWriter.write({
                artifactId: input.artifactId,
                dataStream: rowDataStream({
                    columns: input.columns.map(column => ({ name: column.name, type: column.databaseType ?? column.logicalType, nullable: column.nullable })),
                    rows: input.rows,
                    rowCount: input.rows.length,
                    metadata: { source: 'saved-work-result-set' },
                }),
                target: null,
            });
        } catch (error) {
            console.warn('[works] failed to write full result-set data artifact', {
                artifactId: input.artifactId,
                error,
            });
            return null;
        }
    }

    private async appendAgentRunEvent(input: WorkEventCreateInput, row: unknown): Promise<void> {
        try {
            const ref = this.artifacts.agentRuns.ref(input.organizationId, input.workId);
            await this.artifacts.agentRuns.appendEvent(ref, row);
        } catch (error) {
            console.warn('[works] failed to append agent run event artifact', {
                workId: input.workId,
                error,
            });
        }
    }
}

function inferActorType(source: string | null | undefined): 'agent' | 'mcp' | 'user' | 'automation' {
    if (source === 'mcp' || source === 'external-agent') return 'mcp';
    if (source === 'automation') return 'automation';
    if (source === 'user') return 'user';
    return 'agent';
}
