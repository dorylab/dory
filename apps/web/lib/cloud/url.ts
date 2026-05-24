import { getRuntimeForServer, type DoryRuntime } from '@dory/shared/runtime';

const DEFAULT_DESKTOP_CLOUD_API_URL = 'https://app.getdory.dev/api';

function readEnvValue(env: Partial<Record<keyof NodeJS.ProcessEnv, string | undefined>>, name: keyof NodeJS.ProcessEnv): string | null {
    const value = env[name];
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    return trimmed || null;
}

function stripTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
}

function toCloudApiBaseUrl(value: string): string {
    const normalized = stripTrailingSlash(value);
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

export function resolveCloudApiBaseUrl(options: { env: Partial<Record<keyof NodeJS.ProcessEnv, string | undefined>>; runtime: DoryRuntime | null }): string | null {
    const explicitApiUrl = readEnvValue(options.env, 'DORY_CLOUD_API_URL') ?? readEnvValue(options.env, 'NEXT_PUBLIC_DORY_CLOUD_API_URL');
    if (explicitApiUrl) {
        return stripTrailingSlash(explicitApiUrl);
    }

    const legacyCloudUrl = readEnvValue(options.env, 'DORY_AI_CLOUD_URL');
    if (legacyCloudUrl) {
        return toCloudApiBaseUrl(legacyCloudUrl);
    }

    if (options.runtime === 'desktop') {
        return DEFAULT_DESKTOP_CLOUD_API_URL;
    }

    return null;
}

export function getCloudApiBaseUrl(): string | null {
    return resolveCloudApiBaseUrl({
        env: process.env,
        runtime: getRuntimeForServer(),
    });
}
