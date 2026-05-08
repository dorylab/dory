// lib/auth/session.ts

import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { cache } from 'react';
import { createSessionResolver } from '@dory/auth-core';
import { getAuth } from '../auth';
import { createAuthProxyHeaders, shouldProxyAuthRequest } from './auth-proxy';
import { readDesktopSessionRecoveryPayload, resolveDesktopRecoveredSession } from './desktop-session-recovery';
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

async function resolveSessionFromHeaders(reqHeaders: Headers, url: string | null) {
    const normalizedHeaders = normalizeSessionCookieHeader(reqHeaders);

    if (shouldProxyAuthRequest()) {
        const recoveryPayload = await readDesktopSessionRecoveryPayload(normalizedHeaders);
        if (recoveryPayload?.userId) {
            const recoveredSession = await resolveDesktopRecoveredSession(normalizedHeaders);
            if (recoveredSession) {
                return recoveredSession;
            }
        }
    }

    const session = await resolveSession({
        headers: normalizedHeaders,
        url,
    });

    if (session || !shouldProxyAuthRequest()) {
        return session;
    }

    return resolveDesktopRecoveredSession(normalizedHeaders);
}

const getSessionFromCurrentRequest = cache(async () => {
    const reqHeaders = await headers();
    return resolveSessionFromHeaders(reqHeaders, null);
});

export async function getSessionFromRequest(req?: NextRequest) {
    if (req) {
        return resolveSessionFromHeaders(req.headers, req.url);
    }

    return getSessionFromCurrentRequest();
}
