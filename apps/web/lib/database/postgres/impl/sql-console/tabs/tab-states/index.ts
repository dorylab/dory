
import { tabs } from '@/lib/database/postgres/schemas';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresDBClient } from '@/types';
import { TabPayload, TabResultMetaPayload, TableTabPayload } from '@/types/tabs';
import { getClient } from '@/lib/database/postgres/client';
import { translateDatabase } from '@/lib/database/i18n';

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
        state,        // TabPayload
        resultMeta,
    }: {
        tabId: string;
        userId: string;
        connectionId: string;
        state: {
            databaseName?: string | null;
            tableName?: string | null;
            content: string | null;
            tabName?: string | null;
            tabType: 'sql' | 'table';
            orderIndex?: number | null;
            createdAt?: string | Date | null;
            activeSubTab?: TableTabPayload['activeSubTab'] | null;
        };
        resultMeta?: TabResultMetaPayload | null;
    }) {
        const isTable = state.tabType === 'table';
        const now = new Date();
        const hasOrderIndex = typeof state.orderIndex === 'number' && Number.isFinite(state.orderIndex);
        const orderIndex = hasOrderIndex ? state.orderIndex! : await this.getNextOrderIndex(userId, connectionId);
        const createdAt = state.createdAt ? new Date(state.createdAt) : undefined;
        const activeSubTab = isTable ? state.activeSubTab ?? 'data' : 'data';
        const updateSet: Record<string, any> = {
            content: isTable ? '' : (state.content ?? ''),
            databaseName: isTable ? state.databaseName : null,
            tableName: isTable ? state.tableName : null,
            resultMeta: resultMeta ?? null,
            connectionId,
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

                // Only valid for table type; otherwise write null
                databaseName: isTable ? state.databaseName : null,
                tableName: isTable ? state.tableName : null,
                activeSubTab,

                orderIndex,
                createdAt,
                resultMeta: resultMeta ?? null,

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


    async loadTabState(tabId: string, userId: string, connectionId: string) {
        const result = await this.db
            .select()
            .from(tabs)
            .where(and(eq(tabs.tabId, tabId), eq(tabs.userId, userId), eq(tabs.connectionId, connectionId)));
        return (result[0]) ?? null;
    }

    async loadAllTab(userId: string, connectionId: string) {
        const result = await this.db
            .select()
            .from(tabs)
            .where(and(eq(tabs.userId, userId), eq(tabs.connectionId, connectionId)))
            .orderBy(tabs.orderIndex, tabs.createdAt, tabs.tabId);
        return (result) ?? [];
    }

    async deleteTabState(tabId: string, userId: string, connectionId: string): Promise<void> {
        await this.db.delete(tabs).where(and(eq(tabs.tabId, tabId), eq(tabs.userId, userId), eq(tabs.connectionId, connectionId)));
    }

    async clearSession(userId: string, connectionId?: string): Promise<void> {
        if (connectionId) {
            await this.db.delete(tabs).where(and(eq(tabs.userId, userId), eq(tabs.connectionId, connectionId)));
            return;
        }
        await this.db.delete(tabs).where(eq(tabs.userId, userId));
    }

    private async getNextOrderIndex(userId: string, connectionId: string) {
        const [row] = await this.db
            .select({
                maxOrder: sql<number>`coalesce(max(${tabs.orderIndex}), -1)`,
            })
            .from(tabs)
            .where(and(eq(tabs.userId, userId), eq(tabs.connectionId, connectionId)));

        const maxOrder = row?.maxOrder ?? -1;
        return maxOrder + 1;
    }
}
