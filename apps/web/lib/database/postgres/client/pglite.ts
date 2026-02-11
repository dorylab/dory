// database/postgres/client/pglite.ts
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schemas from '../schemas';
import type { PostgresDBClient } from '@/types';
import { DEFAULT_PGLITE_DB_PATH } from '@/shared/data/app.data';
import { extractFilePath } from '@/lib/database/pglite/url';

const globalForPglite = globalThis as typeof globalThis & {
    __pgliteDbPromise?: Promise<PostgresDBClient>;
    __pgliteClient?: PGlite;
};

// function isRunningInElectronMain() {
//     // Main process: process.versions.electron exists and no renderer flag
//     return !!process.versions?.electron && process.type !== 'renderer';
// }

async function resolvePgliteDataDir(): Promise<string> {
    // 1) Explicitly set (local dev / CI / multi-instance)
    if (process.env.DATABASE_URL) {
        const pathFromUrl = extractFilePath(process.env.DATABASE_URL);
        return pathFromUrl;
    }

    // 2) Electron main process default (production)
    // if (isRunningInElectronMain()) {
    //     const { app } = await import('electron');
    //     const dir = path.join(app.getPath('userData'), 'pglite-data');
    //     return `file://${dir}`;
    // }

    // 3) Fallback (e.g. local Node debugging)
    const dir = path.resolve(process.cwd(), DEFAULT_PGLITE_DB_PATH);
    return dir;
}

async function initPglite(): Promise<PostgresDBClient> {
    const dataDir = await resolvePgliteDataDir();

    const client = globalForPglite.__pgliteClient ?? new PGlite({ dataDir });

    globalForPglite.__pgliteClient = client;

    const db = drizzle({ client, schema: schemas }) as unknown as PostgresDBClient;
    (db as any).$client = client;
    return db;
}

export function getPgliteClient(): Promise<PostgresDBClient> {
    if (!globalForPglite.__pgliteDbPromise) {
        globalForPglite.__pgliteDbPromise = initPglite();
    }
    return globalForPglite.__pgliteDbPromise;
}
