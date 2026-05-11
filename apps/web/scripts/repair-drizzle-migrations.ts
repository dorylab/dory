import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

type JournalEntry = {
    tag: string;
    when: number;
};

async function main() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL is missing');
    }

    const journalPath = path.resolve(
        process.cwd(),
        '../../packages/database/src/postgres/migrations/meta/_journal.json',
    );
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
        entries: JournalEntry[];
    };

    const journalByTag = new Map(journal.entries.map(entry => [entry.tag, entry.when]));

    const client = new Client({ connectionString });

    try {
        await client.connect();

        const result = await client.query<{
            id: number;
            hash: string;
            created_at: string | number | null;
        }>('select id, hash, created_at from drizzle.__drizzle_migrations order by id');

        let updated = 0;

        for (const row of result.rows) {
            const expected = journalByTag.get(row.hash);

            if (!expected) {
                console.warn(`[Repair] Skipping unknown migration hash: ${row.hash}`);
                continue;
            }

            const current = row.created_at === null ? null : Number(row.created_at);

            if (current === expected) {
                continue;
            }

            await client.query(
                'update drizzle.__drizzle_migrations set created_at = $1 where id = $2',
                [expected, row.id],
            );
            updated += 1;
            console.log(
                `[Repair] Updated ${row.hash}: created_at ${current ?? '<null>'} -> ${expected}`,
            );
        }

        console.log(`[Repair] Completed. Updated ${updated} migration row(s).`);
    } finally {
        await client.end().catch(() => undefined);
    }
}

main().catch(error => {
    console.error('[Repair] Failed to repair drizzle migration timestamps');
    console.error(error);
    process.exit(1);
});
