import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TabResultMetaPayload, TabPayload } from '@dory/shared/types/tabs';
import { defineWebAction } from '../../define-web-action';
import { queryExecutionOutputSchema } from '../../schemas';
import { writeWorkspace } from '../../policies';
import { investigationWorkspaceContent } from './create-investigation';

const inputSchema = z.object({
    workId: z.string().min(1),
    investigationId: z.string().min(1),
    sql: z.string().trim().min(1),
    database: z.string().trim().nullable().optional(),
    title: z.string().trim().nullable().optional(),
    groupKey: z.string().trim().min(1).optional(),
    groupTitle: z.string().trim().nullable().optional(),
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
    sqlAssetGroupKey: string;
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
        sqlAssetGroupKey: input.sqlAssetGroupKey,
        source: 'work-run',
    };
}

export function investigationSqlAssetBlockContent(input: { groupTitle: string; sql: string }) {
    return [`-- Purpose: ${input.groupTitle}`, '', ensureSqlStatementTerminated(input.sql)].join('\n');
}

function ensureSqlStatementTerminated(sql: string) {
    const trimmed = sql.trim();
    if (!trimmed) return '';
    return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
}

function appendSqlAssetBlock(existingContent: string | null | undefined, block: string) {
    const existing = existingContent?.trimEnd() ?? '';
    if (!existing) return block;
    return `${existing}\n\n${block}`;
}

export function sqlWorkspaceContentWithBlock(input: { seedContent: string; existingContent?: string | null; block: string; shouldAppend: boolean }) {
    if (input.shouldAppend) {
        return appendSqlAssetBlock(input.existingContent, input.block);
    }
    return appendSqlAssetBlock(input.seedContent, input.block);
}

function isReusableSeedTab(tab: TabPayload, input: { seedContent: string; linkedTabId: string | null }) {
    if (!input.linkedTabId || tab.tabId !== input.linkedTabId || tab.tabType !== 'sql') return false;
    if (tab.resultMeta?.source !== 'work-investigation') return false;
    if (tab.resultMeta.sessionId || tab.resultMeta.workRunEventId || tab.resultMeta.sqlAssetGroupKey) return false;
    return (tab.content ?? '').trim() === input.seedContent.trim();
}

export function resolveInvestigationSqlTargetTab(input: { tabs: TabPayload[]; linkedTabId: string | null; seedContent: string; groupKey: string }) {
    const existingGroupTab = input.tabs.find(tab => tab.tabType === 'sql' && tab.resultMeta?.sqlAssetGroupKey === input.groupKey);
    if (existingGroupTab) {
        return {
            tabId: existingGroupTab.tabId,
            existingTab: existingGroupTab,
            shouldAppend: true,
        };
    }

    const reusableSeedTab = input.tabs.find(tab => isReusableSeedTab(tab, { seedContent: input.seedContent, linkedTabId: input.linkedTabId }));
    if (reusableSeedTab) {
        return {
            tabId: reusableSeedTab.tabId,
            existingTab: reusableSeedTab,
            shouldAppend: false,
        };
    }

    return {
        tabId: randomUUID(),
        existingTab: null,
        shouldAppend: false,
    };
}

export const workRunInvestigationSqlAction = defineWebAction({
    id: 'work.runInvestigationSql',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:sql', 'tab:save', 'query:execute'],
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
            groupKey: input.groupKey ?? null,
            groupTitle: input.groupTitle ?? null,
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
        const sessionId = randomUUID();
        const database = input.database ?? null;
        const sqlAssetGroupKey = input.groupKey ?? randomUUID();
        const groupTitle = input.groupTitle || input.title || investigation.title;
        const tabName = groupTitle;
        const seedContent = investigationWorkspaceContent({
            workTitle: work.title,
            goal: work.goal,
            investigationTitle: investigation.title,
        });
        const block = investigationSqlAssetBlockContent({
            groupTitle,
            sql: input.sql,
        });
        const workspaceScope = {
            type: 'work_investigation' as const,
            workId: work.id,
            investigationId: investigation.id,
        };
        const scopedTabs = (await ctx.services.db.tabState.loadAllTab(ctx.userId, work.connectionId, workspaceScope)) as unknown as TabPayload[];
        const targetTab = resolveInvestigationSqlTargetTab({
            tabs: scopedTabs,
            linkedTabId: investigation.linkedTabId,
            seedContent,
            groupKey: sqlAssetGroupKey,
        });
        const tabId = targetTab.tabId;
        const existingContent = targetTab.existingTab?.tabType === 'sql' ? targetTab.existingTab.content : null;
        const content = sqlWorkspaceContentWithBlock({
            seedContent,
            existingContent,
            block,
            shouldAppend: targetTab.shouldAppend,
        });

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
                      groupKey: sqlAssetGroupKey,
                      groupTitle,
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
            sqlAssetGroupKey,
        });

        await executeAction(ctx, 'tab.save', {
            connectionId: work.connectionId,
            tabId,
            state: {
                tabId,
                tabType: 'sql',
                tabName,
                content,
                databaseName: database,
                orderIndex: targetTab.existingTab?.orderIndex ?? null,
                createdAt: targetTab.existingTab?.createdAt,
                resultMeta,
            },
            resultMeta,
            workspaceScope,
        });

        await executeAction(ctx, 'work.updateInvestigation', {
            workId: work.id,
            id: investigation.id,
            auditStatus: 'needs_review',
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
