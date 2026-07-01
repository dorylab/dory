import type { StoredDriverIdentity } from '@dory/drivers/config';
import { parseConnectionOptions } from '@dory/drivers/config';
import type { ConnectionListItem } from '@dory/shared/types/connections';

type ConnectionLike = {
    type?: unknown;
    engine?: unknown;
    database?: unknown;
    options?: unknown;
};

export type CredentiallessDefaultIdentity = StoredDriverIdentity & {
    id: string;
    name: string;
    username: string;
    role: null;
    password: null;
    isDefault: true;
    database: string | null;
    enabled: true;
    status: 'active';
};

function resolveCredentiallessType(connection: ConnectionLike): 'sqlite' | 'duckdb' | null {
    const type = typeof connection.type === 'string' ? connection.type.toLowerCase() : null;
    const engine = typeof connection.engine === 'string' ? connection.engine.toLowerCase() : null;
    const resolved = type ?? engine;

    if (resolved === 'sqlite') return 'sqlite';
    if (resolved !== 'duckdb') return null;

    const options = parseConnectionOptions(connection.options) ?? {};
    return options.mode === 'motherduck' ? null : 'duckdb';
}

function credentiallessDatabase(connection: ConnectionLike, type: 'sqlite' | 'duckdb') {
    const database = typeof connection.database === 'string' && connection.database.trim() ? connection.database.trim() : null;
    if (database) return database;
    return type === 'sqlite' ? 'main' : null;
}

export function isCredentiallessConnection(connection: ConnectionLike): boolean {
    return Boolean(resolveCredentiallessType(connection));
}

export function createCredentiallessDefaultIdentity(connection: ConnectionLike): CredentiallessDefaultIdentity {
    const type = resolveCredentiallessType(connection) ?? 'sqlite';

    return {
        id: '',
        name: 'Default',
        username: type,
        role: null,
        password: null,
        isDefault: true,
        database: credentiallessDatabase(connection, type),
        enabled: true,
        status: 'active',
    };
}

export function withCredentiallessDefaultIdentity<T extends { identities?: StoredDriverIdentity[] | null; connection: ConnectionLike }>(record: T): T {
    if (record.identities?.length || !isCredentiallessConnection(record.connection)) {
        return record;
    }

    return {
        ...record,
        identities: [createCredentiallessDefaultIdentity(record.connection)],
    };
}

export function withCredentiallessDefaultIdentities<T extends ConnectionListItem>(records: T[]): T[] {
    return records.map(record => withCredentiallessDefaultIdentity(record));
}
