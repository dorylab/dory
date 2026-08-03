import { lt, sql } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import { embedDemoRateLimits } from '@dory/database/postgres/schemas';
import type { PostgresDBClient } from '@dory/shared';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';

export class PostgresEmbedDemoRepository {
    private db!: PostgresDBClient;

    async init() {
        this.db = (await getClient()) as PostgresDBClient;
        if (!this.db) throw new DatabaseError('Embed demo repository failed to initialize', 500);
    }

    async consumeSession(params: { dayKey: string; ipHash: string; limit: number }) {
        const [bucket] = await this.db
            .insert(embedDemoRateLimits)
            .values({ dayKey: params.dayKey, ipHash: params.ipHash, sessions: 1 })
            .onConflictDoUpdate({
                target: [embedDemoRateLimits.dayKey, embedDemoRateLimits.ipHash],
                set: {
                    sessions: sql`${embedDemoRateLimits.sessions} + 1`,
                    updatedAt: new Date(),
                },
                setWhere: sql`${embedDemoRateLimits.sessions} < ${params.limit}`,
            })
            .returning({ sessions: embedDemoRateLimits.sessions });

        return bucket?.sessions ?? null;
    }

    async deleteBucketsUpdatedBefore(before: Date) {
        const rows = await this.db.delete(embedDemoRateLimits).where(lt(embedDemoRateLimits.updatedAt, before)).returning({ dayKey: embedDemoRateLimits.dayKey });
        return rows.length;
    }
}
