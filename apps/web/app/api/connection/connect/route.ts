import { NextRequest, NextResponse } from 'next/server';
import '@/lib/drivers/register-database-drivers';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import type { ConnectionSsh } from '@dory/shared/types/connections';
import { UnsupportedTypeError } from '@dory/drivers/core';
import { BaseConfig } from '@dory/drivers/types';
import { CONNECTION_REQUEST_TIMEOUT_MS, withConnectionTimeout } from '@dory/drivers/core';
import { destroyDriverPool, ensureDriverPool, getDriverPool } from '@dory/drivers/core';
import { pickConnectionIdentity } from '@dory/drivers/config';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { CONNECTION_ERROR_CODES, type ConnectionErrorCode, createConnectionError, getConnectionErrorCode } from '@/lib/connection/utils';
import { buildStoredConnectionConfig } from '@/lib/connection/config';

export const runtime = 'nodejs';

type SshWithSecrets = ConnectionSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null };

async function ensurePoolWithLatest(config: BaseConfig) {
    const existing = await getDriverPool(config.id);
    const needRefresh =
        existing && ((config.configVersion && existing.config.configVersion !== config.configVersion) || (config.updatedAt && existing.config.updatedAt !== config.updatedAt));

    if (needRefresh) {
        await destroyDriverPool(config.id);
    }

    return ensureDriverPool(config);
}

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId }) => {
    const startedAt = Date.now();
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    let payload: any = null;
    try {
        payload = await req.json();
    } catch {
        // ignore, fall through with null payload
    }

    const connectionId: string | undefined = payload?.connectionId ?? payload?.id ?? payload?.connection?.id ?? undefined;
    const identityId: string | null = payload?.identityId ?? payload?.identity?.id ?? payload?.defaultIdentityId ?? null;

    if (!connectionId) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }), { status: 400 });
    }

    try {
        const record = await db.connections.getById(organizationId, connectionId);

        if (!record) {
            return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.NOT_FOUND, message: t('Api.Connection.Errors.NotFound') }), { status: 404 });
        }

        const identity = pickConnectionIdentity(record.identities, identityId);
        if (!identity) {
            return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingIdentity') }), { status: 400 });
        }

        const passwordFromPayload = payload?.identity?.password ?? payload?.password ?? null;
        const plainPassword = passwordFromPayload ?? (identity.id ? await db.connections.getIdentityPlainPassword(organizationId, identity.id) : null);

        const sshSecrets = await db.connections.getSshPlainSecrets(organizationId, record.connection.id);
        const sshConfig: SshWithSecrets | null = record.ssh ? { ...record.ssh, ...(sshSecrets ?? {}) } : sshSecrets ? ({ enabled: true, ...sshSecrets } as SshWithSecrets) : null;

        const config = buildStoredConnectionConfig(record.connection, { ...identity, password: plainPassword }, sshConfig, code =>
            createConnectionError(code as ConnectionErrorCode),
        );

        const { health } = await withConnectionTimeout(
            (async () => {
                const poolEntry = await ensurePoolWithLatest(config);
                const health = await poolEntry.instance.ping();
                return { poolEntry, health };
            })(),
            CONNECTION_REQUEST_TIMEOUT_MS,
        );
        const tookMs = typeof health?.tookMs === 'number' ? health.tookMs : Date.now() - startedAt;

        await db.connections.updateLastCheck(record.connection.id, {
            status: 'ok',
            tookMs,
            error: null,
            checkedAt: new Date(),
            organizationId,
        });

        return NextResponse.json(
            ResponseUtil.success({
                connectionId: config.id,
                identityId: identity.id ?? null,
                status: 'Connected',
                lastCheckStatus: 'ok',
                lastCheckAt: new Date().toISOString(),
                lastCheckLatencyMs: tookMs,
                lastCheckError: null,
            }),
        );
    } catch (error) {
        console.error('[connection] connect failed', error);

        if (error instanceof UnsupportedTypeError) {
            return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.ERROR, message: t('Api.Connection.Errors.UnsupportedType') }), { status: 400 });
        }

        const code = getConnectionErrorCode(error);
        const fallbackMessage = t('Api.Connection.Errors.ConnectFailed');
        const messageFromError = error instanceof Error && error.message ? error.message : null;
        const message =
            code === CONNECTION_ERROR_CODES.missingHost
                ? t('Api.Connection.Errors.MissingHost')
                : code === CONNECTION_ERROR_CODES.missingPath
                  ? t('Api.Connection.Errors.MissingPath')
                  : code === CONNECTION_ERROR_CODES.missingUsername
                    ? t('Api.Connection.Errors.MissingUsername')
                    : (messageFromError ?? fallbackMessage);

        if (connectionId) {
            const tookMs = Date.now() - startedAt;
            db.connections
                .updateLastCheck(connectionId, {
                    status: 'error',
                    tookMs,
                    error: message,
                    checkedAt: new Date(),
                    organizationId,
                })
                .catch(err => console.error('[connection] failed to record last check (connect)', err));
        }

        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.ERROR, message }), { status: 500 });
    }
});
