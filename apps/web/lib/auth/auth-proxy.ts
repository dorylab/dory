import 'server-only';

export function shouldProxyAuthRequest(): boolean {
    return false;
}

export function shouldProxyCloudRequest(): boolean {
    return false;
}

export function createAuthProxyHeaders(incoming: Headers, _baseUrl: string): Headers {
    return new Headers(incoming);
}

export async function proxyAuthRequest(req: Request): Promise<Response> {
    return new Response('AUTH_PROXY_UNAVAILABLE_IN_WEB_RUNTIME', {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}

export async function proxyCloudRequest(req: Request): Promise<Response> {
    return proxyAuthRequest(req);
}
