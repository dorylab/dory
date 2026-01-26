import { getDBService } from '@/lib/database';

export async function getTeamBySlugOrId(slugOrId: string, userId: string) {
    const db = await getDBService();
    if (!db) throw new Error('Database service not initialized');
    const team = await db.teams.getTeamBySlugOrId(slugOrId);
    if (!team) {
        return null;
    }

    // Validate that the user belongs to this team
    const member = await db.teams.isUserInTeam(userId, team.id);
    if (!member) {
        return null;
    }

    return team;
}
