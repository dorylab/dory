import { randomUUID } from 'node:crypto';
import type { ActionContext } from '@dory/actions';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { ReportWorkspaceContext, ReportWorkspaceResult, ReportWorkspaceSourceInfo } from '@dory/shared/types/report-workspace';
import { z } from 'zod';

import { listTablesOperation } from '@/lib/ai/tools/dory-tool-operations';
import { prepareReportAttachments, runReportAttachments } from '@/lib/server/chat-attachment-data';
import { loadReportEvidence, optionalArtifact, reportWorkspaceContext } from '@/lib/server/report-workspace-context';

import { defineWebAction } from '../../define-web-action';
import { actionOperationContext } from '../../operation-context';
import { readWorkspace, writeWorkspace } from '../../policies';
import type { WebActionServices } from '../../types';
import { executeSqlActionStream } from '../query/execute-operation';
import { reportEvidenceActions } from './evidence-viewer';
import { reportWorkingDraftActions } from './working-draft';

export const reportEvidenceReferenceSchema = z.object({
    documentId: z.string().min(1),
    artifactId: z.string().default(''),
    revision: z.number().int().positive(),
    publicationId: z.string().min(1).optional(),
    snapshotId: z.string().min(1).optional(),
    componentId: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
});
type Context = ActionContext<WebActionServices>;
const owner = (ctx: Context) => ({ organizationId: ctx.organizationId, userId: ctx.userId });

const contextAction = defineWebAction({
    id: 'report.workspace.context',
    domain: 'report',
    kind: 'query',
    risk: 'read',
    inputSchema: reportEvidenceReferenceSchema,
    outputSchema: z.custom<ReportWorkspaceContext>(),
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    handler: reportWorkspaceContext,
});
const sourceAction = defineWebAction({
    id: 'report.workspace.source',
    domain: 'report',
    kind: 'query',
    risk: 'read',
    inputSchema: reportEvidenceReferenceSchema.extend({
        connectionId: z.string().optional(),
        database: z.string().nullable().optional(),
        schema: z.string().nullable().optional(),
    }),
    outputSchema: z.custom<ReportWorkspaceSourceInfo>(),
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    handler: async (ctx, reference): Promise<ReportWorkspaceSourceInfo> => {
        const { evidence, source } = await resolveWorkspaceSource(ctx, reference);
        if (source.kind === 'unavailable') return { available: false, reason: source.reason, tables: [] };

        const available = Boolean(ctx.access.permissions.workspace.write);
        const reason = available ? undefined : 'You do not have permission to run queries.';
        if (source.kind === 'database') {
            try {
                const result = await listTablesOperation(actionOperationContext(ctx, 'dory_schema_metadata'), {
                    connectionId: source.connectionId,
                    database: source.database ?? 'main',
                });
                return {
                    source,
                    available,
                    reason,
                    tables: result.tables
                        .filter(table => !source.schema || table.schema === source.schema)
                        .map(table => ({ name: table.schema ? `${table.schema}.${table.name}` : table.name, filename: table.schema ?? '', columns: [] })),
                };
            } catch (error) {
                return { available: false, reason: error instanceof Error ? error.message : 'Database connection unavailable.', tables: [] };
            }
        }
        try {
            const tables = await prepareReportAttachments(ctx.services.db, owner(ctx), evidence.attachmentSource!, ctx.services.req?.signal);
            return { available, reason, tables: tables.map(({ name, filename, columns }) => ({ name, filename, columns })) };
        } catch (error) {
            return { available: false, reason: error instanceof Error ? error.message : 'The original attachment is unavailable.', tables: [] };
        }
    },
});
const detailsAction = defineWebAction({
    id: 'report.workspace.details',
    domain: 'report',
    kind: 'query',
    risk: 'read',
    inputSchema: reportEvidenceReferenceSchema,
    outputSchema: z.object({ artifact: z.unknown().nullable(), reports: z.array(z.object({ id: z.string(), title: z.string() })) }),
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    handler: async (ctx, reference) => {
        await loadReportEvidence(ctx, reference);
        const [artifact, reports] = await Promise.all([
            optionalArtifact(ctx, reference.artifactId),
            ctx.services.db.workDocuments.listReferencingArtifact({ ...owner(ctx), artifactId: reference.artifactId }),
        ]);
        return { artifact, reports };
    },
});
const executeAction = defineWebAction({
    id: 'report.workspace.execute',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: reportEvidenceReferenceSchema.extend({
        sql: z.string().trim().min(1).max(100_000),
        requestId: z.string().uuid(),
        workingDraft: z.boolean().optional(),
        connectionId: z.string().optional(),
        database: z.string().nullable().optional(),
        schema: z.string().nullable().optional(),
        tabId: z.string().optional(),
    }),
    outputSchema: z.custom<ReportWorkspaceResult>(),
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user'],
    audit: { sourceByActor: { user: 'user_sql_console' }, allowInputFields: ['documentId', 'artifactId', 'revision', 'snapshotId', 'requestId'] },
    handler: async (ctx, input): Promise<ReportWorkspaceResult> => {
        const { source, evidence } = await resolveWorkspaceSource(ctx, input);
        if (source.kind === 'unavailable') throw new DatabaseError(source.reason, 409);
        const sessionId = randomUUID();
        const remember = async (result: ReportWorkspaceResult) => {
            if (input.workingDraft) {
                for (const set of result.sets) {
                    if (!set.resultSetId || set.error) continue;
                    await ctx.services.db.workDocuments.recordWorkingResult({
                        ...owner(ctx),
                        documentId: input.documentId,
                        baseRevision: input.revision,
                        resultId: set.resultSetId,
                        result: {
                            sourceArtifactId: input.artifactId,
                            sessionId: result.sessionId,
                            tabId: input.tabId,
                            evidence: {
                                ...evidence,
                                artifactId: `artifact_${set.resultSetId}`,
                                snapshotId: `working_${set.resultSetId}`,
                                title: evidence.title,
                                sql: set.sql,
                                rows: set.rows,
                                columns: set.columns.map(c => c.name),
                                columnTypes: set.columns,
                                rowCount: set.rowCount,
                                truncated: set.limited,
                                capturedAt: new Date().toISOString(),
                                runId: null,
                            },
                        },
                    });
                }
            }
            return result;
        };
        if (input.workingDraft && !(await ctx.services.db.workDocuments.workingDraft({ ...owner(ctx), documentId: input.documentId, baseRevision: input.revision })))
            throw new DatabaseError('Working draft not found.', 404);
        if (source.kind === 'attachment') {
            const result = await runReportAttachments(
                ctx.services.db,
                owner(ctx),
                evidence.attachmentSource!,
                input.sql,
                sessionId,
                ctx.signal ?? ctx.services.req?.signal,
                input.workingDraft ? 'report-workspace' : 'sql-console',
            );
            return remember({
                sessionId,
                sets: [{ resultSetId: result.resultSetId, sql: input.sql, columns: result.columns, rows: result.rows, rowCount: result.rows.length, limited: result.limited }],
            });
        }
        const result = await executeSqlActionStream(
            ctx,
            {
                connectionId: source.connectionId,
                database: source.database,
                schema: source.schema,
                sql: input.sql,
                sessionId,
                source: input.workingDraft ? 'report-workspace' : 'sql-console',
                tabId: input.tabId,
                limit: null,
            },
            { signal: ctx.signal ?? ctx.services.req?.signal, onEvent: () => undefined },
        );
        return remember({
            sessionId,
            sets: await Promise.all(
                result.queryResultSets.map(async (set, index) => {
                    const resultSetId = typeof set.resultSetId === 'string' ? set.resultSetId : null;
                    const saved = resultSetId && set.status !== 'error' ? await ctx.services.db.resultSets.readRows({ ...owner(ctx), resultSetId, limit: 1000 }) : null;
                    const rows = saved?.rows ?? ((result.results[index] ?? []) as Record<string, unknown>[]);
                    return {
                        resultSetId,
                        sql: String(set.sqlText ?? input.sql),
                        columns: (Array.isArray(set.columns) ? set.columns : []).map((column: { name?: unknown; type?: unknown; databaseType?: unknown }) => ({
                            name: String(column.name),
                            type: String(column.type ?? column.databaseType ?? ''),
                        })),
                        rows,
                        rowCount: Number(set.rowCount ?? rows.length),
                        limited: Boolean(set.limited),
                        ...(set.status === 'error' ? { error: String(set.errorMessage ?? 'Query failed.') } : {}),
                    };
                }),
            ),
        });
    },
});
async function resolveWorkspaceSource(
    ctx: Context,
    input: { documentId: string; revision: number; artifactId: string; connectionId?: string; database?: string | null; schema?: string | null },
) {
    if (!input.connectionId) return reportWorkspaceContext(ctx, input);
    await ctx.services.db.workDocuments.getVersion({ ...owner(ctx), documentId: input.documentId, revision: input.revision });
    if (!ctx.access.permissions.connection.read) throw new DatabaseError('Connection access required.', 403);
    const connection = await ctx.services.db.connections.getById(ctx.organizationId, input.connectionId);
    if (!connection) throw new DatabaseError('Connection unavailable.', 404);
    const database = input.database ?? connection.identities.find(identity => identity.isDefault && identity.enabled !== false)?.database ?? connection.connection.database ?? null;
    return {
        source: {
            kind: 'database' as const,
            connectionId: input.connectionId,
            database,
            schema: input.schema ?? null,
            dialect: connection.connection.type,
        },
        evidence: {
            artifactId: '',
            title: 'Query result',
            connectionId: input.connectionId,
            connectionName: connection.connection.name,
            sourceDatabaseName: database,
            sourceSchemaName: input.schema ?? null,
            sql: null,
            capturedAt: new Date().toISOString(),
            columns: [],
            rows: [],
            rowCount: null,
            truncated: false,
            runId: null,
        } as ReportWorkspaceContext['evidence'],
    };
}
const importResultAction = defineWebAction({
    id: 'report.workspace.importResult',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: z.object({ documentId: z.string(), baseRevision: z.number().int().positive(), tabId: z.string(), resultSetId: z.string() }),
    outputSchema: z.unknown(),
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const target = { ...owner(ctx), documentId: input.documentId, baseRevision: input.baseRevision };
        const draft = await ctx.services.db.workDocuments.workingDraft(target);
        const tab = draft?.state.tabs.find(item => item.id === input.tabId);
        if (!draft || !tab) throw new DatabaseError('Workspace tab unavailable.', 404);
        const artifact = await ctx.services.db.artifacts.get({ ...owner(ctx), artifactId: `artifact_${input.resultSetId}` });
        if (!ctx.access.permissions.connection.read || !artifact.resultSet || artifact.connectionId !== (tab.source?.kind === 'database' ? tab.source.connectionId : null))
            throw new DatabaseError('Result source unavailable.', 403);
        const result = await ctx.services.db.resultSets.readRows({ ...owner(ctx), resultSetId: input.resultSetId, offset: 0, limit: 200 });
        if (result.dataAvailability === 'none') throw new DatabaseError('The query result has expired.', 409);
        await ctx.services.db.workDocuments.recordWorkingResult({
            ...target,
            resultId: input.resultSetId,
            result: {
                sourceArtifactId: '',
                tabId: tab.id,
                evidence: {
                    artifactId: artifact.id,
                    snapshotId: `working_${input.resultSetId}`,
                    title: artifact.title,
                    connectionId: artifact.connectionId,
                    connectionName: artifact.connectionName,
                    sourceDatabaseName: artifact.resultSet.sourceDatabaseName,
                    sql: artifact.resultSet.sql,
                    capturedAt: new Date(artifact.createdAt).toISOString(),
                    columns: result.columns.map(column => column.name),
                    columnTypes: result.columns.map(column => ({ name: column.name, type: String(column.databaseType ?? column.logicalType ?? '') })),
                    rows: result.rows,
                    rowCount: result.rowCount,
                    truncated: artifact.resultSet.limited ?? false,
                    runId: null,
                },
            },
        });
        return ctx.services.db.workDocuments.workingDraft(target);
    },
});
export const reportWorkspaceActions = [contextAction, sourceAction, detailsAction, executeAction, importResultAction, ...reportWorkingDraftActions, ...reportEvidenceActions];
