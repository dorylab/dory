import { getClient } from '@/lib/database/postgres/client';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import { PostgresDBClient } from '@/types';
import { and, eq, or } from 'drizzle-orm';
import { teams } from '@/lib/database/schema';
import { teamMembers } from '../../schemas';
import { translateDatabase } from '@/lib/database/i18n';

export class PostgresTeamsRepository {
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

    async list(userId: string) {
        return this.db.select().from(teamMembers).where(eq(teamMembers.userId, userId));
    }

    async getTeamBySlugOrId(value: string) {
        const rows = await this.db
            .select()
            .from(teams)
            .where(or(eq(teams.id, value), eq(teams.slug, value)))
            .limit(1);

        return rows[0] ?? null;
    }

    async isUserInTeam(userId: string, teamId: string): Promise<boolean> {
        const rows = await this.db
            .select({ exists: teamMembers.teamId })
            .from(teamMembers)
            .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.status, 'active')))
            .limit(1);
    
        return rows.length > 0;
    }
}
