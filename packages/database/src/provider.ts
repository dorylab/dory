export type DatabaseProvider = 'postgres' | 'pglite';

let cachedProvider: DatabaseProvider | null = null;

export function getDatabaseProvider(): DatabaseProvider {
    if (cachedProvider) return cachedProvider;
    const raw = (process.env.DB_TYPE ?? 'pglite').toLowerCase();
    cachedProvider = raw === 'pglite' ? 'pglite' : 'postgres';
    return cachedProvider;
}

export const isPgliteProvider = () => getDatabaseProvider() === 'pglite';
export const isPostgresProvider = () => getDatabaseProvider() === 'postgres';
