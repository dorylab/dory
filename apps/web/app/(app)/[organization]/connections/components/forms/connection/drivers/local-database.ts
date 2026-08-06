export type LocalDatabaseType = 'duckdb' | 'sqlite';
export type LocalDatabaseSource = 'existing' | 'new';

export const DEFAULT_LOCAL_DATABASE_DIRECTORY = '~/Dory/databases';

const ALLOWED_EXTENSIONS: Record<LocalDatabaseType, ReadonlySet<string>> = {
    duckdb: new Set(['duckdb', 'db']),
    sqlite: new Set(['sqlite', 'sqlite3', 'db']),
};

export function getDefaultLocalDatabaseFileName(type: LocalDatabaseType) {
    return type === 'duckdb' ? 'demo.duckdb' : 'demo.sqlite';
}

function getFileExtension(fileName: string) {
    return fileName.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() ?? '';
}

export function normalizeLocalDatabaseFileName(type: LocalDatabaseType, fileName: string) {
    const normalized = fileName.trim();
    if (!normalized || getFileExtension(normalized)) return normalized;
    return `${normalized}.${type === 'duckdb' ? 'duckdb' : 'sqlite'}`;
}

export function validateLocalDatabaseFileName(type: LocalDatabaseType, fileName: string): string | null {
    const normalized = fileName.trim();
    if (!normalized) return 'missing';
    if (normalized === '.' || normalized === '..' || /[\\/]/.test(normalized)) return 'invalid';

    const extension = getFileExtension(normalized);
    if (extension && !ALLOWED_EXTENSIONS[type].has(extension)) return 'extension';
    return null;
}

export function isAbsoluteOrHomePath(value: string) {
    return /^(~[\\/]|\/|[a-zA-Z]:[\\/])/.test(value.trim());
}

export function buildLocalDatabasePath(type: LocalDatabaseType, directory: string, fileName: string) {
    const normalizedDirectory = directory.trim().replace(/[\\/]+$/, '');
    const normalizedFileName = normalizeLocalDatabaseFileName(type, fileName);
    return `${normalizedDirectory}/${normalizedFileName}`;
}
