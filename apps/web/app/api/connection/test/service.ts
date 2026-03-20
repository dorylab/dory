import { HealthInfo } from '@/lib/connection/base/types';
import { withConnectionTimeout } from '@/lib/connection/defaults';
import { createProvider } from '@/lib/connection/factory';
import { getDBService } from '@/lib/database';
import { TestConnectionPayload } from '@/types/connections';
import { CONNECTION_ERROR_CODES, type ConnectionErrorCode, createConnectionError } from '@/app/api/connection/utils';
import { buildTestConnectionConfig } from '@/lib/connection/config-builder';

type SSHConfigWithSecrets = NonNullable<TestConnectionPayload['ssh']> & {
    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
};

type DBServiceInstance = Awaited<ReturnType<typeof getDBService>>;

function hasSshSecret(ssh?: SSHConfigWithSecrets | null): boolean {
    if (!ssh) return false;
    const { password, privateKey, passphrase } = ssh;
    const values = [password, privateKey, passphrase].filter(val => typeof val === 'string' && val.trim() !== '');
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

    const testPassword = payload?.identity?.password ?? plainPassword;
    const resolvedSsh = await resolveSshSecrets(organizationId, payload, db);
    const config = buildTestConnectionConfig(
        { ...payload, identity: { ...payload.identity, password: testPassword }, ssh: resolvedSsh },
        code => createConnectionError(code as ConnectionErrorCode),
    );
    let provider = null as Awaited<ReturnType<typeof createProvider>> | null;

    try {
        const result = await withConnectionTimeout(
            (async () => {
                provider = await createProvider(config);
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
