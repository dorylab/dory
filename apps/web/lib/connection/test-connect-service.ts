import { HealthInfo } from '@dory/drivers/types';
import '@/lib/drivers/register-database-drivers';

import { withConnectionTimeout } from '@dory/drivers/core';
import { createDriver } from '@dory/drivers/core';
import { getDBService } from '@dory/database';
import { TestConnectionPayload } from '@dory/shared/types/connections';
import { CONNECTION_ERROR_CODES, type ConnectionErrorCode, createConnectionError } from '@/lib/connection/utils';
import { buildTestConnectionConfig } from '@/lib/connection/config';
import { resolveTestIdentityPassword } from '@/lib/connection/secrets';

type SSHConfigWithSecrets = NonNullable<TestConnectionPayload['ssh']> & {
    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
};

type TLSConfigWithSecrets = NonNullable<TestConnectionPayload['tls']> & {
    caCertificateContent?: string | null;
    clientCertificateContent?: string | null;
    clientPrivateKeyContent?: string | null;
    clientPrivateKeyPassphrase?: string | null;
};

type DBServiceInstance = Awaited<ReturnType<typeof getDBService>>;

function hasSshSecret(ssh?: SSHConfigWithSecrets | null): boolean {
    if (!ssh) return false;
    const { password, privateKey, passphrase } = ssh;
    const values = [password, privateKey, passphrase].filter(val => typeof val === 'string' && val.trim() !== '');
    return values.length > 0;
}

function hasTlsSecret(tls?: TLSConfigWithSecrets | null): boolean {
    if (!tls) return false;
    const values = [tls.caCertificateContent, tls.clientCertificateContent, tls.clientPrivateKeyContent, tls.clientPrivateKeyPassphrase].filter(
        val => typeof val === 'string' && val.trim() !== '',
    );
    return values.length > 0;
}

export async function testConnectService(organizationId: string, payload: TestConnectionPayload): Promise<HealthInfo> {
    const db = await getDBService();
    const connectionId = payload.connection?.id;
    const startedAt = Date.now();
    const plainPassword = await db.connections.getIdentityPlainPassword(organizationId, payload.identity.id);

    const recordLastCheck = async (status: 'ok' | 'error', error?: string | null, tookMs?: number | null) => {
        if (!connectionId) return;
        try {
            await db.connections.updateLastCheck(connectionId, {
                status,
                tookMs: typeof tookMs === 'number' ? tookMs : null,
                error: error ?? null,
                checkedAt: new Date(),
            });
        } catch (e) {
            console.error('[connection] failed to record last check (test)', e);
        }
    };

    const testPassword = resolveTestIdentityPassword(payload?.identity?.password, plainPassword);
    const resolvedSsh = await resolveSshSecrets(organizationId, payload, db);
    const resolvedTls = await resolveTlsSecrets(organizationId, payload, db);
    const config = buildTestConnectionConfig({ ...payload, identity: { ...payload.identity, password: testPassword }, ssh: resolvedSsh, tls: resolvedTls }, code =>
        createConnectionError(code as ConnectionErrorCode),
    );
    let provider = null as Awaited<ReturnType<typeof createDriver>> | null;

    try {
        const result = await withConnectionTimeout(
            (async () => {
                provider = await createDriver(config);
                return provider.ping();
            })(),
            payload.timeout,
        );
        const tookMs = typeof result?.tookMs === 'number' ? result.tookMs : Date.now() - startedAt;
        await recordLastCheck('ok', null, tookMs);
        return result;
    } catch (error) {
        const message = error instanceof Error && error.message ? error.message : 'test connection failed';
        const tookMs = Date.now() - startedAt;
        await recordLastCheck('error', message, tookMs);
        throw error;
    } finally {
        if (provider) {
            await provider.close().catch(err => {
                console.error('[connection] failed to close test datasource', err);
            });
        }
    }
}

async function resolveTlsSecrets(organizationId: string, payload: TestConnectionPayload, db: DBServiceInstance): Promise<TLSConfigWithSecrets | null> {
    const tls = payload.tls as TLSConfigWithSecrets | null;

    if (!tls || !tls.mode || tls.mode === 'disable') {
        return tls ?? null;
    }

    const resolved: TLSConfigWithSecrets = { ...tls };
    if (!hasTlsSecret(resolved) && payload.connection?.id) {
        const stored = await db.connections.getTlsPlainSecrets(organizationId, payload.connection.id);
        if (stored) {
            resolved.caCertificateContent = stored.caCertificateContent ?? undefined;
            resolved.clientCertificateContent = stored.clientCertificateContent ?? undefined;
            resolved.clientPrivateKeyContent = stored.clientPrivateKeyContent ?? undefined;
            resolved.clientPrivateKeyPassphrase = stored.clientPrivateKeyPassphrase ?? undefined;
        }
    }

    return resolved;
}

async function resolveSshSecrets(organizationId: string, payload: TestConnectionPayload, db: DBServiceInstance): Promise<SSHConfigWithSecrets | null> {
    const ssh = payload.ssh as SSHConfigWithSecrets | null;

    if (!ssh?.enabled) {
        return ssh ?? null;
    }

    const resolved: SSHConfigWithSecrets = { ...ssh };

    if (!hasSshSecret(resolved) && payload.connection?.id) {
        const stored = await db.connections.getSshPlainSecrets(organizationId, payload.connection.id);
        if (stored) {
            resolved.password = stored.password ?? undefined;
            resolved.privateKey = stored.privateKey ?? undefined;
            resolved.passphrase = stored.passphrase ?? undefined;
        }
    }

    if (resolved.authMethod === 'private_key' && !resolved.privateKey) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingSshPrivateKey);
    }

    return resolved;
}
