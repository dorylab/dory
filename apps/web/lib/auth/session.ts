// lib/auth/session.ts

import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { getAuth } from '../auth';

export async function getSessionFromRequest(req?: NextRequest) {
    const auth = await getAuth();
    const reqHeaders = req ? req.headers : await headers();
    const session = await auth.api
        .getSession({
            headers: reqHeaders,
        })
        .catch(() => null);

    if (session) return session;

    const authorization = reqHeaders.get('authorization') ?? reqHeaders.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return null;
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) return null;

    const apiWithJwt = auth.api as typeof auth.api & {
        verifyJWT?: (context: { body: { token: string } }) => Promise<{ payload?: Record<string, unknown> }>;
    };

    if (!apiWithJwt.verifyJWT) return null;

    try {
        const result = await apiWithJwt.verifyJWT({
            body: { token },
        });
        const payload = result?.payload ?? null;
        if (!payload) return null;

        const userId = payload.sub ?? payload.id;
        if (!userId) return null;

        return {
            session: { token },
            user: {
                id: String(userId),
                name: typeof payload.name === 'string' ? payload.name : null,
                email: typeof payload.email === 'string' ? payload.email : null,
                emailVerified: Boolean(payload.emailVerified),
                image: typeof payload.image === 'string' ? payload.image : null,
                defaultTeamId: typeof payload.defaultTeamId === 'string' ? payload.defaultTeamId : null,
            },
        };
    } catch {
        return null;
    }
}
