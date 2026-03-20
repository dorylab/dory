import { NextResponse } from 'next/server';
import { getDBService } from '@/lib/database';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import type { ConnectionSsh } from '@/types/connections';
import { BaseConfig } from '@/lib/connection/base/types';
import { getDatasourcePool, destroyDatasourcePool, ensureDatasourcePool } from '@/lib/connection/pool-store';
import { buildStoredConnectionConfig, pickConnectionIdentity } from '@/lib/connection/config-builder';

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

export async function ensureConnectionPoolForUser(userId: string, organizationId: string, connectionId: string, identityId?: string | null) {
    const db = await getDBService();
    const record = await db.connections.getById(organizationId, connectionId);

    if (!record) {
        throw createConnectionError(CONNECTION_ERROR_CODES.notFound);
    }

    const identity = pickConnectionIdentity(record.identities, identityId ?? null);
    if (!identity) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingIdentity);
    }

    const plainPassword = identity.id ? await db.connections.getIdentityPlainPassword(organizationId, identity.id) : null;

    const sshSecrets = await db.connections.getSshPlainSecrets(organizationId, record.connection.id);
    const sshConfig: SshWithSecrets | null = record.ssh
        ? { ...record.ssh, ...(sshSecrets ?? {}) }
        : sshSecrets
          ? ({ enabled: true, ...sshSecrets } as SshWithSecrets)
          : null;

    const config = buildStoredConnectionConfig(
        record.connection,
        { ...identity, password: plainPassword },
        sshConfig,
        code => createConnectionError(code as ConnectionErrorCode),
    );
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
