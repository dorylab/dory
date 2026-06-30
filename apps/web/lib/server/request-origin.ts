function parseHttpOrigin(value: string | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.origin;
    } catch {
        return null;
    }
}

export function getForwardedHeaderValue(req: Request, name: string) {
    return req.headers.get(name)?.split(',')[0]?.trim() || null;
}

export function getExternalRequestOrigin(req: Request) {
    const configuredOrigin = parseHttpOrigin(process.env.BETTER_AUTH_URL);
    if (configuredOrigin) return configuredOrigin;

    return getWorkspaceRequestOrigin(req);
}

export function getWorkspaceRequestOrigin(req: Request) {
    const requestUrl = new URL(req.url);
    const host = getForwardedHeaderValue(req, 'x-forwarded-host') ?? getForwardedHeaderValue(req, 'host') ?? requestUrl.host;
    const protocol = getForwardedHeaderValue(req, 'x-forwarded-proto')?.replace(/:$/, '') ?? requestUrl.protocol.replace(/:$/, '');

    try {
        return new URL(`${protocol}://${host}`).origin;
    } catch {
        return requestUrl.origin;
    }
}

export function createExternalRequestUrl(req: Request, pathname: string) {
    return new URL(pathname, getExternalRequestOrigin(req)).toString();
}

export function createWorkspaceRequestUrl(req: Request, pathname: string) {
    return new URL(pathname, getWorkspaceRequestOrigin(req)).toString();
}
