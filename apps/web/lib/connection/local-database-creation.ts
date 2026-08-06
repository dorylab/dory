import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createLocalDatabaseFile, type LocalDatabaseFileType } from '@dory/drivers/database';

type LocalDatabaseConnection = Record<string, unknown> & {
    type?: unknown;
    engine?: unknown;
    path?: unknown;
    options?: unknown;
};

export type PreparedLocalDatabase = {
    connection: LocalDatabaseConnection;
    cleanup: () => Promise<void>;
};

const ALLOWED_EXTENSIONS: Record<LocalDatabaseFileType, ReadonlySet<string>> = {
    duckdb: new Set(['duckdb', 'db']),
    sqlite: new Set(['sqlite', 'sqlite3', 'db']),
};

function parseOptions(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw !== 'string') return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function resolveLocalDatabaseType(connection: LocalDatabaseConnection): LocalDatabaseFileType {
    const type = String(connection.type ?? connection.engine ?? '').toLowerCase();
    if (type !== 'sqlite' && type !== 'duckdb') {
        throw new Error('New local databases are only supported for SQLite and DuckDB');
    }
    if (type === 'duckdb' && parseOptions(connection.options).mode === 'motherduck') {
        throw new Error('MotherDuck connections cannot create a local database file');
    }
    return type;
}

export function resolveLocalDatabaseCreationPath(rawPath: unknown) {
    const value = typeof rawPath === 'string' ? rawPath.trim() : '';
    if (!value) throw new Error('Database file path is required');

    const expanded = /^~[\\/]/.test(value) ? path.join(os.homedir(), value.slice(2)) : value;
    if (!path.isAbsolute(expanded)) {
        throw new Error('Database file path must be absolute or start with ~/');
    }
    return path.normalize(expanded);
}

function assertSupportedExtension(type: LocalDatabaseFileType, filePath: string) {
    const extension = path.extname(filePath).slice(1).toLowerCase();
    if (!ALLOWED_EXTENSIONS[type].has(extension)) {
        throw new Error(type === 'duckdb' ? 'DuckDB file name must use .duckdb or .db' : 'SQLite file name must use .sqlite, .sqlite3, or .db');
    }
}

async function assertPathDoesNotExist(filePath: string) {
    try {
        await fs.lstat(filePath);
        throw new Error(`Database file already exists: ${filePath}`);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}

async function removeCreatedFile(filePath: string, createdStat: Awaited<ReturnType<typeof fs.stat>> | null) {
    if (!createdStat) return;
    try {
        const currentStat = await fs.stat(filePath);
        if (currentStat.dev === createdStat.dev && currentStat.ino === createdStat.ino) {
            await fs.unlink(filePath);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}

export async function prepareLocalDatabaseCreation(connection: LocalDatabaseConnection): Promise<PreparedLocalDatabase> {
    const type = resolveLocalDatabaseType(connection);
    const filePath = resolveLocalDatabaseCreationPath(connection.path);
    assertSupportedExtension(type, filePath);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await assertPathDoesNotExist(filePath);

    const lockPath = `${filePath}.dory-create.lock`;
    let lock: Awaited<ReturnType<typeof fs.open>>;
    try {
        lock = await fs.open(lockPath, 'wx');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new Error(`Database file creation is already in progress: ${filePath}`);
        }
        throw error;
    }

    let createdStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
        await assertPathDoesNotExist(filePath);

        try {
            await createLocalDatabaseFile(type, filePath);
            createdStat = await fs.stat(filePath);
        } catch (error) {
            await fs.unlink(filePath).catch(unlinkError => {
                if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError;
            });
            throw error;
        }
    } finally {
        await lock.close();
        await fs.unlink(lockPath).catch(error => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        });
    }

    return {
        connection: {
            ...connection,
            path: filePath,
        },
        cleanup: () => removeCreatedFile(filePath, createdStat),
    };
}
