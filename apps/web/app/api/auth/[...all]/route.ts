// app/api/auth/[...all]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getAuth } from '@/lib/auth';
import { proxyAuthRequest, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { deleteAnonymousUserLocally } from '@/lib/auth/anonymous';
import { buildAnonymousDeleteResponse, isLocalAnonymousDeleteRequest } from '@/lib/auth/anonymous-delete';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';

function getSetCookies(headers: Headers): string[] {
    const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === 'function') {
        return anyHeaders.getSetCookie();
    }

    const raw = headers.get('set-cookie');
    if (!raw) return [];
    return [raw];
}

function rewriteSetCookie(value: string, isSecureRequest: boolean): string {
    const parts = value.split(';');
    const [nameValue, ...attrs] = parts;
    const normalizedAttrs = attrs.map(attr => attr.trim());
    const isClearingCookie =
        /=\s*$/.test(nameValue) ||
        normalizedAttrs.some(attr => /^max-age=0$/i.test(attr)) ||
        normalizedAttrs.some(attr => /^expires=/i.test(attr));

    let rewrittenNameValue = nameValue;
    if (!isSecureRequest && /^__Secure-/i.test(nameValue)) {
        // Avoid turning secure-cookie cleanup into non-secure cleanup on localhost/http.
        if (isClearingCookie) {
            return '';
        }
        rewrittenNameValue = nameValue.replace(/^__Secure-/i, '');
    }

    const rewritten = normalizedAttrs
        .filter(attr => !/^domain=/i.test(attr))
        .map(attr => {
            if (!isSecureRequest && /^secure$/i.test(attr)) {
                return '';
            }
            if (!isSecureRequest && /^samesite=none$/i.test(attr)) {
                return 'SameSite=Lax';
            }
            return attr;
        })
        .filter(Boolean);

    return [rewrittenNameValue, ...rewritten].join('; ');
}

function rewriteAuthResponse(req: Request, res: Response): Response {
    const isSecureRequest = new URL(req.url).protocol === 'https:';
    if (isSecureRequest) return res;

    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete('set-cookie');

    const setCookies = getSetCookies(res.headers)
        .map(cookie => rewriteSetCookie(cookie, isSecureRequest))
        .filter(Boolean);
    for (const cookie of setCookies) {
        responseHeaders.append('set-cookie', cookie);
    }

    return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
    });
}

export async function GET(req: Request) {
    if (shouldProxyAuthRequest()) {
        return proxyAuthRequest(req);
    }
    const auth = await getAuth();
    const res = await auth.handler(req);
    return rewriteAuthResponse(req, res);
}

export async function POST(req: Request) {
    if (shouldProxyAuthRequest()) {
        return proxyAuthRequest(req);
    }
    const auth = await getAuth();
    const pathname = new URL(req.url).pathname;

    if (isLocalAnonymousDeleteRequest(pathname)) {
        const session = await auth.api.getSession({
            headers: req.headers,
        });

        if (!session?.user?.id) {
            return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
        }

        if (!isAnonymousUser(session.user)) {
            return Response.json({ error: 'ANONYMOUS_SESSION_REQUIRED' }, { status: 403 });
        }

        await deleteAnonymousUserLocally(session.user.id);
        return buildAnonymousDeleteResponse(req);
    }

    const res = await auth.handler(req);
    return rewriteAuthResponse(req, res);
}
