// lib/auth/session.ts

import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createSessionResolver } from '@dory/auth-core';
import { getAuth } from '../auth';
import { createAuthProxyHeaders, shouldProxyAuthRequest } from './auth-proxy';
import { resolveDesktopRecoveredSession } from './desktop-session-recovery';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { getRuntimeForServer } from '@/lib/runtime/runtime';

const resolveSession = createSessionResolver({
    getAuth,
    shouldProxyAuthRequest,
    createAuthProxyHeaders,
    getCloudApiBaseUrl,
    getRuntime: getRuntimeForServer,
});

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

export async function getSessionFromRequest(req?: NextRequest) {
    const reqHeaders = req ? req.headers : await headers();
    const normalizedHeaders = normalizeSessionCookieHeader(reqHeaders);
    const session = await resolveSession({
        headers: normalizedHeaders,
        url: req?.url ?? null,
    });

    if (session || !shouldProxyAuthRequest()) {
        return session;
    }

    return resolveDesktopRecoveredSession(normalizedHeaders);
}
