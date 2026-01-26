import { UnsupportedTypeError } from '@/lib/connection/base/errors';
import { BaseConfig, HealthInfo } from '@/lib/connection/base/types';
import { createProvider } from '@/lib/connection/factory';
import { getDBService } from '@/lib/database';
import { TestConnectionPayload } from '@/types/connections';
import { CONNECTION_ERROR_CODES, createConnectionError } from '@/app/api/connection/utils';


function parseOptions(raw?: unknown): Record<string, unknown> | undefined {
    if (!raw) return undefined;

    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            // ignore
        }
    }

    return undefined;
}


type IdentityInput = TestConnectionPayload['identity'] extends (infer T)[] ? T : never;
type IdentityWithFlags = IdentityInput & {
    markedForDeletion?: boolean;
    database?: string | null;
};

type SSHConfigWithSecrets = NonNullable<TestConnectionPayload['ssh']> & {
    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
};

type DBServiceInstance = Awaited<ReturnType<typeof getDBService>>;

type TestConnectMessages = {
    missingIdentityPassword: string;
};

function hasSshSecret(ssh?: SSHConfigWithSecrets | null): boolean {
    if (!ssh) return false;
    const { password, privateKey, passphrase } = ssh;
    const values = [password, privateKey, passphrase].filter(val => typeof val === 'string' && val.trim() !== '');
    return values.length > 0;
}


function buildConnectionConfig(payload: TestConnectionPayload & { ssh?: SSHConfigWithSecrets | null }): BaseConfig {
    const { connection, ssh, identity, timeout } = payload;
    const sshConfig = ssh as SSHConfigWithSecrets | null;

    if (!connection?.host) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingHost);
    }

    if (!identity) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingIdentityInfo);
    }
    if (!identity.username) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingUsername);
    }

    
    const options = parseOptions(connection.options) ?? {};

    
    if (typeof connection.httpPort === 'number') {
        (options as any).httpPort = connection.httpPort;
    }

    
    if (timeout && Number.isFinite(timeout)) {
        (options as any).request_timeout = timeout;
        (options as any).connectTimeout = timeout;
    }

    
    if (sshConfig?.enabled) {
        (options as any).ssh = {
            enabled: true,
            host: sshConfig.host,
            port: sshConfig.port,
            username: sshConfig.username,
            authMethod: sshConfig.authMethod,
            password: sshConfig.password ?? undefined,
            privateKey: sshConfig.privateKey ?? undefined,
            passphrase: sshConfig.passphrase ?? undefined,
        };
    }

    
    const rawType = connection.engine ?? connection.type ?? 'clickhouse';
    const type = typeof rawType === 'string' ? (rawType.toLowerCase() as BaseConfig['type']) : 'clickhouse';

    if (type !== 'clickhouse') {
        throw new UnsupportedTypeError(String(rawType));
    }

    const identityDb = identity.database;
    const database = identityDb ?? undefined;

    const id = connection.name ? `test-${connection.name}` : `test-${connection.host}`;

    const config: BaseConfig = {
        id,
        type,
        host: connection.host,
        port: connection.port,
        username: identity.username,
        
        password: identity.password ?? undefined,
        database,
        options: Object.keys(options).length ? options : undefined,
    };

    return config;
}


export async function testConnectService(payload: TestConnectionPayload, messages?: TestConnectMessages): Promise<HealthInfo> {
    const db = await getDBService();
    const connectionId = payload.connection?.id;
    const startedAt = Date.now();
    const plainPassword = await db.connections.getIdentityPlainPassword(payload.identity.id);

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
    if (!payload?.identity?.password && !plainPassword) {
        await recordLastCheck('ok', messages?.missingIdentityPassword ?? 'Missing identity password');
        throw createConnectionError(CONNECTION_ERROR_CODES.missingPassword);
    }
    const resolvedSsh = await resolveSshSecrets(payload, db);
    const config = buildConnectionConfig({ ...payload, identity: { ...payload.identity, password: testPassword }, ssh: resolvedSsh });
    const provider = await createProvider(config);

    try {
        const result = await provider.ping();
        const tookMs = typeof result?.tookMs === 'number' ? result.tookMs : Date.now() - startedAt;
        await recordLastCheck('ok', null, tookMs);
        return result;
    } catch (error) {
        const message = error instanceof Error && error.message ? error.message : 'test connection failed';
        const tookMs = Date.now() - startedAt;
        await recordLastCheck('error', message, tookMs);
        throw error;
    } finally {
        await provider.close().catch(err => {
            console.error('[connection] failed to close test datasource', err);
        });
    }
}

async function resolveSshSecrets(payload: TestConnectionPayload, db: DBServiceInstance): Promise<SSHConfigWithSecrets | null> {
    const ssh = payload.ssh as SSHConfigWithSecrets | null;

    if (!ssh?.enabled) {
        return ssh ?? null;
    }

    const resolved: SSHConfigWithSecrets = { ...ssh };

    if (!hasSshSecret(resolved) && payload.connection?.id) {
        const stored = await db.connections.getSshPlainSecrets(payload.connection.id);
        if (stored) {
            resolved.password = stored.password ?? undefined;
            resolved.privateKey = stored.privateKey ?? undefined;
            resolved.passphrase = stored.passphrase ?? undefined;
        }
    }

    if (resolved.authMethod === 'password' && !resolved.password) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingSshPassword);
    }
    if (resolved.authMethod === 'private_key' && !resolved.privateKey) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingSshPrivateKey);
    }

    return resolved;
}
