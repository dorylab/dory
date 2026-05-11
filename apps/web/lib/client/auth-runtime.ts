import { isDesktopRuntime } from '@dory/shared/runtime';

function toAuthOrigin(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

export function getAuthBaseUrl(): string | null {
    const publicAuthUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_AUTH_URL?.trim() || '';
    const cloudUrl = process.env.NEXT_PUBLIC_DORY_CLOUD_API_URL?.trim() || '';

    if (isDesktopRuntime()) return null;
    return toAuthOrigin(publicAuthUrl) || toAuthOrigin(cloudUrl);
}

export function isAuthPath(pathname: string): boolean {
    return pathname.startsWith('/api/auth') || pathname.startsWith('/api/electron/auth');
}
