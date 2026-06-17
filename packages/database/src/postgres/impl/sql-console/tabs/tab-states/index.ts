
import { tabs } from '@dory/database/postgres/schemas';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PostgresDBClient } from '@dory/shared';
import { normalizeWorkspaceScope, TabPayload, TabResultMetaPayload, TableTabPayload, WorkspaceScope } from '@dory/shared/types/tabs';
import { getClient } from '@dory/database/postgres/client';
import { translateDatabase } from '@dory/database/i18n';

export class PostgresTabStateRepository {
    private db!: PostgresDBClient;

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

    async saveTabState({
        tabId,
        userId,
        connectionId,
        workspaceScope,
        state,        // TabPayload
        resultMeta,
    }: {
        tabId: string;
        userId: string;
        connectionId: string;
        workspaceScope?: WorkspaceScope | null;
        state: {
            databaseName?: string | null;
            tableName?: string | null;
            content: string | null;
            tabName?: string | null;
            tabType: 'sql' | 'table';
            orderIndex?: number | null;
            createdAt?: string | Date | null;
            activeSubTab?: TableTabPayload['activeSubTab'] | null;
            workSyncState?: TabPayload['workSyncState'];
            lastAgentRunId?: string | null;
            lastAgentEventId?: string | null;
            lastAgentSyncedAt?: string | null;
            lastHumanEditedAt?: string | null;
        };
        resultMeta?: TabResultMetaPayload | null;
    }) {
        const isTable = state.tabType === 'table';
        const now = new Date();
        const hasOrderIndex = typeof state.orderIndex === 'number' && Number.isFinite(state.orderIndex);
        const normalizedScope = normalizeWorkspaceScope(workspaceScope ?? (state as TabPayload).workspaceScope);
        const scopeColumns = this.workspaceScopeColumns(normalizedScope);
        const orderIndex = hasOrderIndex ? state.orderIndex! : await this.getNextOrderIndex(userId, connectionId, normalizedScope);
        const createdAt = state.createdAt ? new Date(state.createdAt) : undefined;
        const activeSubTab = isTable ? state.activeSubTab ?? 'data' : 'data';
        const serializedResultMeta = this.serializeResultMeta(resultMeta ?? null);
        const persistedState = {
            ...state,
            workspaceScope: normalizedScope,
            resultMeta: resultMeta ?? null,
        } as TabPayload;
        const updateSet: Record<string, any> = {
            content: isTable ? '' : (state.content ?? ''),
            databaseName: isTable ? state.databaseName : null,
            tableName: isTable ? state.tableName : null,
            resultMeta: serializedResultMeta,
            state: this.serializeState(persistedState),
            connectionId,
            ...scopeColumns,
            updatedAt: now,
            activeSubTab,
            ...(hasOrderIndex ? { orderIndex: state.orderIndex! } : {}),
        };

        if (typeof state.tabName === 'string') {
            updateSet.tabName = state.tabName;
        }

        await this.db
            .insert(tabs)
            .values(({
                tabId,
                userId,
                connectionId,
                tabType: state.tabType,         // sql | table
                tabName: state.tabName,
                content: isTable ? '' : (state.content ?? ''),      // SQL text or empty string
                ...scopeColumns,

                // Only valid for table type; otherwise write null
                databaseName: isTable ? state.databaseName : null,
                tableName: isTable ? state.tableName : null,
                activeSubTab,

                orderIndex,
                createdAt,
                resultMeta: serializedResultMeta,
                state: this.serializeState(persistedState),

                updatedAt: now,
            }) as unknown as any)
            .onConflictDoUpdate({
                target: tabs.tabId,
                set: updateSet,
            });
    }


    async updateTabName({
        tabId,
        userId,
        connectionId,
        newName,
    }: {
        tabId: string
        userId: string
        connectionId: string
        newName: string
    }) {
        await this.db
            .update(tabs)
            .set({ tabName: newName })
            .where(
                and(
                    eq(tabs.tabId, tabId),
                    eq(tabs.userId, userId),
                    eq(tabs.connectionId, connectionId),
                )
            );
    }


    async loadTabState(tabId: string, userId: string, connectionId: string, workspaceScope?: WorkspaceScope | null) {
        const result = await this.db
            .select()
            .from(tabs)
            .where(and(eq(tabs.tabId, tabId), eq(tabs.userId, userId), eq(tabs.connectionId, connectionId), ...this.workspaceScopeConditions(workspaceScope)));
        return result[0] ? this.deserializeTabRow(result[0]) : null;
    }

    async loadAllTab(userId: string, connectionId: string, workspaceScope?: WorkspaceScope | null) {
        const result = await this.db
            .select()
            .from(tabs)
            .where(and(eq(tabs.userId, userId), eq(tabs.connectionId, connectionId), ...this.workspaceScopeConditions(workspaceScope)))
            .orderBy(tabs.orderIndex, tabs.createdAt, tabs.tabId);
        return result.map(row => this.deserializeTabRow(row));
    }

    async deleteTabState(tabId: string, userId: string, connectionId: string, workspaceScope?: WorkspaceScope | null): Promise<void> {
        await this.db.delete(tabs).where(and(eq(tabs.tabId, tabId), eq(tabs.userId, userId), eq(tabs.connectionId, connectionId), ...this.workspaceScopeConditions(workspaceScope)));
    }

    async clearSession(userId: string, connectionId?: string): Promise<void> {
        if (connectionId) {
            await this.db.delete(tabs).where(and(eq(tabs.userId, userId), eq(tabs.connectionId, connectionId)));
            return;
        }
        await this.db.delete(tabs).where(eq(tabs.userId, userId));
    }

    private async getNextOrderIndex(userId: string, connectionId: string, workspaceScope?: WorkspaceScope | null) {
        const [row] = await this.db
            .select({
                maxOrder: sql<number>`coalesce(max(${tabs.orderIndex}), -1)`,
            })
            .from(tabs)
            .where(and(eq(tabs.userId, userId), eq(tabs.connectionId, connectionId), ...this.workspaceScopeConditions(workspaceScope)));

        const maxOrder = row?.maxOrder ?? -1;
        return maxOrder + 1;
    }

    private workspaceScopeColumns(workspaceScope?: WorkspaceScope | null) {
        const normalizedScope = normalizeWorkspaceScope(workspaceScope);
        if (normalizedScope.type === 'work') {
            return {
                workspaceScopeType: 'work',
                workspaceScopeWorkId: normalizedScope.workId,
                workspaceScopeInvestigationId: null,
            };
        }

        if (normalizedScope.type === 'work_investigation') {
            return {
                workspaceScopeType: 'work_investigation',
                workspaceScopeWorkId: normalizedScope.workId,
                workspaceScopeInvestigationId: normalizedScope.investigationId,
            };
        }

        return {
            workspaceScopeType: 'connection',
            workspaceScopeWorkId: null,
            workspaceScopeInvestigationId: null,
        };
    }

    private workspaceScopeConditions(workspaceScope?: WorkspaceScope | null) {
        const normalizedScope = normalizeWorkspaceScope(workspaceScope);
        if (normalizedScope.type === 'work') {
            return [
                eq(tabs.workspaceScopeType, 'work'),
                eq(tabs.workspaceScopeWorkId, normalizedScope.workId),
                isNull(tabs.workspaceScopeInvestigationId),
            ];
        }

        if (normalizedScope.type === 'work_investigation') {
            return [
                eq(tabs.workspaceScopeType, 'work_investigation'),
                eq(tabs.workspaceScopeWorkId, normalizedScope.workId),
                eq(tabs.workspaceScopeInvestigationId, normalizedScope.investigationId),
            ];
        }

        return [
            eq(tabs.workspaceScopeType, 'connection'),
            isNull(tabs.workspaceScopeWorkId),
            isNull(tabs.workspaceScopeInvestigationId),
        ];
    }

    private serializeResultMeta(resultMeta: TabResultMetaPayload | null) {
        if (!resultMeta) return null;
        return JSON.stringify(resultMeta);
    }

    private serializeState(state: TabPayload | null) {
        if (!state) return null;
        return JSON.stringify(state);
    }

    private deserializeState(state: unknown): Partial<TabPayload> | null {
        if (!state) return null;
        if (typeof state === 'object') return state as Partial<TabPayload>;
        if (typeof state !== 'string') return null;
        try {
            const parsed = JSON.parse(state) as unknown;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<TabPayload>) : null;
        } catch {
            return null;
        }
    }

    private deserializeResultMeta(resultMeta: unknown): TabResultMetaPayload | null {
        if (!resultMeta) return null;
        if (typeof resultMeta === 'object') return resultMeta as TabResultMetaPayload;
        if (typeof resultMeta !== 'string') return null;
        try {
            return JSON.parse(resultMeta) as TabResultMetaPayload;
        } catch {
            return null;
        }
    }

    private deserializeTabRow<T extends { resultMeta?: unknown }>(row: T): Omit<T, 'resultMeta'> & { resultMeta: TabResultMetaPayload | null } {
        const state = this.deserializeState((row as T & { state?: unknown }).state);
        const scope = normalizeWorkspaceScope(
            (row as T & { workspaceScopeType?: string | null; workspaceScopeWorkId?: string | null; workspaceScopeInvestigationId?: string | null }).workspaceScopeType === 'work'
                ? {
                      type: 'work',
                      workId: (row as T & { workspaceScopeWorkId?: string | null }).workspaceScopeWorkId ?? '',
                  }
                : (row as T & { workspaceScopeType?: string | null; workspaceScopeWorkId?: string | null; workspaceScopeInvestigationId?: string | null }).workspaceScopeType === 'work_investigation'
                  ? {
                      type: 'work_investigation',
                      workId: (row as T & { workspaceScopeWorkId?: string | null }).workspaceScopeWorkId ?? '',
                      investigationId: (row as T & { workspaceScopeInvestigationId?: string | null }).workspaceScopeInvestigationId ?? '',
                  }
                : { type: 'connection' },
        );
        return {
            ...row,
            ...state,
            workspaceScope: scope,
            resultMeta: this.deserializeResultMeta(row.resultMeta),
        };
    }
}
