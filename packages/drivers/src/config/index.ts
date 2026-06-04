import { UnsupportedTypeError } from '../core/base/errors';
import type { DriverConfig, DriverType } from '../types';
import { applyQueryRequestTimeout } from '../core/defaults';
import { isConnectionDriverType } from '../core/registry/types';

export type StoredDriverConnection = {
    id: string;
    type?: string | null;
    engine?: string | null;
    host?: string | null;
    port?: number | string | null;
    httpPort?: number | null;
    database?: string | null;
    path?: string | null;
    options?: string | Record<string, unknown> | null;
    configVersion?: string | number | null;
    updatedAt?: Date | string | number | null;
};

export type StoredDriverIdentity = {
    id?: string;
    name?: string;
    username?: string | null;
    role?: string | null;
    isDefault?: boolean;
    database?: string | null;
    enabled?: boolean;
    status?: string | null;
    password?: string | null;
};

export type StoredDriverSsh = {
    enabled?: boolean;
    host?: string | null;
    port?: number | string | null;
    username?: string | null;
    authMethod?: string | null;
    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
};

export type StoredDriverTls = {
    mode?: string | null;
    caCertificatePath?: string | null;
    clientCertificatePath?: string | null;
    clientPrivateKeyPath?: string | null;
    serverName?: string | null;
    ciphers?: string | null;
    minVersion?: string | null;
    maxVersion?: string | null;
    caCertificateContent?: string | null;
    clientCertificateContent?: string | null;
    clientPrivateKeyContent?: string | null;
    clientPrivateKeyPassphrase?: string | null;
};

export type StoredDriverConnectionListItem = {
    connection: StoredDriverConnection;
    identities: StoredDriverIdentity[];
    ssh: StoredDriverSsh | null;
    tls?: StoredDriverTls | null;
};

export type TestDriverConnectionPayload = {
    connection: StoredDriverConnection & { name?: string | null };
    identity: StoredDriverIdentity;
    ssh?: StoredDriverSsh | null;
    tls?: StoredDriverTls | null;
    timeout?: number;
};

export type DriverPathResolver = (path?: string | null) => string | undefined;

type IdentityWithPassword = StoredDriverIdentity & { password?: string | null };
type SshWithSecrets = StoredDriverSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null };
type TlsWithSecrets = StoredDriverTls & {
    caCertificateContent?: string | null;
    clientCertificateContent?: string | null;
    clientPrivateKeyContent?: string | null;
    clientPrivateKeyPassphrase?: string | null;
};
type TestIdentity = TestDriverConnectionPayload['identity'];
type TestSshWithSecrets = NonNullable<TestDriverConnectionPayload['ssh']> & {
    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
};

type ErrorFactory = (code: string) => Error;

function defaultErrorFactory(code: string): Error {
    return new Error(code);
}

export function parseConnectionOptions(raw: unknown): Record<string, unknown> | undefined {
    if (!raw) return undefined;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

export function pickConnectionIdentity(list: StoredDriverIdentity[], targetId?: string | null): StoredDriverIdentity | null {
    if (!Array.isArray(list) || list.length === 0) return null;
    if (targetId) {
        const matched = list.find(item => item.id === targetId);
        if (matched) return matched;
    }
    const defaultOne = list.find(item => item.isDefault);
    if (defaultOne) return defaultOne;
    return list[0] ?? null;
}

export function resolveConnectionType(rawType: unknown): DriverType {
    const normalizedType = typeof rawType === 'string' ? rawType.toLowerCase() : rawType;
    if (!isConnectionDriverType(normalizedType)) {
        throw new UnsupportedTypeError(String(rawType));
    }
    return normalizedType;
}

function buildOptions(
    rawOptions: unknown,
    ports: { httpPort?: number | null; port?: number | string | null },
    ssh?: {
        enabled?: boolean;
        host?: string | null;
        port?: number | string | null;
        username?: string | null;
        authMethod?: string | null;
        password?: string | null;
        privateKey?: string | null;
        passphrase?: string | null;
    } | null,
    tls?: TlsWithSecrets | null,
) {
    const options = parseConnectionOptions(rawOptions) ?? {};

    if (typeof ports.httpPort === 'number') {
        (options as any).httpPort = ports.httpPort;
    }

    applyQueryRequestTimeout(options);

    if (ssh?.enabled) {
        (options as any).ssh = {
            enabled: true,
            host: ssh.host ?? undefined,
            port: ssh.port ?? undefined,
            username: ssh.username ?? undefined,
            authMethod: ssh.authMethod ?? undefined,
            password: ssh.password ?? undefined,
            privateKey: ssh.privateKey ?? undefined,
            passphrase: ssh.passphrase ?? undefined,
        };
    }

    if (tls?.mode && tls.mode !== 'disable') {
        (options as any).tls = {
            mode: tls.mode,
            caCertificatePath: tls.caCertificatePath ?? undefined,
            clientCertificatePath: tls.clientCertificatePath ?? undefined,
            clientPrivateKeyPath: tls.clientPrivateKeyPath ?? undefined,
            serverName: tls.serverName ?? undefined,
            ciphers: tls.ciphers ?? undefined,
            minVersion: tls.minVersion ?? undefined,
            maxVersion: tls.maxVersion ?? undefined,
            caCertificateContent: tls.caCertificateContent ?? undefined,
            clientCertificateContent: tls.clientCertificateContent ?? undefined,
            clientPrivateKeyContent: tls.clientPrivateKeyContent ?? undefined,
            clientPrivateKeyPassphrase: tls.clientPrivateKeyPassphrase ?? undefined,
        };
    }

    return options;
}

export function buildStoredConnectionConfig(
    connection: StoredDriverConnection,
    identity: IdentityWithPassword,
    ssh?: SshWithSecrets | null,
    tls?: TlsWithSecrets | null,
    createError: ErrorFactory = defaultErrorFactory,
    resolveStoredPath: DriverPathResolver = path => path?.trim() || undefined,
): DriverConfig {
    const type = resolveConnectionType(connection.type ?? connection.engine ?? 'clickhouse');

    if (type === 'sqlite' || type === 'duckdb') {
        const options = parseConnectionOptions(connection.options) ?? {};
        const isMotherDuck = type === 'duckdb' && options.mode === 'motherduck';
        const isDuckDb = type === 'duckdb';
        const normalizedPath = isMotherDuck ? undefined : resolveStoredPath(connection.path);
        if (!normalizedPath) {
            if (!isMotherDuck) {
                throw createError('missing_path');
            }
        }
        if (isMotherDuck && !identity.password?.trim()) {
            throw createError('missing_password');
        }

        return {
            id: connection.id,
            type,
            host: '',
            path: normalizedPath,
            database: isDuckDb ? (identity.database ?? connection.database ?? undefined) : (identity.database ?? connection.database ?? 'main'),
            password: isMotherDuck ? (identity.password ?? undefined) : undefined,
            options,
            configVersion: connection.configVersion ?? undefined,
            updatedAt: connection.updatedAt instanceof Date ? connection.updatedAt.getTime() : (connection.updatedAt ?? undefined),
        };
    }

    if (!connection?.host) {
        throw createError('missing_host');
    }
    if (!identity?.username) {
        throw createError('missing_username');
    }

    const options = buildOptions(connection.options, { httpPort: connection.httpPort, port: connection.port }, ssh, tls);
    const database = identity.database ?? (connection as any).database ?? undefined;
    const port = typeof connection.httpPort === 'number' ? connection.httpPort : connection.port;
    const updatedAt = connection.updatedAt instanceof Date ? connection.updatedAt.getTime() : connection.updatedAt;

    return {
        id: connection.id,
        type,
        host: connection.host,
        port: port ?? undefined,
        username: identity.username,
        password: identity.password ?? undefined,
        database: database ?? undefined,
        options: Object.keys(options).length ? options : undefined,
        configVersion: connection.configVersion ?? undefined,
        updatedAt: updatedAt ?? undefined,
    };
}

export function buildTestConnectionConfig(
    payload: TestDriverConnectionPayload & { ssh?: TestSshWithSecrets | null },
    createError: ErrorFactory = defaultErrorFactory,
    resolveStoredPath: DriverPathResolver = path => path?.trim() || undefined,
): DriverConfig {
    const { connection, ssh, tls, identity } = payload;
    const type = resolveConnectionType(connection.type ?? connection.engine ?? 'clickhouse');

    if (type === 'sqlite' || type === 'duckdb') {
        const options = parseConnectionOptions(connection.options) ?? {};
        const isMotherDuck = type === 'duckdb' && options.mode === 'motherduck';
        const isDuckDb = type === 'duckdb';
        const normalizedPath = isMotherDuck ? undefined : resolveStoredPath(connection.path);
        if (!normalizedPath) {
            if (!isMotherDuck) {
                throw createError('missing_path');
            }
        }
        if (isMotherDuck && !identity.password?.trim()) {
            throw createError('missing_password');
        }

        return {
            id: connection.id || connection.name ? `test-${connection.id ?? connection.name}` : `test-${type}`,
            type,
            host: '',
            path: normalizedPath,
            database: isDuckDb ? (connection.database ?? undefined) : (connection.database ?? 'main'),
            password: isMotherDuck ? (identity.password ?? undefined) : undefined,
            options,
        };
    }

    if (!connection?.host) {
        throw createError('missing_host');
    }
    if (!identity) {
        throw createError('missing_identity_info');
    }
    if (!identity.username) {
        throw createError('missing_username');
    }

    const options = buildOptions(connection.options, { httpPort: connection.httpPort, port: connection.port }, ssh, tls as TlsWithSecrets | null);
    const database = identity.database ?? connection.database ?? undefined;
    const id = connection.name ? `test-${connection.name}` : `test-${connection.host}`;

    return {
        id,
        type,
        host: connection.host,
        port: connection.port ?? undefined,
        username: identity.username,
        password: identity.password ?? undefined,
        database,
        options: Object.keys(options).length ? options : undefined,
    };
}
