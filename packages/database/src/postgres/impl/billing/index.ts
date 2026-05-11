import { desc, eq } from 'drizzle-orm';
import { getClient } from '@dory/database/postgres/client';
import { translateDatabase } from '@dory/database/i18n';
import { subscription } from '@dory/database/schema';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';

export class PostgresBillingRepository {
    private db!: PostgresDBClient;

    async init() {
        try {
            this.db = (await getClient()) as PostgresDBClient;
            if (!this.db) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
        } catch (error) {
            console.error(translateDatabase('Database.Logs.InitFailed'), error);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    async listByReferenceId(referenceId: string) {
        return this.db.select().from(subscription).where(eq(subscription.referenceId, referenceId)).orderBy(desc(subscription.updatedAt), desc(subscription.createdAt));
    }
}
