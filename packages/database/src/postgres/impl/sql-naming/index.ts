import { and, eq, isNull, exists } from 'drizzle-orm';
import type { PostgresDBClient } from '@dory/shared';
import type { NamingSource } from '@dory/shared/utils/sql-name';
import { getClient } from '@dory/database/postgres/client';
import { artifacts, resultSets, savedQueries, tabs } from '@dory/database/postgres/schemas';

export type SqlNamingTarget =
    | { type: 'tab'; id: string; userId: string; connectionId: string; workId?: string | null }
    | { type: 'savedQuery'; id: string; organizationId: string; userId: string }
    | { type: 'artifact'; id: string; organizationId: string };

export class PostgresSqlNamingRepository {
    private db!: PostgresDBClient;

    async init() {
        this.db = (await getClient()) as PostgresDBClient;
    }

    async claim(target: SqlNamingTarget, input: { sql: string; title: string; requestId: string; pending: boolean }) {
        const namingSource: NamingSource = input.pending ? 'pending' : 'rule';
        const update = { namingSource, namingRequestId: input.requestId, updatedAt: new Date() };
        if (target.type === 'tab') {
            const [row] = await this.db
                .update(tabs)
                .set({ ...update, tabName: input.title })
                .where(
                    and(
                        eq(tabs.tabId, target.id),
                        eq(tabs.userId, target.userId),
                        eq(tabs.connectionId, target.connectionId),
                        target.workId ? eq(tabs.workId, target.workId) : isNull(tabs.workId),
                        eq(tabs.tabType, 'sql'),
                        eq(tabs.content, input.sql),
                        eq(tabs.namingSource, 'default'),
                        isNull(tabs.namingRequestId),
                    ),
                )
                .returning({ id: tabs.tabId });
            return Boolean(row);
        }
        if (target.type === 'savedQuery') {
            const [row] = await this.db
                .update(savedQueries)
                .set({ ...update, title: input.title })
                .where(
                    and(
                        eq(savedQueries.id, target.id),
                        eq(savedQueries.organizationId, target.organizationId),
                        eq(savedQueries.userId, target.userId),
                        eq(savedQueries.sqlText, input.sql),
                        eq(savedQueries.namingSource, 'rule'),
                        isNull(savedQueries.namingRequestId),
                        isNull(savedQueries.archivedAt),
                    ),
                )
                .returning({ id: savedQueries.id });
            return Boolean(row);
        }
        const [row] = await this.db
            .update(artifacts)
            .set({ ...update, title: input.title })
            .where(
                and(
                    eq(artifacts.id, target.id),
                    eq(artifacts.organizationId, target.organizationId),
                    eq(artifacts.type, 'result_set'),
                    eq(artifacts.namingSource, 'rule'),
                    isNull(artifacts.namingRequestId),
                    exists(
                        this.db
                            .select({ id: resultSets.id })
                            .from(resultSets)
                            .where(and(eq(resultSets.organizationId, target.organizationId), eq(resultSets.sql, input.sql), eq(resultSets.id, artifacts.resourceId))),
                    ),
                ),
            )
            .returning({ id: artifacts.id });
        return Boolean(row);
    }

    async complete(target: SqlNamingTarget, input: { requestId: string; sql: string; title: string; source: 'ai' | 'rule' }) {
        const update = { namingSource: input.source, updatedAt: new Date() };
        if (target.type === 'tab') {
            await this.db
                .update(tabs)
                .set({ ...update, tabName: input.title })
                .where(
                    and(
                        eq(tabs.tabId, target.id),
                        eq(tabs.userId, target.userId),
                        eq(tabs.connectionId, target.connectionId),
                        eq(tabs.namingSource, 'pending'),
                        eq(tabs.namingRequestId, input.requestId),
                        eq(tabs.content, input.sql),
                    ),
                );
        } else if (target.type === 'savedQuery') {
            await this.db
                .update(savedQueries)
                .set({ ...update, title: input.title })
                .where(
                    and(
                        eq(savedQueries.id, target.id),
                        eq(savedQueries.organizationId, target.organizationId),
                        eq(savedQueries.userId, target.userId),
                        eq(savedQueries.namingSource, 'pending'),
                        eq(savedQueries.namingRequestId, input.requestId),
                        eq(savedQueries.sqlText, input.sql),
                        isNull(savedQueries.archivedAt),
                    ),
                );
        } else {
            await this.db
                .update(artifacts)
                .set({ ...update, title: input.title })
                .where(
                    and(
                        eq(artifacts.id, target.id),
                        eq(artifacts.organizationId, target.organizationId),
                        eq(artifacts.namingSource, 'pending'),
                        eq(artifacts.namingRequestId, input.requestId),
                        exists(
                            this.db
                                .select({ id: resultSets.id })
                                .from(resultSets)
                                .where(and(eq(resultSets.organizationId, target.organizationId), eq(resultSets.sql, input.sql), eq(resultSets.id, artifacts.resourceId))),
                        ),
                    ),
                );
        }
    }
}
