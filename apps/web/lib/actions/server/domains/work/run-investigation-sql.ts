import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TabResultMetaPayload } from '@dory/shared/types/tabs';
import { defineWebAction } from '../../define-web-action';
import { queryExecutionOutputSchema } from '../../schemas';
import { writeWorkspace } from '../../policies';

const inputSchema = z.object({
    workId: z.string().min(1),
    investigationId: z.string().min(1),
    sql: z.string().trim().min(1),
    database: z.string().trim().nullable().optional(),
    title: z.string().trim().nullable().optional(),
    runId: z.string().min(1).optional(),
});

const outputSchema = z.object({
    tabId: z.string(),
    investigationId: z.string(),
    sessionId: z.string(),
    query: queryExecutionOutputSchema,
    resultMeta: z.record(z.string(), z.unknown()),
});

type QueryExecutionOutput = z.infer<typeof queryExecutionOutputSchema>;

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function resultMetaFromQuery(input: {
    query: unknown;
    workId: string;
    workRunId?: string | null;
    workRunEventId?: string | null;
    investigationId: string;
    sessionId: string;
}): TabResultMetaPayload {
    const query = asRecord(input.query);
    const session = asRecord(query?.session);
    const queryResultSets = Array.isArray(query?.queryResultSets) ? query.queryResultSets : [];
    const firstSet = asRecord(queryResultSets[0]);
    const columns = Array.isArray(firstSet?.columns) ? firstSet.columns.length : undefined;
    return {
        rows: typeof firstSet?.rowCount === 'number' ? firstSet.rowCount : undefined,
        columns,
        durationMs: typeof session?.durationMs === 'number' ? session.durationMs : typeof firstSet?.durationMs === 'number' ? firstSet.durationMs : undefined,
        sessionId: input.sessionId,
        workId: input.workId,
        investigationId: input.investigationId,
        workRunId: input.workRunId ?? undefined,
        workRunEventId: input.workRunEventId ?? undefined,
        source: 'work-run',
    };
}

export const workRunInvestigationSqlAction = defineWebAction({
    id: 'work.runInvestigationSql',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:sql', 'tab:create', 'query:execute'],
    inputSchema,
    outputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write', 'tabs:write', 'query:read'],
    actors: ['agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'investigationId', 'database', 'title', 'runId'],
        inputSummary: input => ({
            workId: input.workId,
            investigationId: input.investigationId,
            database: input.database ?? null,
            title: input.title ?? null,
            runId: input.runId ?? null,
            sqlLength: input.sql.length,
        }),
        resource: (_ctx, input) => ({ type: 'work', id: input.workId }),
        outputSummary: output => ({
            tabId: output.tabId,
            sessionId: output.sessionId,
            resultSetCount: asRecord(asRecord(output.query)?.session)?.resultSetCount ?? null,
        }),
    },
    handler: async (ctx, input) => {
        const work = await ctx.services.db.works.getById({ organizationId: ctx.organizationId, id: input.workId });
        if (!work) throw new Error('Work not found.');

        const investigation = await ctx.services.db.works.getInvestigationById({
            organizationId: ctx.organizationId,
            workId: work.id,
            id: input.investigationId,
        });
        if (!investigation) throw new Error('Work investigation not found.');

        const { executeAction } = await import('../../execute');
        const tabId = randomUUID();
        const sessionId = randomUUID();
        const tabName = input.title || investigation.title;
        const database = input.database ?? null;
        const workspaceScope = {
            type: 'work_investigation' as const,
            workId: work.id,
            investigationId: investigation.id,
        };

        const queryEnvelope = await executeAction<QueryExecutionOutput>(ctx, 'query.readOnlyExecute', {
            connectionId: work.connectionId,
            database,
            sql: input.sql,
            limit: 100,
            tabId,
            sessionId,
            source: 'work-run',
        });
        const query = queryEnvelope.data;

        const initialResultMeta = resultMetaFromQuery({
            query,
            workId: work.id,
            investigationId: investigation.id,
            workRunId: input.runId ?? null,
            workRunEventId: null,
            sessionId,
        });

        await executeAction(ctx, 'tab.create', {
            connectionId: work.connectionId,
            tabId,
            tabType: 'sql',
            tabName,
            content: input.sql,
            databaseName: database,
            resultMeta: initialResultMeta,
            workspaceScope,
        });

        const event = input.runId
            ? await ctx.services.db.works.appendRunEvent({
                  runId: input.runId,
                  workId: work.id,
                  organizationId: ctx.organizationId,
                  type: 'sql_executed',
                  role: 'tool',
                  content: tabName,
                  payload: {
                      toolName: 'work_runInvestigationSql',
                      workId: work.id,
                      investigationId: investigation.id,
                      tabId,
                      sessionId,
                      sql: input.sql,
                      database,
                      query,
                  },
              })
            : null;

        const resultMeta = resultMetaFromQuery({
            query,
            workId: work.id,
            investigationId: investigation.id,
            workRunId: input.runId ?? null,
            workRunEventId: event?.id ?? null,
            sessionId,
        });

        await executeAction(ctx, 'tab.save', {
            connectionId: work.connectionId,
            tabId,
            state: {
                tabId,
                tabType: 'sql',
                tabName,
                content: input.sql,
                databaseName: database,
                orderIndex: null,
                resultMeta,
            },
            resultMeta,
            workspaceScope,
        });

        await executeAction(ctx, 'work.updateInvestigation', {
            workId: work.id,
            id: investigation.id,
            linkedTabId: tabId,
            lastQueryAt: new Date().toISOString(),
        });

        return {
            tabId,
            investigationId: investigation.id,
            sessionId,
            query,
            resultMeta: resultMeta as Record<string, unknown>,
        };
    },
});
