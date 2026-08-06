import Database from 'better-sqlite3';
import { DuckDBInstance } from '@duckdb/node-api';

export type LocalDatabaseFileType = 'duckdb' | 'sqlite';

export async function createLocalDatabaseFile(type: LocalDatabaseFileType, filePath: string): Promise<void> {
    if (type === 'sqlite') {
        const database = new Database(filePath);
        try {
            database.pragma('schema_version');
        } finally {
            database.close();
        }
        return;
    }

    const instance = await DuckDBInstance.create(filePath);
    try {
        const connection = await instance.connect();
        try {
            await connection.run('CHECKPOINT');
        } finally {
            connection.closeSync();
        }
    } finally {
        instance.closeSync();
    }
}
