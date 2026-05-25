import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import nextEnv from '@next/env';
import { migratePgliteDB } from '@dory/database/pglite/migrate-pglite';
import { getDatabaseProvider } from '@dory/database/provider';
import { ensureFileUrl, extractFilePath } from '@dory/database/pglite/url';
import { resolveDemoSqlitePath } from '@/lib/demo/paths';
import { resetPgliteClient } from '@dory/database/postgres/client/pglite';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(appDir, true);

async function ensureDirForFile(filePath: string) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
}

async function bootstrapPglite() {
    /**
     * Your env should include at least:
     * - PGLITE_DB_PATH=file:/abs/path/db
     */
    const dbUrl = process.env.PGLITE_DB_PATH;

    if (!dbUrl) {
        throw new Error('[dev-bootstrap] DB_TYPE=pglite but PGLITE_DB_PATH is missing');
    }

    const dbFilePath = extractFilePath(dbUrl);
    process.env.PGLITE_DB_PATH = ensureFileUrl(dbFilePath);

    // 🔴 Key point: only create the parent directory
    await ensureDirForFile(dbFilePath);

    console.log('[dev] running pglite migrate...');
    await migratePgliteDB();

    // Close the PGlite client so the process can exit after bootstrap
    await resetPgliteClient();
}

async function verifyDemoSqlite() {
    const demoPath = resolveDemoSqlitePath();
    try {
        await fs.access(demoPath);
        console.log('[dev] fixed demo sqlite =', demoPath);
    } catch (error) {
        console.warn('[dev] fixed demo sqlite missing:', demoPath, error);
    }
}

export async function bootstrapLocalDev() {
    const dbType = getDatabaseProvider();

    console.log('[dev] DB_TYPE =', dbType);

    if (dbType === 'pglite') {
        await bootstrapPglite();
    } else {
        // Other types (postgres / mysql) usually don't need bootstrap in dev
        console.log('[dev] skip dev bootstrap');
    }

    await verifyDemoSqlite();
}

// Allow direct tsx execution
bootstrapLocalDev().catch(err => {
    console.error('[dev-bootstrap] failed:', err);
    process.exit(1);
});
