// scripts/bootstrap.ts
import fs from 'node:fs/promises';
import path from 'node:path';

import { migratePgliteDB } from '../lib/database/pglite/migrate-pglite';
import { getDatabaseProvider } from '../lib/database/provider';
import { DEFAULT_PGLITE_DB_PATH } from '@/shared/data/app.data';
import { fileURLToPath } from 'node:url';


async function ensureDirForFile(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function toFsPath(v: string) {
  if (v.startsWith("file:")) return fileURLToPath(v);
  return decodeURIComponent(v);
}

async function bootstrapPglite() {
  const defaultFile = DEFAULT_PGLITE_DB_PATH;
  const raw = process.env.DATABASE_URL ?? defaultFile;

  const dbFilePath = toFsPath(raw);

  process.env.DATABASE_URL = dbFilePath;

  await ensureDirForFile(dbFilePath);

  console.log("[bootstrap] running pglite migrate...");
  await migratePgliteDB();
}

export async function bootstrap() {
    const dbType = getDatabaseProvider();
    console.log('[bootstrap] DB_TYPE =', dbType);

    if (dbType === 'pglite') {
        await bootstrapPglite();
    } else {
        console.log('[bootstrap] skip bootstrap');
    }
}

bootstrap().catch(err => {
    console.error('[bootstrap] failed:', err);
    process.exit(1);
});
