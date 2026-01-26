import { BaseConnection } from "./base/base-connection";
import { BaseConfig } from "./base/types";
import { createProvider } from "./factory";


const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // Close after 5 minutes of inactivity
const DEFAULT_PING_TIMEOUT_MS = 5_000;
const PING_TIMEOUT_MS = Number.isFinite(Number(process.env.DATASOURCE_PING_TIMEOUT_MS))
    ? Math.max(1000, Number(process.env.DATASOURCE_PING_TIMEOUT_MS))
    : DEFAULT_PING_TIMEOUT_MS;

const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
const CLOSE_TIMEOUT_MS = Number.isFinite(Number(process.env.DATASOURCE_CLOSE_TIMEOUT_MS))
    ? Math.max(1000, Number(process.env.DATASOURCE_CLOSE_TIMEOUT_MS))
    : DEFAULT_CLOSE_TIMEOUT_MS;

export type DatasourcePoolEntry = {
    type: BaseConfig['type'];
    instance: BaseConnection;
    config: BaseConfig;
    idleTimer?: ReturnType<typeof setTimeout> | null;
};

type PoolStore = Map<string, DatasourcePoolEntry>;

const GLOBAL_STORE_KEY = '__datasource_pool_store__';
const internalStore: PoolStore = new Map();
const reconnecting = new Map<string, Promise<DatasourcePoolEntry>>();

function getStore(): PoolStore {
    if (process.env.NODE_ENV === 'development') {
        const globalObj = globalThis as unknown as Record<string, unknown>;
        if (!globalObj[GLOBAL_STORE_KEY]) {
            globalObj[GLOBAL_STORE_KEY] = new Map<string, DatasourcePoolEntry>();
        }
        return globalObj[GLOBAL_STORE_KEY] as PoolStore;
    }
    return internalStore;
}

function resetIdleTimer(entry: DatasourcePoolEntry) {
    if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
    }
    entry.idleTimer = setTimeout(() => {
        destroyDatasourcePool(entry.config.id).catch(err => {
            console.error('[datasource-pool] failed to destroy idle pool', err);
        });
    }, IDLE_TIMEOUT_MS);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(label));
        }, timeoutMs);

        promise
            .then(value => resolve(value))
            .catch(err => reject(err))
            .finally(() => clearTimeout(timer));
    });
}

async function reconnectEntry(entry: DatasourcePoolEntry): Promise<DatasourcePoolEntry> {
    const existing = reconnecting.get(entry.config.id);
    if (existing) return existing;

    const promise = (async () => {
        await destroyDatasourcePool(entry.config.id);
        const fresh = await createEntry(entry.config);
        getStore().set(entry.config.id, fresh);
        return fresh;
    })().finally(() => {
        reconnecting.delete(entry.config.id);
    });

    reconnecting.set(entry.config.id, promise);
    return promise;
}

async function ensureHealthyEntry(entry: DatasourcePoolEntry): Promise<DatasourcePoolEntry> {
    try {
        await withTimeout(entry.instance.ping(), PING_TIMEOUT_MS, 'PING_TIMEOUT');
        resetIdleTimer(entry);
        return entry;
    } catch (err) {
        console.warn('[datasource-pool] ping failed, reconnecting', err);
        return reconnectEntry(entry);
    }
}

async function createEntry(config: BaseConfig): Promise<DatasourcePoolEntry> {
    const instance = await createProvider(config);
    const entry: DatasourcePoolEntry = { type: config.type, instance, config, idleTimer: null };
    resetIdleTimer(entry);
    return entry;
}

export async function ensureDatasourcePool(config: BaseConfig): Promise<DatasourcePoolEntry> {
    const store = getStore();
    const existing = store.get(config.id);

    // If we already have an entry, always ensure it is healthy before returning.
    // This avoids callers accidentally holding a stale/broken instance.
    if (existing) {
        return await ensureHealthyEntry(existing);
    }

    const entry = await createEntry(config);
    store.set(config.id, entry);
    return entry;
}

export async function getDatasourcePool(id: string): Promise<DatasourcePoolEntry | undefined> {
    const entry = getStore().get(id);
    if (!entry) return undefined;
    try {
        return await ensureHealthyEntry(entry);
    } catch (err) {
        console.error('[datasource-pool] failed to reconnect datasource', err);
        return undefined;
    }
}

export function hasDatasourcePool(id: string): boolean {
    return getStore().has(id);
}

export async function destroyDatasourcePool(id: string): Promise<void> {
    const store = getStore();
    const entry = store.get(id);
    if (!entry) return;

    if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = null;
    }

    await withTimeout(entry.instance.close(), CLOSE_TIMEOUT_MS, 'CLOSE_TIMEOUT').catch(err => {
        console.error('[datasource-pool] failed to close datasource instance', err);
    });

    store.delete(id);
}

export function listDatasourcePoolIds(): string[] {
    return Array.from(getStore().keys());
}
