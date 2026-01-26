import { NextResponse } from 'next/server';
import { getDBService } from '@/lib/database';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import type { ConnectionListIdentity, ConnectionListItem, ConnectionSsh } from '@/types/connections';
import { UnsupportedTypeError } from '@/lib/connection/base/errors';
import { BaseConfig } from '@/lib/connection/base/types';
import { getDatasourcePool, destroyDatasourcePool, ensureDatasourcePool } from '@/lib/connection/pool-store';

type IdentityWithPassword = ConnectionListIdentity & { password?: string | null };
type SshWithSecrets = ConnectionSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null };

export const CONNECTION_ERROR_CODES = {
    notFound: 'connection_not_found',
    missingHost: 'missing_host',
    missingUsername: 'missing_username',
    missingIdentity: 'missing_identity',
    missingPassword: 'missing_password',
    missingIdentityInfo: 'missing_identity_info',
    missingSshPassword: 'missing_ssh_password',
    missingSshPrivateKey: 'missing_ssh_private_key',
} as const;

export type ConnectionErrorCode = (typeof CONNECTION_ERROR_CODES)[keyof typeof CONNECTION_ERROR_CODES];

export function createConnectionError(code: ConnectionErrorCode) {
    const error = new Error(code) as Error & { code: ConnectionErrorCode };
    error.code = code;
    return error;
}

export function getConnectionErrorCode(error: unknown): ConnectionErrorCode | null {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'string') {
            return code as ConnectionErrorCode;
        }
    }

    if (error instanceof Error) {
        const message = error.message;
        if ((Object.values(CONNECTION_ERROR_CODES) as string[]).includes(message)) {
            return message as ConnectionErrorCode;
        }
    }

    return null;
}

export function parseNumber(val: unknown): number | undefined {
    if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
    if (typeof val === 'string' && val.trim() !== '') {
        const num = Number(val);
        return Number.isFinite(num) ? num : undefined;
    }
    return undefined;
}

export function normalizeOptions(raw: unknown): string | Record<string, unknown> | null {
    if (typeof raw === 'string' || raw === null || typeof raw === 'undefined') return raw as any;
    if (typeof raw === 'object') {
        try {
            return JSON.stringify(raw as Record<string, unknown>);
        } catch {
            return '{}';
        }
    }
    return null;
}

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

function buildConnectionConfig(connection: ConnectionListItem['connection'], identity: IdentityWithPassword, ssh?: SshWithSecrets | null): BaseConfig {
    if (!connection?.host) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingHost);
    }
    if (!identity?.username) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingUsername);
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

async function ensurePoolWithLatest(config: BaseConfig) {
    const existing = await getDatasourcePool(config.id);
    const needRefresh =
        existing &&
        ((config.configVersion && existing.config.configVersion !== config.configVersion) ||
            (config.updatedAt && existing.config.updatedAt !== config.updatedAt));

    if (needRefresh) {
        await destroyDatasourcePool(config.id);
    }

    return ensureDatasourcePool(config);
}

export async function ensureConnectionPoolForUser(userId: string, teamId: string, connectionId: string, identityId?: string | null) {
    const db = await getDBService();
    const record = await db.connections.getById(teamId, connectionId);

    if (!record) {
        throw createConnectionError(CONNECTION_ERROR_CODES.notFound);
    }

    const identity = pickIdentity(record.identities, identityId ?? null);
    if (!identity) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingIdentity);
    }

    const plainPassword = identity.id ? await db.connections.getIdentityPlainPassword(identity.id) : null;
    if (!plainPassword) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingPassword);
    }

    const sshSecrets = await db.connections.getSshPlainSecrets(record.connection.id);
    const sshConfig: SshWithSecrets | null = record.ssh
        ? { ...record.ssh, ...(sshSecrets ?? {}) }
        : sshSecrets
          ? ({ enabled: true, ...sshSecrets } as SshWithSecrets)
          : null;

    const config = buildConnectionConfig(record.connection, { ...identity, password: plainPassword }, sshConfig);
    const entry = await ensurePoolWithLatest(config);

    return { entry, config, identity };
}

export function mapConnectionErrorToResponse(
    error: unknown,
    messages: { notFound: string; missingHost: string; fallback: string },
) {
    const code = getConnectionErrorCode(error);

    if (code === CONNECTION_ERROR_CODES.notFound) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.NOT_FOUND, message: messages.notFound }), { status: 404 });
    }

    if (code === CONNECTION_ERROR_CODES.missingHost) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: messages.missingHost }), { status: 400 });
    }

    return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.ERROR, message: messages.fallback }), { status: 500 });
}

export function mapNamesToLabelValue(names: string[]) {
    return (names ?? []).map(name => ({ label: name, value: name }));
}
