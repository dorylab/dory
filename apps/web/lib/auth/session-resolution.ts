export type ResolveDesktopSessionFallbacks<Session> = {
    getLocalSession: (headers: Headers) => Promise<Session | null>;
    getRecoveredSession: (headers: Headers) => Promise<Session | null>;
    getCloudSession: (headers: Headers, url: string | null) => Promise<Session | null>;
};

function normalizeSessionCookieHeader(headers: Headers): Headers {
    const next = new Headers(headers);
    const cookie = next.get('cookie');
    if (!cookie) return next;

    const parts = cookie
        .split(';')
        .map(part => part.trim())
        .filter(Boolean);
    const hasPlain = parts.some(part => part.startsWith('better-auth.session_token='));
    const hasSecure = parts.some(part => part.startsWith('__Secure-better-auth.session_token='));

    if (hasPlain && !hasSecure) {
        const plain = parts.find(part => part.startsWith('better-auth.session_token='));
        if (plain) {
            parts.push(plain.replace('better-auth.session_token=', '__Secure-better-auth.session_token='));
            next.set('cookie', parts.join('; '));
        }
    }

    return next;
}

export async function resolveDesktopSessionFromHeaders<Session>(options: {
    headers: Headers;
    url: string | null;
    fallbacks: ResolveDesktopSessionFallbacks<Session>;
}): Promise<Session | null> {
    const normalizedHeaders = normalizeSessionCookieHeader(options.headers);
    const localSession = await options.fallbacks.getLocalSession(normalizedHeaders);
    if (localSession) {
        return localSession;
    }

    const recoveredSession = await options.fallbacks.getRecoveredSession(normalizedHeaders);
    if (recoveredSession) {
        return recoveredSession;
    }

    return options.fallbacks.getCloudSession(normalizedHeaders, options.url);
}
