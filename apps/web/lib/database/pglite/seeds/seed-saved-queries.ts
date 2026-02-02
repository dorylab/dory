import { newEntityId } from '@/lib/id';
import { getPgliteClient } from '@/lib/database/postgres/client/pglite';
import { savedQueries, teams, user } from '@/lib/database/postgres/schemas';
import { migratePgliteDB } from '@/lib/database/pglite/migrate-pglite';

const TOTAL = 500;
const BATCH_SIZE = 100;

function buildSql(index: number) {
    return [
        `-- seed ${index + 1}`,
        'select',
        `  ${index + 1} as id,`,
        `  now() as created_at`,
        'from',
        '  information_schema.tables',
        'limit 20;',
    ].join('\n');
}

async function main() {
    
    const db = await getPgliteClient();
    await migratePgliteDB();

    const [team] = await db.select().from(teams).limit(1);
    const [userRow] = await db.select().from(user).limit(1);

    if (!team || !userRow) {
        throw new Error('Missing team or user. Please create one before seeding saved queries.');
    }

    const teamId = team.id;
    const userId = team.ownerUserId ?? userRow.id;
    const now = new Date();

    for (let offset = 0; offset < TOTAL; offset += BATCH_SIZE) {
        const slice = Math.min(BATCH_SIZE, TOTAL - offset);
        const rows = Array.from({ length: slice }, (_, i) => {
            const index = offset + i;
            return {
                id: newEntityId(),
                teamId,
                userId,
                title: `Seed Query ${index + 1}`,
                description: `Auto generated query ${index + 1}`,
                sqlText: buildSql(index),
                context: { database: 'demo', schema: 'public' },
                tags: [],
                workId: null,
                connectionId: teamId,
                createdAt: now,
                updatedAt: now,
                archivedAt: null,
            };
        });

        await db.insert(savedQueries).values(rows);
    }

    console.log(`Inserted ${TOTAL} saved queries for team ${teamId}.`);
}

main().catch(error => {
    console.error('[seed-saved-queries] failed:', error);
    process.exit(1);
});
import 'dotenv/config';
