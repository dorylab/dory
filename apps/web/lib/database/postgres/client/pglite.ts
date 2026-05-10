// database/postgres/client/pglite.ts
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schemas from '../schemas';
import type { PostgresDBClient } from '@/types';
import { extractFilePath } from '@/lib/database/pglite/url';
import { isDesktopRuntime } from '@/lib/runtime/runtime';

const DEFAULT_PGLITE_DB_PATH = '/app/data/dory';
const DESKTOP_PGLITE_DB_PATH = './data/dory';

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
    if (process.env.PGLITE_DB_PATH) {
        const pathFromUrl = extractFilePath(process.env.PGLITE_DB_PATH);
        return pathFromUrl;
    }

    // 2) Electron main process default (production)
    // if (isRunningInElectronMain()) {
    //     const { app } = await import('electron');
    //     const dir = path.join(app.getPath('userData'), 'pglite-data');
    //     return `file://${dir}`;
    // }

    // 3) Fallback (e.g. local Node debugging)
    const defaultDir = isDesktopRuntime() ? DESKTOP_PGLITE_DB_PATH : DEFAULT_PGLITE_DB_PATH;
    // Indirect call to prevent Turbopack from statically tracing this as a file pattern
    const resolve = path.resolve.bind(path);
    return resolve(process.cwd(), defaultDir);
}

export { resolvePgliteDataDir };

async function initPglite(): Promise<PostgresDBClient> {
    const dataDir = await resolvePgliteDataDir();
    console.log('[pglite] init start', {
        cwd: process.cwd(),
        envPath: process.env.PGLITE_DB_PATH ?? null,
        resolvedDataDir: dataDir,
    });

    try {
        const client = globalForPglite.__pgliteClient ?? new PGlite({ dataDir });
        globalForPglite.__pgliteClient = client;

        const db = drizzle({ client, schema: schemas }) as unknown as PostgresDBClient;
        (db as any).$client = client;

        console.log('[pglite] init success', {
            resolvedDataDir: dataDir,
        });

        return db;
    } catch (error) {
        console.error('[pglite] init failed', {
            cwd: process.cwd(),
            envPath: process.env.PGLITE_DB_PATH ?? null,
            resolvedDataDir: dataDir,
            error,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            cause:
                error instanceof Error && 'cause' in error
                    ? (error as Error & { cause?: unknown }).cause
                    : undefined,
        });
        throw error;
    }
}

export function getPgliteClient(): Promise<PostgresDBClient> {
    if (!globalForPglite.__pgliteDbPromise) {
        globalForPglite.__pgliteDbPromise = initPglite();
    }
    return globalForPglite.__pgliteDbPromise;
}

export async function resetPgliteClient() {
    const client = globalForPglite.__pgliteClient;

    if (client && typeof (client as PGlite & { close?: () => Promise<void> }).close === 'function') {
        await (client as PGlite & { close: () => Promise<void> }).close();
    }

    globalForPglite.__pgliteClient = undefined;
    globalForPglite.__pgliteDbPromise = undefined;
}
