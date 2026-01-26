import { getDBService } from '@/lib/database';
import { UnsupportedTypeError } from './base/errors';
import type { BaseConfig } from './base/types';
import { ensureDatasourcePool, getDatasourcePool, type DatasourcePoolEntry } from './pool-store';
import type { ConnectionListIdentity, ConnectionListItem, ConnectionSsh } from '@/types/connections';

type IdentityWithPassword = ConnectionListIdentity & { password?: string | null };
type SshWithSecrets = ConnectionSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null };

function parseOptions(raw: unknown): Record<string, unknown> | undefined {
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

function pickIdentity(list: ConnectionListIdentity[], targetId?: string | null): ConnectionListIdentity | null {
    if (!Array.isArray(list) || list.length === 0) return null;
    if (targetId) {
        const matched = list.find(item => item.id === targetId);
        if (matched) return matched;
    }
    const defaultOne = list.find(item => item.isDefault);
    if (defaultOne) return defaultOne;
    return list[0] ?? null;
}

function buildConnectionConfig(
    connection: ConnectionListItem['connection'],
    identity: IdentityWithPassword,
    ssh?: SshWithSecrets | null,
): BaseConfig {
    if (!connection?.host) {
        throw new Error('missing_host');
    }
    if (!identity?.username) {
        throw new Error('missing_username');
    }

    const options = parseOptions(connection.options) ?? {};

    if (typeof connection.httpPort === 'number') {
        (options as any).httpPort = connection.httpPort;
    }

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

    const rawType = connection.engine ?? connection.type ?? 'clickhouse';
    const type = (typeof rawType === 'string' ? rawType.toLowerCase() : rawType) as BaseConfig['type'];
    if (type !== 'clickhouse') {
        throw new UnsupportedTypeError(String(rawType));
    }

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

export async function getOrCreateConnectionPool(
    teamId: string,
    connectionId: string,
): Promise<DatasourcePoolEntry | undefined> {
    const existing = await getDatasourcePool(connectionId);
    if (existing) return existing;

    const db = await getDBService();
    const record = await db.connections.getById(teamId, connectionId);
    if (!record) return undefined;

    const identity = pickIdentity(record.identities, null);
    if (!identity) return undefined;

    const plainPassword = identity.id ? await db.connections.getIdentityPlainPassword(identity.id) : null;
    if (!plainPassword) return;

    const sshSecrets = await db.connections.getSshPlainSecrets(record.connection.id);
    const sshConfig: SshWithSecrets | null = record.ssh
        ? { ...record.ssh, ...(sshSecrets ?? {}) }
        : sshSecrets
          ? ({ enabled: true, ...sshSecrets } as SshWithSecrets)
          : null;

    const config = buildConnectionConfig(record.connection, { ...identity, password: plainPassword }, sshConfig);
    return ensureDatasourcePool(config);
}
