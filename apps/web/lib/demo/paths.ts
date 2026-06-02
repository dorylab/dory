import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDemoDuckDbConnectionPath, isDemoSqliteConnectionPath } from './connection-path';

const DEMO_SQLITE_FILENAME = 'demo.sqlite';
const DEMO_DUCKDB_FILENAME = 'demo.duckdb';
const DEMO_SQLITE_DIR = path.join('public', 'resources');
const DEMO_SQLITE_RELATIVE_PATH = path.join(DEMO_SQLITE_DIR, DEMO_SQLITE_FILENAME);
const DEMO_DUCKDB_RELATIVE_PATH = path.join(DEMO_SQLITE_DIR, DEMO_DUCKDB_FILENAME);

function getDemoSqlitePathCandidates(): string[] {
    return [path.resolve(process.cwd(), DEMO_SQLITE_RELATIVE_PATH), path.resolve(process.cwd(), 'apps', 'web', DEMO_SQLITE_RELATIVE_PATH)];
}

function getDemoDuckDbPathCandidates(): string[] {
    return [path.resolve(process.cwd(), DEMO_DUCKDB_RELATIVE_PATH), path.resolve(process.cwd(), 'apps', 'web', DEMO_DUCKDB_RELATIVE_PATH)];
}

function resolveFileUrlPath(value: string | undefined): string | null {
    if (!value?.startsWith('file:')) return null;
    try {
        return fileURLToPath(value);
    } catch {
        return null;
    }
}

function getDemoResourceCacheRoot(): string {
    const configured = process.env.DORY_DEMO_RESOURCE_CACHE_DIR?.trim();
    if (configured) return configured;

    const pglitePath = resolveFileUrlPath(process.env.PGLITE_DB_PATH);
    if (pglitePath) {
        return path.join(path.dirname(pglitePath), 'demo-resources');
    }

    return path.join(process.cwd(), 'localdata', 'demo-resources');
}

function ensureRuntimeResourceCopy(sourcePath: string, filename: string): string {
    const targetPath = path.join(/* turbopackIgnore: true */ getDemoResourceCacheRoot(), filename);
    try {
        const sourceStat = fs.statSync(sourcePath);
        const targetStat = fs.existsSync(/* turbopackIgnore: true */ targetPath) ? fs.statSync(/* turbopackIgnore: true */ targetPath) : null;
        const needsCopy = !targetStat || targetStat.size !== sourceStat.size || Math.trunc(targetStat.mtimeMs) < Math.trunc(sourceStat.mtimeMs);

        if (needsCopy) {
            fs.mkdirSync(path.dirname(/* turbopackIgnore: true */ targetPath), { recursive: true });
            fs.copyFileSync(sourcePath, /* turbopackIgnore: true */ targetPath);
            fs.chmodSync(/* turbopackIgnore: true */ targetPath, 0o644);
        }

        return targetPath;
    } catch (error) {
        console.warn('[demo] failed to prepare runtime demo resource copy, falling back to bundled resource', error);
        return sourcePath;
    }
}

/**
 * Resolve the absolute path for the bundled demo SQLite file.
 * The file is treated as a fixed app resource rather than a generated runtime artifact.
 */
export function resolveDemoSqlitePath(): string {
    const existingPath = getDemoSqlitePathCandidates().find(candidate => fs.existsSync(candidate));

    if (existingPath) {
        return existingPath;
    }

    // Fall back to the primary monorepo layout for callers that want a deterministic path
    // even before the file has been created or copied into place.
    return path.resolve(process.cwd(), 'apps', 'web', DEMO_SQLITE_RELATIVE_PATH);
}

export function resolveDemoDuckDbPath(): string {
    const existingPath = getDemoDuckDbPathCandidates().find(candidate => fs.existsSync(candidate));

    if (existingPath) {
        return ensureRuntimeResourceCopy(existingPath, DEMO_DUCKDB_FILENAME);
    }

    return path.resolve(process.cwd(), 'apps', 'web', DEMO_DUCKDB_RELATIVE_PATH);
}

export function isDemoDuckDbResourcePath(value: string | null | undefined): boolean {
    const normalized = value?.trim();
    if (!normalized) return false;
    if (isDemoDuckDbConnectionPath(normalized)) return true;

    const parsed = path.parse(normalized);
    if (parsed.base !== DEMO_DUCKDB_FILENAME) return false;

    const parent = path.basename(parsed.dir);
    const grandparent = path.basename(path.dirname(parsed.dir));
    return parent === 'resources' && grandparent === 'public';
}

export function resolveStoredSqlitePath(value: string | null | undefined): string | undefined {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (isDemoSqliteConnectionPath(normalized)) {
        return resolveDemoSqlitePath();
    }
    return normalized;
}

export function resolveStoredDatabasePath(value: string | null | undefined): string | undefined {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (isDemoSqliteConnectionPath(normalized)) {
        return resolveDemoSqlitePath();
    }
    if (isDemoDuckDbConnectionPath(normalized) || isDemoDuckDbResourcePath(normalized)) {
        return resolveDemoDuckDbPath();
    }
    return normalized;
}

/**
 * Get the fixed absolute path for demo.sqlite.
 */
export function getDemoSqlitePath(): string | undefined {
    return resolveDemoSqlitePath();
}
