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
    sessionId: z.string(),
    query: queryExecutionOutputSchema,
    resultMeta: z.record(z.string(), z.unknown()),
});

type QueryExecutionOutput = z.infer<typeof queryExecutionOutputSchema>;

function resultMetaFromQuery(input: {
    query: Record<string, any>;
    workId: string;
    workRunId?: string | null;
    workRunEventId?: string | null;
    sessionId: string;
}): TabResultMetaPayload {
    const firstSet = Array.isArray(input.query.queryResultSets) ? (input.query.queryResultSets[0] as Record<string, any> | undefined) : undefined;
    const columns = Array.isArray(firstSet?.columns) ? firstSet.columns.length : undefined;
    return {
        rows: typeof firstSet?.rowCount === 'number' ? firstSet.rowCount : undefined,
        columns,
        durationMs: typeof input.query.session?.durationMs === 'number' ? input.query.session.durationMs : typeof firstSet?.durationMs === 'number' ? firstSet.durationMs : undefined,
        sessionId: input.sessionId,
        workId: input.workId,
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
            resultSetCount: (output.query as any).session?.resultSetCount ?? null,
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
        });

        await executeAction(ctx, 'work.updateInvestigation', {
            workId: work.id,
            id: investigation.id,
            linkedTabId: tabId,
            lastQueryAt: new Date().toISOString(),
        });

        return {
            tabId,
            sessionId,
            query,
            resultMeta: resultMeta as Record<string, unknown>,
        };
    },
});
