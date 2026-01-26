// Adapter fragment from lib/datasource/manager.ts

import type { BaseConfig } from './base/types';
import { decrypt } from '../utils/crypto';

function parseOptions(raw: any): Record<string, any> | undefined {
    if (!raw) return undefined;
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return undefined;
    }
}

export interface DatasourceConfigOverrides {
    host?: string | null;
    port?: number | string | null;
    httpPort?: number | null;
    database?: string | null;
    username?: string | null;
    password?: string | null;
    options?: Record<string, unknown> | null;
}

export async function toDatasourceConfig(record: any, overrides?: DatasourceConfigOverrides | null): Promise<BaseConfig> {
    const options = parseOptions(record.options) ?? {};

    // Decrypt primary password
    const password = record.password_encrypted ? await decrypt(record.password_encrypted) : undefined;

    // Build SSH sub-config (pass into options for driver)
    if (record.ssh_enabled) {
        options.ssh = {
            host: record.ssh_host,
            port: record.ssh_port,
            username: record.ssh_username,
            authMethod: record.ssh_auth_method, // 'password' | 'private_key' | 'agent'
            password: record.ssh_password_encrypted ? await decrypt(record.ssh_password_encrypted) : undefined,
            privateKey: record.ssh_private_key_encrypted ? await decrypt(record.ssh_private_key_encrypted) : undefined,
            passphrase: record.ssh_passphrase_encrypted ? await decrypt(record.ssh_passphrase_encrypted) : undefined,
            enabled: true,
        };
    }

    const mergedHost = overrides?.host ?? record.host ?? undefined;
    const mergedPort = overrides?.port ?? record.port ?? record.http_port ?? undefined;
    const mergedDatabase = overrides?.database ?? record.database ?? undefined;
    const mergedUsername = overrides?.username ?? record.username ?? undefined;
    const mergedPassword =
        typeof overrides?.password !== 'undefined' && overrides?.password !== null ? overrides.password : password;

    const mergedOptions = {
        ...options,
        ...(overrides?.options ?? {}),
    };

    if (overrides?.httpPort ?? record.http_port) {
        mergedOptions.httpPort = overrides?.httpPort ?? record.http_port ?? undefined;
    }

    const driverType = (record.engine_type ?? record.type) as BaseConfig['type'];

    if (!mergedOptions.originalType) {
        mergedOptions.originalType = record.type;
    }

    const host = mergedHost ?? '';

    return {
        id: record.id,
        type: driverType,
        host,
        port: mergedPort ?? undefined,
        username: mergedUsername,
        password: mergedPassword,
        database: mergedDatabase,
        options: mergedOptions,
        configVersion: record.config_version ?? undefined,
        updatedAt: record.updated_at ?? undefined,
    };
}
