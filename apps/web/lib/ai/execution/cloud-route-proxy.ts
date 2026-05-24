import 'server-only';

import type { NextRequest } from 'next/server';
import { USE_CLOUD_AI } from '@/app/config/app';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';

const FORWARDED_HEADERS = [
    'content-type',
    'cookie',
    'authorization',
    'x-connection-id',
    'accept-language',
    'origin',
    'referer',
    'user-agent',
];

function rewriteCookieHeaderForUpstream(value: string): string {
    const parts = value
        .split(';')
        .map(part => part.trim())
        .filter(Boolean);
    const hasPlainSessionToken = parts.some(part => part.startsWith('better-auth.session_token='));
    const hasSecureSessionToken = parts.some(part => part.startsWith('__Secure-better-auth.session_token='));

    const rewritten = [...parts];
    if (hasPlainSessionToken && !hasSecureSessionToken) {
        const plain = parts.find(part => part.startsWith('better-auth.session_token='));
        if (plain) {
            rewritten.push(plain.replace('better-auth.session_token=', '__Secure-better-auth.session_token='));
        }
    }

    return rewritten.join('; ');
}

export function buildCloudForwardHeaders(req: NextRequest, baseUrl?: string): Headers {
    const headers = new Headers();
    for (const key of FORWARDED_HEADERS) {
        const value = req.headers.get(key);
        if (value) headers.set(key, value);
    }

    headers.delete('host');
    headers.delete('connection');

    if (baseUrl) {
        const upstreamOrigin = new URL(baseUrl).origin;
        if (headers.has('origin')) headers.set('origin', upstreamOrigin);

        const referer = headers.get('referer');
        if (referer) {
            try {
                const u = new URL(referer);
                headers.set('referer', upstreamOrigin + u.pathname + u.search);
            } catch {
                headers.delete('referer');
            }
        }
    }

    const cookieHeader = headers.get('cookie');
    if (cookieHeader) {
        headers.set('cookie', rewriteCookieHeaderForUpstream(cookieHeader));
    }

    return headers;
}

export async function proxyAiRouteIfNeeded(
    req: NextRequest,
    pathname: string,
    options?: {
        body?: unknown;
    },
): Promise<Response | null> {
    if (!USE_CLOUD_AI) return null;

    const baseUrl = getCloudApiBaseUrl();
    if (!baseUrl) {
        return new Response('CLOUD_API_NOT_CONFIGURED', {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    let currentOrigin: string | null = null;
    try {
        currentOrigin = new URL(req.url).origin;
    } catch {
        currentOrigin = null;
    }

    const target = new URL(pathname, baseUrl);
    if (currentOrigin && target.origin === currentOrigin) {
        return new Response('CLOUD_API_URL_MUST_DIFFER_FROM_LOCAL_ORIGIN', {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    const method = req.method.toUpperCase();
    const shouldSendBody = method !== 'GET' && method !== 'HEAD';
    const body =
        !shouldSendBody
            ? undefined
            : options && 'body' in options
              ? JSON.stringify(options.body)
              : await req.text();

    const upstream = await fetch(target.toString(), {
        method,
        headers: buildCloudForwardHeaders(req, baseUrl),
        body,
    });

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}
