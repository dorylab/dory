import { Pool, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schemas from '../schemas';
import type { PostgresDBClient } from '@/types';
import { translateDatabase } from '@/lib/database/i18n';

const globalForPg = globalThis as typeof globalThis & {
    __postgresDbPromise?: Promise<PostgresDBClient>;
    __postgresPool?: Pool;
};

function getConnectionString(): string {
    const conn =
        process.env.DATABASE_URL ??
        process.env.POSTGRES_URL ??
        process.env.POSTGRES_CONNECTION_STRING ??
        null;
    if (!conn) {
        throw new Error(translateDatabase('Database.Errors.MissingDatabaseUrl'));
    }
    return conn;
}

function buildPoolConfig(): PoolConfig {
    const connectionString = getConnectionString();
    const config: PoolConfig = { connectionString };

    if (process.env.POSTGRES_SSL === 'true') {
        config.ssl = { rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false' };
    }

    if (process.env.POSTGRES_MAX_CONNECTIONS) {
        const max = Number(process.env.POSTGRES_MAX_CONNECTIONS);
        if (Number.isFinite(max)) {
            config.max = max;
        }
    }

    return config;
}

async function initPostgres(): Promise<PostgresDBClient> {
    const pool = globalForPg.__postgresPool ?? new Pool(buildPoolConfig());
    globalForPg.__postgresPool = pool;

    const client = drizzle(pool, { schema: schemas }) as PostgresDBClient;
    (client as any).$client = pool;

    return client;
}

export function getPostgresClient(): Promise<PostgresDBClient> {
    if (!globalForPg.__postgresDbPromise) {
        globalForPg.__postgresDbPromise = initPostgres();
    }
    return globalForPg.__postgresDbPromise;
}
