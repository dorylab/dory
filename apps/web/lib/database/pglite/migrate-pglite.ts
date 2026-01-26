import type { MigrationConfig } from 'drizzle-orm/migrator';
import migrations from './migrations.json';
import { getPgliteClient } from '../postgres/client/pglite';
import { translateDatabase } from '../i18n';

async function runDrizzleMigrate(db: any) {
    const dialect = db?.dialect;
    const session = db?.session;

    if (!dialect || typeof dialect.migrate !== 'function' || !session) {
        throw new Error(translateDatabase('Database.Errors.PgliteInvalidInstance'));
    }

    await dialect.migrate(migrations as any, session, {
        migrationsTable: 'drizzle_migrations',
    } satisfies Omit<MigrationConfig, 'migrationsFolder'>);
}

export async function migratePgliteDB() {
    const db = await getPgliteClient();

    try {
        await runDrizzleMigrate(db);
        return;
    } catch (err) {
        console.warn(translateDatabase('Database.Errors.PgliteMigrationFailed'), err);
    }
}
