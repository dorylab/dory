import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schemas from './schemas';
import { DBClient } from '@/types';
import { translate } from '@/lib/i18n/i18n';
import { getClientLocale } from '@/lib/i18n/client-locale';

const PGLITE_BASE_DIR = 'idb://dory';
const PGLITE_SCHEMA_VERSION_KEY = 'dory_pglite_schema_version';

declare global {
    // eslint-disable-next-line no-var
    var __pglite_instance: PGlite | undefined;
    // eslint-disable-next-line no-var
    var __drizzle_instance: DBClient | undefined;
    // eslint-disable-next-line no-var
    var __pglite_init_promise: Promise<DBClient> | undefined;
}

/** Format time: YYYYMMDD_HHmmss */
function nowVersionStamp() {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return d.getFullYear().toString() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

/** Current dataDir = baseDir + version */
function getCurrentDataDir() {
    if (typeof window === 'undefined') return PGLITE_BASE_DIR;
    const ver = window.localStorage?.getItem(PGLITE_SCHEMA_VERSION_KEY);
    if (!ver) {
        // Default initial creation
        const v = nowVersionStamp();
        window.localStorage?.setItem(PGLITE_SCHEMA_VERSION_KEY, v);
        return `${PGLITE_BASE_DIR}_${v}`;
    }
    return `${PGLITE_BASE_DIR}_${ver}`;
}

/** Bump version → switch to a new database */
export function bumpPgliteSchemaVersion() {
    if (typeof window === 'undefined') return;
    const newVer = nowVersionStamp();
    window.localStorage?.setItem(PGLITE_SCHEMA_VERSION_KEY, newVer);

    // Clear in-memory singletons to force a fresh DB next time
    (globalThis as any).__pglite_instance = undefined;
    (globalThis as any).__drizzle_instance = undefined;
    (globalThis as any).__pglite_init_promise = undefined;
}

export async function initPGLiteClient(): Promise<DBClient> {
    if (typeof window === 'undefined') {
        throw new Error(translate(getClientLocale(), 'Client.Pglite.BrowserOnly'));
    }

    if (globalThis.__drizzle_instance) return globalThis.__drizzle_instance;
    if (globalThis.__pglite_init_promise) return globalThis.__pglite_init_promise;

    const initPromise = (async () => {
        const dataDir = getCurrentDataDir();

        // ---- Initialize PGlite ----
        const pglite = new PGlite({
            dataDir,
            relaxedDurability: true,
        });

        await pglite.waitReady;

        // ---- Initialize drizzle ----
        const db = drizzle(pglite, { schema: schemas }) as unknown as DBClient;
        (db as any).$client = pglite;

        globalThis.__pglite_instance = pglite;
        globalThis.__drizzle_instance = db;
        return db;
    })();

    globalThis.__pglite_init_promise = initPromise;
    return initPromise;
}

export async function getDBClient() {
    return initPGLiteClient();
}
