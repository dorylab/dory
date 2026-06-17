import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ActionContext } from '@dory/actions';
import type { TabResultMetaPayload, UITabPayload } from '@dory/shared/types/tabs';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace, readWorkspace } from '../../policies';
import { queryExecutionOutputSchema } from '../../schemas';
import { executeAction } from '../../execute';
import type { WebActionServices } from '../../types';
import { getWorkWorkspaceSummary } from './workspace-summary';
import { workWorkspaceSummaryOutputSchema } from './schemas';

const workSqlTabOutputSchema = z.object({
    tabId: z.string(),
    title: z.string(),
    sql: z.string(),
});

const workWorkspaceScope = (workId: string) => ({ type: 'work' as const, workId });

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function resultMetaFromQuery(input: { query: unknown; workId: string; workRunId?: string | null; workRunEventId?: string | null; sessionId: string }): TabResultMetaPayload {
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
        workRunId: input.workRunId ?? undefined,
        workRunEventId: input.workRunEventId ?? undefined,
        source: 'work-run',
    };
}

async function loadWorkOrThrow(ctx: ActionContext<WebActionServices>, workId: string) {
    const work = await ctx.services.db.works.getById({ organizationId: ctx.organizationId, id: workId });
    if (!work) throw new Error('Work not found.');
    return work;
}

async function assertWorkHasSqlContent(ctx: ActionContext<WebActionServices>, work: { id: string; connectionId: string }) {
    const tabs = (await ctx.services.db.tabState.loadAllTab(ctx.userId, work.connectionId, workWorkspaceScope(work.id))) as unknown as UITabPayload[];
    const hasSqlContent = tabs.some(tab => tab.tabType === 'sql' && Boolean(tab.content?.trim()));
    if (!hasSqlContent) {
        throw new Error('Work cannot be marked done until at least one SQL tab contains generated SQL.');
    }
}

export const workGetWorkspaceAction = defineWebAction({
    id: 'work.getWorkspace',
    domain: 'work',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ workId: z.string().min(1) }),
    outputSchema: workWorkspaceSummaryOutputSchema,
    permissions: readWorkspace,
    scopes: ['works:read', 'tabs:read'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => {
        const work = await ctx.services.db.works.getById({ organizationId: ctx.organizationId, id: input.workId });
        if (!work) throw new Error('Work not found.');
        return getWorkWorkspaceSummary({
            db: ctx.services.db,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            workId: work.id,
            connectionId: work.connectionId,
        });
    },
});

export const workCreateMessageAction = defineWebAction({
    id: 'work.createMessage',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:event'],
    inputSchema: z.object({
        workId: z.string().min(1),
        runId: z.string().min(1),
        content: z.string().trim().min(1).max(12000),
    }),
    outputSchema: z.object({ ok: z.boolean(), eventId: z.string() }),
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => {
        const work = await loadWorkOrThrow(ctx, input.workId);
        const event = await ctx.services.db.works.appendRunEvent({
            runId: input.runId,
            workId: work.id,
            organizationId: ctx.organizationId,
            type: 'message',
            role: 'agent',
            content: input.content,
            payload: { toolName: 'work_createMessage' },
        });
        return { ok: true, eventId: event.id };
    },
});

export const workCreateSqlTabAction = defineWebAction({
    id: 'work.createSqlTab',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:sql-tab:create', 'tab:save'],
    inputSchema: z.object({
        workId: z.string().min(1),
        runId: z.string().min(1).optional(),
        title: z.string().trim().min(1).max(200),
        sql: z.string().trim().min(1),
        database: z.string().trim().nullable().optional(),
    }),
    outputSchema: workSqlTabOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write', 'tabs:write'],
    actors: ['agent', 'automation'],
    handler: async (ctx, input) => {
        const work = await loadWorkOrThrow(ctx, input.workId);
        const tabId = randomUUID();
        const event = input.runId
            ? await ctx.services.db.works.appendRunEvent({
                  runId: input.runId,
                  workId: work.id,
                  organizationId: ctx.organizationId,
                  type: 'sql_tab_created',
                  role: 'tool',
                  content: input.title,
                  payload: { toolName: 'work_createSqlTab', tabId, title: input.title, database: input.database ?? null },
              })
            : null;
        await executeAction(ctx, 'tab.create', {
            connectionId: work.connectionId,
            tabId,
            tabType: 'sql',
            tabName: input.title,
            content: input.sql,
            databaseName: input.database ?? null,
            workspaceScope: workWorkspaceScope(work.id),
            workSyncState: 'synced',
            lastAgentRunId: input.runId ?? null,
            lastAgentEventId: event?.id ?? null,
            lastAgentSyncedAt: new Date().toISOString(),
        });
        return { tabId, title: input.title, sql: input.sql };
    },
});

export const workUpdateSqlTabAction = defineWebAction({
    id: 'work.updateSqlTab',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:sql-tab:update', 'tab:save'],
    inputSchema: z.object({
        workId: z.string().min(1),
        runId: z.string().min(1).optional(),
        tabId: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        sql: z.string().trim().min(1),
        database: z.string().trim().nullable().optional(),
    }),
    outputSchema: workSqlTabOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write', 'tabs:write'],
    actors: ['agent', 'automation'],
    handler: async (ctx, input) => {
        const work = await loadWorkOrThrow(ctx, input.workId);
        const existing = (await ctx.services.db.tabState.loadTabState(input.tabId, ctx.userId, work.connectionId, workWorkspaceScope(work.id))) as UITabPayload | null;
        if (!existing || existing.tabType !== 'sql') throw new Error('SQL tab not found for this Work.');
        const title = input.title?.trim() || existing.tabName || 'SQL tab';
        const existingDatabaseName = (existing as UITabPayload & { databaseName?: string | null }).databaseName ?? null;
        const event = input.runId
            ? await ctx.services.db.works.appendRunEvent({
                  runId: input.runId,
                  workId: work.id,
                  organizationId: ctx.organizationId,
                  type: 'sql_tab_updated',
                  role: 'tool',
                  content: title,
                  payload: { toolName: 'work_updateSqlTab', tabId: input.tabId, title, database: input.database ?? existingDatabaseName },
              })
            : null;
        await executeAction(ctx, 'tab.save', {
            connectionId: work.connectionId,
            tabId: input.tabId,
            workspaceScope: workWorkspaceScope(work.id),
            state: {
                ...existing,
                tabName: title,
                content: input.sql,
                databaseName: input.database ?? existingDatabaseName,
                workSyncState: 'synced',
                lastAgentRunId: input.runId ?? existing.lastAgentRunId ?? null,
                lastAgentEventId: event?.id ?? existing.lastAgentEventId ?? null,
                lastAgentSyncedAt: new Date().toISOString(),
            },
            resultMeta: existing.resultMeta ?? null,
        });
        return { tabId: input.tabId, title, sql: input.sql };
    },
});

export const workExecuteSqlTabAction = defineWebAction({
    id: 'work.executeSqlTab',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:sql-tab:execute', 'query:execute', 'tab:save'],
    inputSchema: z.object({
        workId: z.string().min(1),
        runId: z.string().min(1).optional(),
        tabId: z.string().min(1),
        database: z.string().trim().nullable().optional(),
    }),
    outputSchema: z.object({
        tabId: z.string(),
        sessionId: z.string(),
        query: queryExecutionOutputSchema,
        resultMeta: z.record(z.string(), z.unknown()),
    }),
    permissions: writeWorkspace,
    scopes: ['works:write', 'tabs:write', 'query:read'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => {
        const work = await loadWorkOrThrow(ctx, input.workId);
        const tab = (await ctx.services.db.tabState.loadTabState(input.tabId, ctx.userId, work.connectionId, workWorkspaceScope(work.id))) as UITabPayload | null;
        if (!tab || tab.tabType !== 'sql') throw new Error('SQL tab not found for this Work.');
        const sessionId = randomUUID();
        const database = input.database ?? (tab as UITabPayload & { databaseName?: string | null }).databaseName ?? null;
        const queryEnvelope = await executeAction(ctx, 'query.readOnlyExecute', {
            connectionId: work.connectionId,
            database,
            sql: tab.content,
            limit: 100,
            tabId: tab.tabId,
            sessionId,
            source: 'work-run',
        });
        const query = queryEnvelope.data;
        const event = input.runId
            ? await ctx.services.db.works.appendRunEvent({
                  runId: input.runId,
                  workId: work.id,
                  organizationId: ctx.organizationId,
                  type: 'sql_executed',
                  role: 'tool',
                  content: tab.tabName ?? 'SQL executed',
                  payload: { toolName: 'work_executeSqlTab', tabId: tab.tabId, sessionId, database, sql: tab.content, query },
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
            tabId: tab.tabId,
            workspaceScope: workWorkspaceScope(work.id),
            state: {
                ...tab,
                databaseName: database,
                status: 'success',
                resultMeta,
                workSyncState: 'synced',
                lastAgentRunId: input.runId ?? tab.lastAgentRunId ?? null,
                lastAgentEventId: event?.id ?? tab.lastAgentEventId ?? null,
                lastAgentSyncedAt: new Date().toISOString(),
            },
            resultMeta,
        });
        return { tabId: tab.tabId, sessionId, query: query as z.infer<typeof queryExecutionOutputSchema>, resultMeta: resultMeta as Record<string, unknown> };
    },
});

export const workMarkDoneAction = defineWebAction({
    id: 'work.markDone',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:event'],
    inputSchema: z.object({
        workId: z.string().min(1),
        runId: z.string().min(1),
        summary: z.string().trim().min(1).max(12000),
    }),
    outputSchema: z.object({ ok: z.boolean(), eventId: z.string() }),
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['agent', 'automation'],
    handler: async (ctx, input) => {
        const work = await loadWorkOrThrow(ctx, input.workId);
        await assertWorkHasSqlContent(ctx, work);
        const event = await ctx.services.db.works.appendRunEvent({
            runId: input.runId,
            workId: work.id,
            organizationId: ctx.organizationId,
            type: 'work_done',
            role: 'agent',
            content: input.summary,
            payload: { toolName: 'work_markDone' },
        });
        return { ok: true, eventId: event.id };
    },
});

export const workContinueFromWorkspaceAction = defineWebAction({
    id: 'work.continueFromWorkspace',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:event'],
    inputSchema: z.object({ workId: z.string().min(1), userInstruction: z.string().trim().min(1).max(5000).optional() }),
    outputSchema: z.object({ ok: z.boolean() }),
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'automation'],
    handler: async (ctx, input) => {
        await loadWorkOrThrow(ctx, input.workId);
        return { ok: true };
    },
});

export const workContinueFromTabAction = defineWebAction({
    id: 'work.continueFromTab',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:event'],
    inputSchema: z.object({ workId: z.string().min(1), tabId: z.string().min(1), userInstruction: z.string().trim().min(1).max(5000).optional() }),
    outputSchema: z.object({ ok: z.boolean() }),
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'automation'],
    handler: async (ctx, input) => {
        const work = await loadWorkOrThrow(ctx, input.workId);
        const tab = await ctx.services.db.tabState.loadTabState(input.tabId, ctx.userId, work.connectionId, workWorkspaceScope(work.id));
        if (!tab) throw new Error('SQL tab not found for this Work.');
        return { ok: true };
    },
});

export const workWorkspaceActions = [
    workGetWorkspaceAction,
    workCreateMessageAction,
    workCreateSqlTabAction,
    workUpdateSqlTabAction,
    workExecuteSqlTabAction,
    workMarkDoneAction,
    workContinueFromWorkspaceAction,
    workContinueFromTabAction,
];
