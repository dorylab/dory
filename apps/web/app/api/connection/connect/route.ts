import { NextRequest, NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import type { ConnectionListIdentity, ConnectionListItem, ConnectionSsh } from '@/types/connections';
import { UnsupportedTypeError } from '@/lib/connection/base/errors';
import { BaseConfig } from '@/lib/connection/base/types';
import { getDatasourcePool, destroyDatasourcePool, ensureDatasourcePool } from '@/lib/connection/pool-store';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { CONNECTION_ERROR_CODES, createConnectionError, getConnectionErrorCode } from '@/app/api/connection/utils';
export const runtime = 'nodejs';
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

function buildDatasourceConfig(
    connection: ConnectionListItem['connection'],
    identity: IdentityWithPassword,
    ssh?: SshWithSecrets | null,
): BaseConfig {
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

export const POST = withUserAndTeamHandler(async ({ req, db, teamId }) => {
    const startedAt = Date.now();
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    let payload: any = null;
    try {
        payload = await req.json();
    } catch {
        // ignore, fall through with null payload
    }

    const connectionId: string | undefined =
        payload?.connectionId ?? payload?.id ?? payload?.connection?.id ?? undefined;
    const identityId: string | null =
        payload?.identityId ?? payload?.identity?.id ?? payload?.defaultIdentityId ?? null;

    if (!connectionId) {
        return NextResponse.json(
            ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
            { status: 400 },
        );
    }

    try {
        const record = await db.connections.getById(teamId, connectionId);

        if (!record) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.NOT_FOUND, message: t('Api.Connection.Errors.NotFound') }),
                { status: 404 },
            );
        }

        const identity = pickIdentity(record.identities, identityId);
        if (!identity) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingIdentity') }),
                { status: 400 },
            );
        }

        const passwordFromPayload = payload?.identity?.password ?? payload?.password ?? null;
        const plainPassword =
            passwordFromPayload ?? (identity.id ? await db.connections.getIdentityPlainPassword(identity.id) : null);

        if (!plainPassword) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingPassword') }),
                { status: 400 },
            );
        }

        const sshSecrets = await db.connections.getSshPlainSecrets(record.connection.id);
        const sshConfig: SshWithSecrets | null = record.ssh
            ? { ...record.ssh, ...(sshSecrets ?? {}) }
            : sshSecrets
              ? ({ enabled: true, ...sshSecrets } as SshWithSecrets)
              : null;

        const config = buildDatasourceConfig(record.connection, { ...identity, password: plainPassword }, sshConfig);

        const poolEntry = await ensurePoolWithLatest(config);
        const health = await poolEntry.instance.ping();
        const tookMs = typeof health?.tookMs === 'number' ? health.tookMs : Date.now() - startedAt;

        await db.connections.updateLastCheck(record.connection.id, {
            status: 'ok',
            tookMs,
            error: null,
            checkedAt: new Date(),
            teamId,
        });

        return NextResponse.json(
            ResponseUtil.success({
                connectionId: config.id,
                identityId: identity.id ?? null,
                status: 'Connected',
            }),
        );
    } catch (error) {
        console.error('[connection] connect failed', error);

        if (error instanceof UnsupportedTypeError) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.ERROR, message: t('Api.Connection.Errors.UnsupportedType') }),
                { status: 400 },
            );
        }

        const code = getConnectionErrorCode(error);
        const fallbackMessage = t('Api.Connection.Errors.ConnectFailed');
        const messageFromError = error instanceof Error && error.message ? error.message : null;
        const message =
            code === CONNECTION_ERROR_CODES.missingHost
                ? t('Api.Connection.Errors.MissingHost')
                : code === CONNECTION_ERROR_CODES.missingUsername
                  ? t('Api.Connection.Errors.MissingUsername')
                  : messageFromError ?? fallbackMessage;

        if (connectionId) {
            const tookMs = Date.now() - startedAt;
            db.connections
                .updateLastCheck(connectionId, {
                    status: 'error',
                    tookMs,
                    error: message,
                    checkedAt: new Date(),
                    teamId,
                })
                .catch(err => console.error('[connection] failed to record last check (connect)', err));
        }

        return NextResponse.json(
            ResponseUtil.error({ code: ErrorCodes.ERROR, message }),
            { status: 500 },
        );
    }
});
