import { getAuth } from '@/lib/auth';
import { proxyAuthRequest } from '@/lib/auth/auth-proxy';
import { isDesktopRuntime } from '@dory/shared/runtime';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSetCookies(headers: Headers): string[] {
    const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === 'function') {
        return anyHeaders.getSetCookie();
    }

    const raw = headers.get('set-cookie');
    if (!raw) return [];
    return raw
        .split(/,(?=\s*[^;,\s]+=)/)
        .map(value => value.trim())
        .filter(Boolean);
}

function rewriteSetCookie(value: string, isSecureRequest: boolean): string {
    const parts = value.split(';');
    const [nameValue, ...attrs] = parts;
    const normalizedAttrs = attrs.map(attr => attr.trim());
    const isClearingCookie = /=\s*$/.test(nameValue) || normalizedAttrs.some(attr => /^max-age=0$/i.test(attr)) || normalizedAttrs.some(attr => /^expires=/i.test(attr));

    let rewrittenNameValue = nameValue;
    if (!isSecureRequest && /^__Secure-/i.test(nameValue)) {
        if (isClearingCookie) {
            return '';
        }
        rewrittenNameValue = nameValue.replace(/^__Secure-/i, '');
    }

    const rewritten = normalizedAttrs
        .filter(attr => !/^domain=/i.test(attr))
        .map(attr => {
            if (!isSecureRequest && /^secure$/i.test(attr)) return '';
            if (!isSecureRequest && /^samesite=none$/i.test(attr)) return 'SameSite=Lax';
            return attr;
        })
        .filter(Boolean);

    return [rewrittenNameValue, ...rewritten].join('; ');
}

export async function POST(req: Request) {
    if (isDesktopRuntime()) {
        return proxyAuthRequest(req);
    }

    // Non-desktop runtime is the cloud/server side of this endpoint. Desktop
    // must never use this local auth branch; it proxies above and mirrors the
    // cloud session back into the local desktop runtime.
    const auth = await getAuth();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 });
    }

    const response = await auth.api.signInEmail({
        headers: req.headers,
        body: body as { email: string; password: string; callbackURL?: string },
        asResponse: true,
    });

    const payload = await response
        .clone()
        .json()
        .catch(() => null);
    const res = NextResponse.json(payload ?? { ok: response.ok }, { status: response.status });
    const isSecureRequest = new URL(req.url).protocol === 'https:';

    getSetCookies(response.headers)
        .map(cookie => rewriteSetCookie(cookie, isSecureRequest))
        .filter(Boolean)
        .forEach(cookie => {
            res.headers.append('set-cookie', cookie);
        });

    return res;
}
