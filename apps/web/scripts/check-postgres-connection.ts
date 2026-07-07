import 'dotenv/config';
import { Client } from 'pg';

const DEFAULT_CONNECTION_TIMEOUT_MS = 30000;

function parseConnectionTimeoutMillis(): number {
    const raw = process.env.POSTGRES_CHECK_TIMEOUT_MS?.trim();
    if (!raw) return DEFAULT_CONNECTION_TIMEOUT_MS;

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`POSTGRES_CHECK_TIMEOUT_MS must be a positive number, got: ${raw}`);
    }

    return value;
}

function normalizeConnectionString(connectionString: string): string {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase();

    if (sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
        url.searchParams.set('sslmode', 'verify-full');
    }

    return url.toString();
}

function describeConnection(connectionString: string) {
    const url = new URL(connectionString);
    return {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.replace(/^\//, '') || '<default>',
        sslmode: url.searchParams.get('sslmode') ?? '<default>',
    };
}

async function main() {
    const configuredConnectionString = process.env.DATABASE_URL;

    if (!configuredConnectionString) {
        throw new Error('DATABASE_URL is missing');
    }

    const connectionString = normalizeConnectionString(configuredConnectionString);
    const connectionTimeoutMillis = parseConnectionTimeoutMillis();
    const connection = describeConnection(connectionString);

    console.log('[DB Check] Connecting to Postgres...');
    console.log('[DB Check] Target:', connection);
    console.log(`[DB Check] Timeout: ${connectionTimeoutMillis}ms`);

    const client = new Client({
        connectionString,
        connectionTimeoutMillis,
    });

    try {
        await client.connect();
        const result = await client.query(
            'select current_database() as database, current_user as user_name, now() as server_time',
        );
        console.log('[DB Check] Connection succeeded');
        console.log(result.rows[0]);
    } finally {
        await client.end().catch(() => undefined);
    }
}

main().catch(error => {
    console.error('[DB Check] Connection failed');
    console.error(error);
    process.exit(1);
});
