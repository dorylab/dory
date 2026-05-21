// scripts/bootstrap.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migratePgliteDB } from '@dory/database/pglite/migrate-pglite';
import { ensureFileUrl } from '@dory/database/pglite/url';
import { getDatabaseProvider } from '@dory/database/provider';
import { migrateDB } from '@dory/database/postgres/migrate';
import { resetPgliteClient } from '@dory/database/postgres/client/pglite';
import { isDesktopRuntime } from '@dory/shared/runtime';

import { resolveDemoSqlitePath } from '../lib/demo/paths';

const DEFAULT_PGLITE_DB_PATH = '/app/data/dory';
const DESKTOP_PGLITE_DB_PATH = './data/dory';

async function ensureDirForFile(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function toFsPath(v: string) {
    if (v.startsWith('file:')) return fileURLToPath(v);
    return decodeURIComponent(v);
}

async function bootstrapPglite() {
    const defaultFile = isDesktopRuntime() ? DESKTOP_PGLITE_DB_PATH : DEFAULT_PGLITE_DB_PATH;
    const raw = process.env.PGLITE_DB_PATH ?? defaultFile;
    console.log('[bootstrap] raw PGLITE_DB_PATH =', raw);

    const dbFilePath = toFsPath(raw);

    // Keep a canonical file:// URL in env so downstream code resolves paths consistently.
    process.env.PGLITE_DB_PATH = ensureFileUrl(dbFilePath);
    console.log('[bootstrap] normalized PGLITE_DB_PATH =', process.env.PGLITE_DB_PATH);
    console.log('[bootstrap] resolved pglite fs path =', dbFilePath);

    await ensureDirForFile(dbFilePath);

    console.log('[bootstrap] running pglite migrate...');
    await migratePgliteDB();
}

async function verifyDemoSqlite() {
    const demoPath = resolveDemoSqlitePath();
    try {
        await fs.access(demoPath);
        console.log('[bootstrap] fixed demo sqlite =', demoPath);
    } catch (error) {
        console.warn('[bootstrap] fixed demo sqlite missing:', demoPath, error);
    }
}

export async function bootstrap() {
    const dbType = getDatabaseProvider();
    console.log('[bootstrap] DB_TYPE =', dbType);

    if (dbType === 'pglite') {
        await bootstrapPglite();
        // Close the PGlite client so the Postgres WASM process shuts down cleanly.
        // Without this, the WASM runtime calls exit(99) when the Node process drains,
        // which propagates as exit code 99 and prevents the next process (server.js) from starting.
        await resetPgliteClient();
    } else if (dbType === 'postgres') {
        console.log('[bootstrap] running postgres migrate...');
        await migrateDB();
    } else {
        console.log('[bootstrap] skip bootstrap');
    }

    await verifyDemoSqlite();
    console.log('[bootstrap] completed');
}

bootstrap().catch(err => {
    console.error('[bootstrap] failed:', err);
    process.exit(1);
});
