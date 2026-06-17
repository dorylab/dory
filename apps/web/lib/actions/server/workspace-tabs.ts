import { randomUUID } from 'node:crypto';
import type { ActionContext } from '@dory/actions';
import type { WorkspaceScope } from '@dory/shared/types/tabs';
import { resolveConnectionId } from './operation-context';
import type { WebActionServices } from './types';

export type WorkspaceTabType = 'sql' | 'table';

export type CreateWorkspaceTabInput = {
    connectionId?: string | null;
    tabId?: string | null;
    tabType?: WorkspaceTabType;
    tabName?: string | null;
    content?: string | null;
    databaseName?: string | null;
    tableName?: string | null;
    activeSubTab?: 'overview' | 'data' | 'structure' | 'indexes' | 'stats' | null;
    orderIndex?: number | null;
    createdAt?: string | null;
    resultMeta?: unknown;
    workspaceScope?: WorkspaceScope | null;
    workSyncState?: 'agent_generated' | 'human_edited' | 'unsynced' | 'synced' | 'running' | 'failed';
    lastAgentRunId?: string | null;
    lastAgentEventId?: string | null;
    lastAgentSyncedAt?: string | null;
    lastHumanEditedAt?: string | null;
};

export async function createWorkspaceTab(ctx: ActionContext<WebActionServices>, input: CreateWorkspaceTabInput) {
    const connectionId = resolveConnectionId(ctx, input);
    const tabId = input.tabId?.trim() || randomUUID();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const tabType = input.tabType ?? 'sql';
    const tabName = input.tabName ?? (tabType === 'table' ? (input.tableName ?? 'Table') : 'New Query');
    const state =
        tabType === 'table'
            ? {
                  content: '',
                  databaseName: input.databaseName ?? null,
                  tableName: input.tableName ?? null,
                  activeSubTab: input.activeSubTab ?? 'data',
                  tabType,
                  tabName,
                  orderIndex: input.orderIndex ?? null,
                  createdAt,
                  workSyncState: input.workSyncState,
                  lastAgentRunId: input.lastAgentRunId ?? null,
                  lastAgentEventId: input.lastAgentEventId ?? null,
                  lastAgentSyncedAt: input.lastAgentSyncedAt ?? null,
                  lastHumanEditedAt: input.lastHumanEditedAt ?? null,
              }
            : {
                  content: input.content ?? '',
                  databaseName: input.databaseName ?? null,
                  tableName: null,
                  activeSubTab: null,
                  tabType,
                  tabName,
                  orderIndex: input.orderIndex ?? null,
                  createdAt,
                  workSyncState: input.workSyncState,
                  lastAgentRunId: input.lastAgentRunId ?? null,
                  lastAgentEventId: input.lastAgentEventId ?? null,
                  lastAgentSyncedAt: input.lastAgentSyncedAt ?? null,
                  lastHumanEditedAt: input.lastHumanEditedAt ?? null,
              };

    await ctx.services.db.tabState.saveTabState({
        tabId,
        userId: ctx.userId,
        connectionId,
        workspaceScope: input.workspaceScope ?? null,
        state,
        resultMeta: input.resultMeta ?? null,
    });

    return {
        tabId,
        tabType,
        tabName,
        ...(tabType === 'sql' ? { content: input.content ?? '', status: 'idle' } : {}),
        userId: ctx.userId,
        connectionId,
        workspaceScope: input.workspaceScope ?? undefined,
        databaseName: input.databaseName ?? null,
        tableName: tabType === 'table' ? (input.tableName ?? null) : null,
        activeSubTab: tabType === 'table' ? (input.activeSubTab ?? 'data') : null,
        orderIndex: input.orderIndex ?? null,
        createdAt,
        workSyncState: input.workSyncState,
        lastAgentRunId: input.lastAgentRunId ?? null,
        lastAgentEventId: input.lastAgentEventId ?? null,
        lastAgentSyncedAt: input.lastAgentSyncedAt ?? null,
        lastHumanEditedAt: input.lastHumanEditedAt ?? null,
    };
}
