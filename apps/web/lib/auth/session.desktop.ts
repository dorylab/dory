import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { cache } from 'react';
import { createSessionResolver } from '@dory/auth-core';

import { getAuth } from '../auth';
import { createAuthProxyHeaders, shouldProxyAuthRequest } from './auth-proxy.desktop';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { getRuntimeForServer } from '@dory/shared/runtime';

const resolveSession = createSessionResolver({
    getAuth,
    shouldProxyAuthRequest,
    createAuthProxyHeaders,
    getCloudApiBaseUrl,
    getRuntime: getRuntimeForServer,
});

async function resolveSessionFromHeaders(reqHeaders: Headers, url: string | null) {
    return resolveSession({
        headers: reqHeaders,
        url,
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
