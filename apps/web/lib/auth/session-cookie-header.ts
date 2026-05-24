export function normalizeSessionCookieName(name: string): string[] {
    const baseName = name.replace(/^__Secure-/, '').replace(/^__Host-/, '');
    return Array.from(new Set([baseName, `__Secure-${baseName}`, `__Host-${baseName}`]));
}

export function buildCloudSessionLookupCookieHeader(input: { existingCookieHeader: string | null; sessionCookie: { name: string; value: string }; sessionCookieName: string }) {
    const sessionCookieNames = new Set([...normalizeSessionCookieName(input.sessionCookieName), ...normalizeSessionCookieName(input.sessionCookie.name)]);
    const existingCookies = (input.existingCookieHeader ?? '')
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .filter(cookie => {
            const separatorIndex = cookie.indexOf('=');
            if (separatorIndex <= 0) {
                return true;
            }
            return !sessionCookieNames.has(cookie.slice(0, separatorIndex));
        });

    const sessionCookies = Array.from(sessionCookieNames, name => `${name}=${input.sessionCookie.value}`);
    return [...existingCookies, ...sessionCookies].join('; ');
}
