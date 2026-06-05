const BETTER_AUTH_COOKIE_NAMES = [
    'better-auth.session_token',
    '__Secure-better-auth.session_token',
    'better-auth.session_data',
    '__Secure-better-auth.session_data',
    'better-auth.account_data',
    '__Secure-better-auth.account_data',
    'better-auth.dont_remember',
    '__Secure-better-auth.dont_remember',
    'better-auth.oauth_state',
    '__Secure-better-auth.oauth_state',
];

const BETTER_AUTH_CHUNK_PREFIXES = ['better-auth.session_data.', '__Secure-better-auth.session_data.', 'better-auth.account_data.', '__Secure-better-auth.account_data.'];

const DORY_DESKTOP_SESSION_COOKIE_NAME = 'dory.desktop_session_token';

function readRequestCookieNames(cookieHeader: string | null): string[] {
    if (!cookieHeader) return [];

    return cookieHeader
        .split(';')
        .map(cookie => cookie.trim())
        .filter(Boolean)
        .map(cookie => cookie.slice(0, cookie.indexOf('=') === -1 ? cookie.length : cookie.indexOf('=')))
        .filter(Boolean);
}

function isAuthCookieChunk(name: string): boolean {
    return BETTER_AUTH_CHUNK_PREFIXES.some(prefix => name.startsWith(prefix));
}

function uniqueCookieNames(names: string[]): string[] {
    return Array.from(new Set(names));
}

function buildExpiredCookie(name: string): string {
    const attrs = [`${name}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
    if (name.startsWith('__Secure-')) {
        attrs.push('Secure');
    }
    return attrs.join('; ');
}

export function getSessionCookieNamesToClear(cookieHeader?: string | null): string[] {
    const requestCookieNames = readRequestCookieNames(cookieHeader ?? null).filter(isAuthCookieChunk);

    return uniqueCookieNames([...BETTER_AUTH_COOKIE_NAMES, DORY_DESKTOP_SESSION_COOKIE_NAME, ...requestCookieNames]);
}

export function appendClearSessionCookieHeaders(headers: Headers, cookieHeader?: string | null) {
    for (const name of getSessionCookieNamesToClear(cookieHeader)) {
        headers.append('set-cookie', buildExpiredCookie(name));
    }
}
