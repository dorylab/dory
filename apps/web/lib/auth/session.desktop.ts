import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { cache } from 'react';
import { createSessionResolver } from '@dory/auth-core';

import { getAuth } from '../auth';
import { createAuthProxyHeaders, shouldProxyAuthRequest } from './auth-proxy.desktop';
import { readDesktopSessionRecoveryPayload, resolveDesktopRecoveredSession } from './desktop-session-recovery';
import { resolveDesktopSessionFromHeaders } from './session-resolution';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { getRuntimeForServer } from '@/lib/runtime/runtime';

const resolveSession = createSessionResolver({
    getAuth,
    shouldProxyAuthRequest,
    createAuthProxyHeaders,
    getCloudApiBaseUrl,
    getRuntime: getRuntimeForServer,
});

async function resolveSessionFromHeaders(reqHeaders: Headers, url: string | null) {
    return resolveDesktopSessionFromHeaders({
        headers: reqHeaders,
        url,
        fallbacks: {
            getLocalSession: async headers =>
                getAuth()
                    .then(auth =>
                        auth.api
                            .getSession({
                                headers,
                            })
                            .catch(() => null),
                    )
                    .catch(() => null),
            getRecoveredSession: async headers => {
                const recoveryPayload = await readDesktopSessionRecoveryPayload(headers);
                if (!recoveryPayload?.userId) {
                    return null;
                }

                return resolveDesktopRecoveredSession(headers);
            },
            getCloudSession: async headers =>
                resolveSession({
                    headers,
                    url,
                }),
        },
    });
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
