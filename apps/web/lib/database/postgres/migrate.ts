import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PostgresDBClient } from '@/types';
import { getClient } from './client';
import { getDatabaseProvider } from '../provider';

export async function migrateDB() {
  const db = (await getClient()) as PostgresDBClient;
  const t = getDatabaseProvider().toLowerCase();

  const migrationsFolder = 'lib/database/postgres/migrations';

  if (t === 'pglite') {
    await migratePglite(db as any, { migrationsFolder });
  } else {
    await migratePg(db as any, { migrationsFolder });
  }
}
