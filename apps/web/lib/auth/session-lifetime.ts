import { DORY_DESKTOP_PROTOCOL_HEADER, normalizeRequestedDesktopProtocolScheme } from './desktop-protocol';

const DAY_SECONDS = 60 * 60 * 24;

export const WEB_SESSION_TTL_SECONDS = 30 * DAY_SECONDS;
export const SESSION_REFRESH_AGE_SECONDS = DAY_SECONDS;
// Chromium clamps persistent cookies to 400 days. Desktop refreshes this cookie
// during every session check while the server-side session itself does not expire.
export const DESKTOP_SESSION_COOKIE_TTL_SECONDS = 400 * DAY_SECONDS;
export const PERMANENT_SESSION_EXPIRES_AT = '9999-12-31T23:59:59.999Z';

export function isDesktopAuthRequest(headers?: Headers | null): boolean {
    return Boolean(normalizeRequestedDesktopProtocolScheme(headers?.get(DORY_DESKTOP_PROTOCOL_HEADER)));
}

export function resolveSessionLifetime(options: { desktop: boolean; now?: number }) {
    if (options.desktop) {
        return {
            cookieMaxAgeSeconds: DESKTOP_SESSION_COOKIE_TTL_SECONDS,
            expiresAt: new Date(PERMANENT_SESSION_EXPIRES_AT),
        };
    }

    const now = options.now ?? Date.now();
    return {
        cookieMaxAgeSeconds: WEB_SESSION_TTL_SECONDS,
        expiresAt: new Date(now + WEB_SESSION_TTL_SECONDS * 1000),
    };
}
