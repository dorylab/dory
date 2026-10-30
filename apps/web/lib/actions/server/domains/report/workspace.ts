import { listTablesOperation } from '@/lib/ai/tools/dory-tool-operations';
import { actionOperationContext } from '../../operation-context';
import { reportWorkingDraftActions } from './working-draft';
import { randomUUID } from 'node:crypto';
import type { ActionContext } from '@dory/actions';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { loadReportEvidence, optionalArtifact, reportWorkspaceContext } from '@/lib/server/report-workspace-context';
import type { ReportWorkspaceContext, ReportWorkspaceResult, ReportWorkspaceSourceInfo } from '@dory/shared/types/report-workspace';
import { z } from 'zod';

import { prepareReportAttachments, runReportAttachments } from '@/lib/server/chat-attachment-data';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import type { WebActionServices } from '../../types';
import { executeSqlActionStream } from '../query/execute-operation';

export const reportEvidenceReferenceSchema = z.object({
    documentId: z.string().min(1),
    artifactId: z.string().min(1),
    revision: z.number().int().positive(),
    publicationId: z.string().min(1).optional(),
    snapshotId: z.string().min(1).optional(),
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
    inputSchema: reportEvidenceReferenceSchema,
    outputSchema: z.custom<ReportWorkspaceSourceInfo>(),
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user'],
    handler: async (ctx, reference): Promise<ReportWorkspaceSourceInfo> => {
        const { evidence, source } = await reportWorkspaceContext(ctx, reference);
        if (source.kind === 'unavailable') return { available: false, reason: source.reason, tables: [] };
        if (!evidence.sql) return { available: false, reason: 'No SQL was saved with this snapshot.', tables: [] };
        const available = Boolean(ctx.access.permissions.workspace.write);
        const reason = available ? undefined : 'You do not have permission to run queries.';
        if (source.kind === 'database') {
            try {
                const result = await listTablesOperation(actionOperationContext(ctx, 'dory_schema_metadata'), {
                    connectionId: source.connectionId,
                    database: source.database ?? 'main',
                });
                return { available, reason, tables: result.tables.map(table => ({ name: table.name, filename: table.schema ?? '', columns: [] })) };
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
    inputSchema: reportEvidenceReferenceSchema.extend({ sql: z.string().trim().min(1).max(100_000), requestId: z.string().uuid(), workingDraft: z.boolean().optional() }),
    outputSchema: z.custom<ReportWorkspaceResult>(),
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user'],
    audit: { sourceByActor: { user: 'user_sql_console' }, allowInputFields: ['documentId', 'artifactId', 'revision', 'snapshotId', 'requestId'] },
    handler: async (ctx, input): Promise<ReportWorkspaceResult> => {
        const { source, evidence } = await reportWorkspaceContext(ctx, input);
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
            const result = await runReportAttachments(ctx.services.db, owner(ctx), evidence.attachmentSource!, input.sql, sessionId, ctx.signal ?? ctx.services.req?.signal);
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
                sql: input.sql,
                sessionId,
                source: 'sql-console',
                limit: 1000,
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
                        limited: Boolean(set.limited) || Number(set.rowCount ?? rows.length) > rows.length,
                        ...(set.status === 'error' ? { error: String(set.errorMessage ?? 'Query failed.') } : {}),
                    };
                }),
            ),
        });
    },
});
export const reportWorkspaceActions = [contextAction, sourceAction, detailsAction, executeAction, ...reportWorkingDraftActions];
