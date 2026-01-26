import type { MigrationConfig } from 'drizzle-orm/migrator';
import migrations from './migrations.json';
import { getDBClient, bumpPgliteSchemaVersion } from './client';
import { translate } from '@/lib/i18n/i18n';
import { getClientLocale } from '@/lib/i18n/client-locale';

async function runDrizzleMigrate(db: any) {
    const dialect = db?.dialect;
    const session = db?.session;

    if (!dialect || typeof dialect.migrate !== 'function' || !session) {
        throw new Error(translate(getClientLocale(), 'Client.Pglite.InvalidInstance'));
    }

    await dialect.migrate(migrations as any, session, {
        migrationsTable: 'drizzle_migrations',
    } satisfies Omit<MigrationConfig, 'migrationsFolder'>);
}

export async function migrateClientDB() {
    const db = await getDBClient();

    try {
        await runDrizzleMigrate(db);
        return;
    } catch (err) {
        console.warn(translate(getClientLocale(), 'Client.Pglite.MigrationFailed'), err);

        // 1) Bump version → discard current DB completely
        bumpPgliteSchemaVersion();

        // 2) Re-initialize a fresh DB
        const freshDb = await getDBClient();

        // 3) Re-run migrations on fresh DB (clean state)
        await runDrizzleMigrate(freshDb);
    }
}
