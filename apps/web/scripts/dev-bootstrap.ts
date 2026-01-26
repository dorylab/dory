// scripts/dev-bootstrap.ts
import 'dotenv/config'; // Equivalent to dotenv.config(), but more reliable
import fs from 'node:fs/promises';
import path from 'node:path';

import { migratePgliteDB } from '@/lib/database/pglite/migrate-pglite';
import { getDatabaseProvider } from '@/lib/database/provider';
import { ensureFileUrl, extractFilePath } from '@/lib/database/pglite/url';

async function ensureDirForFile(filePath: string) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
}

async function bootstrapPglite() {
    /**
     * Your env should include at least:
     * - DATABASE_URL=file:/abs/path/db
     */
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        throw new Error('[dev-bootstrap] DB_TYPE=pglite but DATABASE_URL is missing');
    }

    const dbFilePath = extractFilePath(dbUrl);
    process.env.DATABASE_URL = ensureFileUrl(dbFilePath);

    // 🔴 Key point: only create the parent directory
    await ensureDirForFile(dbFilePath);

    console.log('[dev] running pglite migrate...');
    await migratePgliteDB();
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
}

// Allow direct tsx execution
bootstrapLocalDev().catch(err => {
    console.error('[dev-bootstrap] failed:', err);
    process.exit(1);
});
