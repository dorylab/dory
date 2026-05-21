import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PostgresDBClient } from '@dory/shared';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClient } from './client';
import { getDatabaseProvider } from '../provider';

function resolveMigrationsFolder() {
    const configuredFolder = process.env.POSTGRES_MIGRATIONS_DIR?.trim();
    if (configuredFolder) {
        return path.resolve(configuredFolder);
    }

    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), './migrations');
}

export async function migrateDB() {
    const db = (await getClient()) as PostgresDBClient;
    const t = getDatabaseProvider().toLowerCase();

    const migrationsFolder = resolveMigrationsFolder();

    if (t === 'pglite') {
        await migratePglite(db as any, { migrationsFolder });
    } else {
        await migratePg(db as any, { migrationsFolder });
    }
}
