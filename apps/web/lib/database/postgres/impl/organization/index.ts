import { getClient } from '@/lib/database/postgres/client';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import { PostgresDBClient } from '@/types';
import { and, eq, isNull, or } from 'drizzle-orm';
import { organizations } from '@/lib/database/schema';
import { organizationMembers } from '../../schemas';
import { translateDatabase } from '@/lib/database/i18n';

export class PostgresOrganizationsRepository {
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

    async listByUser(userId: string) {
        return this.db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
    }

    async getOrganizationBySlugOrId(value: string) {
        const rows = await this.db
            .select()
            .from(organizations)
            .where(or(eq(organizations.id, value), eq(organizations.slug, value)))
            .limit(1);

        return rows[0] ?? null;
    }

    async isUserInOrganization(userId: string, organizationId: string): Promise<boolean> {
        const rows = await this.db
            .select({ exists: organizationMembers.organizationId })
            .from(organizationMembers)
            .where(
                and(
                    eq(organizationMembers.organizationId, organizationId),
                    eq(organizationMembers.userId, userId),
                    or(eq(organizationMembers.status, 'active'), isNull(organizationMembers.status)),
                ),
            )
            .limit(1);
    
        return rows.length > 0;
    }
}
