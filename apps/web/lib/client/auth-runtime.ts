'use client';

import { isDesktopRuntime, normalizeRuntime } from '@dory/shared/runtime';
import { env } from 'next-runtime-env';

function readPublicEnv(...keys: string[]): string {
    for (const key of keys) {
        const value = env(key) ?? process.env[key];
        if (value?.trim()) return value.trim();
    }
    return '';
}

function toAuthOrigin(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

function isDesktopAuthRuntime(): boolean {
    if (isDesktopRuntime()) return true;
    if (normalizeRuntime(readPublicEnv('NEXT_PUBLIC_DORY_RUNTIME')) === 'desktop') return true;
    return typeof window !== 'undefined' && Boolean(window.authBridge?.openExternal);
}

export function getAuthBaseUrl(): string | null {
    const publicAuthUrl = readPublicEnv('NEXT_PUBLIC_BETTER_AUTH_URL', 'NEXT_PUBLIC_AUTH_URL');
    const cloudUrl = readPublicEnv('NEXT_PUBLIC_DORY_CLOUD_API_URL');

    if (isDesktopAuthRuntime()) return null;
    return toAuthOrigin(publicAuthUrl) || toAuthOrigin(cloudUrl);
}

export function getEmailVerificationCallbackURL(fallback: string): string {
    if (!isDesktopAuthRuntime()) return fallback;

    const cloudUrl = readPublicEnv('NEXT_PUBLIC_DORY_CLOUD_API_URL');
    const callbackOrigin = toAuthOrigin(cloudUrl) || (typeof window !== 'undefined' ? window.location.origin : null);
    if (!callbackOrigin) return fallback;

    return `${callbackOrigin}/api/electron/auth/finalize`;
}

export function isAuthPath(pathname: string): boolean {
    return pathname.startsWith('/api/auth') || pathname.startsWith('/api/electron/auth');
}
