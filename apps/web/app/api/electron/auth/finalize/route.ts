import { getAuth } from '@/lib/auth';
import { proxyAuthRequest, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { schema } from '@dory/database/schema';
import { getClient } from '@dory/database/postgres/client';
import type { PostgresDBClient } from '@dory/shared';
import { buildElectronAuthDeepLinkUrl, createElectronAuthFinalizeResponse, getElectronAuthFinalizePageCopy } from '@/app/api/electron/auth/finalize-page';
import { getApiLocale } from '@/app/api/utils/i18n';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveCurrentOrganizationIdStrict } from '@/lib/auth/current-organization';
import { buildElectronTicketUser } from '@/lib/auth/migration-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TICKET_TTL_MS = 5 * 60 * 1000;

type TicketUser = {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    activeOrganizationId?: string | null;
};

type DebugSessionUser = {
    isAnonymous?: unknown;
};

type DebugSession = {
    activeOrganizationId?: unknown;
};

function normalizeCookieName(name: string): string[] {
    const baseName = name.replace(/^__Secure-/, '').replace(/^__Host-/, '');
    return Array.from(new Set([baseName, `__Secure-${baseName}`, `__Host-${baseName}`]));
}

function listRequestCookieNames(req: Request): string[] {
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader) return [];

    return cookieHeader
        .split(';')
        .map(part => part.split('=')[0]?.trim())
        .filter((name): name is string => Boolean(name));
}

function getSetCookies(headers: Headers): string[] {
    const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === 'function') {
        return anyHeaders.getSetCookie();
    }

    const raw = headers.get('set-cookie');
    if (!raw) return [];
    return [raw];
}

function readCookieValueFromSetCookie(setCookie: string, name: string): string | null {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = setCookie.match(new RegExp(`^${escapedName}=([^;]+)`));
    return match?.[1] ?? null;
}

function extractSessionCookieFromSetCookieHeaders(headers: Headers, cookieName: string): { name: string; value: string } | null {
    const cookieNames = normalizeCookieName(cookieName);
    for (const cookie of getSetCookies(headers)) {
        for (const name of cookieNames) {
            const value = readCookieValueFromSetCookie(cookie, name);
            if (value) return { name, value };
        }
    }
    return null;
}

async function getSessionFromFinalizeRequest(auth: Awaited<ReturnType<typeof getAuth>>, req: Request, url: URL) {
    const provider = url.searchParams.get('provider') === 'google' ? 'google' : 'github';
    const hasOAuthCallbackParams = Boolean(url.searchParams.get('code') && url.searchParams.get('state'));

    if (hasOAuthCallbackParams) {
        const response = await auth.api.callbackOAuth({
            headers: req.headers,
            params: { id: provider },
            query: Object.fromEntries(url.searchParams),
            asResponse: true,
        });

        const ctx = await auth.$context;
        const sessionCookie = extractSessionCookieFromSetCookieHeaders(response.headers ?? new Headers(), ctx.authCookies.sessionToken.name);
        if (!sessionCookie) {
            return null;
        }

        const headers = new Headers(req.headers);
        const existingCookie = headers.get('cookie');
        const sessionCookiePair = `${sessionCookie.name}=${sessionCookie.value}`;
        headers.set('cookie', existingCookie ? `${existingCookie}; ${sessionCookiePair}` : sessionCookiePair);

        return auth.api.getSession({ headers }).catch(() => null);
    }

    return auth.api.getSession({ headers: req.headers }).catch(() => null);
}

async function createTicket(auth: Awaited<ReturnType<typeof getAuth>>, payload: { user: TicketUser }) {
    const ctx = await auth.$context;
    const ticket = `electron-${randomUUID()}`;
    const verification = await ctx.internalAdapter.createVerificationValue({
        value: JSON.stringify(payload),
        identifier: ticket,
        expiresAt: new Date(Date.now() + TICKET_TTL_MS),
    });

    if (!verification) {
        throw new Error('failed_to_create_ticket');
    }

    return ticket;
}

export async function GET(req: Request) {
    if (shouldProxyAuthRequest()) {
        const url = new URL(req.url);
        console.log('[electron-auth][finalize] proxying callback', {
            hasCode: Boolean(url.searchParams.get('code')),
            hasState: Boolean(url.searchParams.get('state')),
            provider: url.searchParams.get('provider') ?? null,
        });
        return proxyAuthRequest(req);
    }

    const url = new URL(req.url);
    const locale = await getApiLocale();
    const copy = getElectronAuthFinalizePageCopy(locale);
    const error = url.searchParams.get('error');
    if (error) {
        const deepLinkUrl = buildElectronAuthDeepLinkUrl({
            error,
            error_description: url.searchParams.get('error_description') ?? undefined,
        });
        return createElectronAuthFinalizeResponse(req, deepLinkUrl, copy);
    }

    const auth = await getAuth();
    const ctx = await auth.$context;
    console.log('[electron-auth][finalize] request summary', {
        hasCode: Boolean(url.searchParams.get('code')),
        hasState: Boolean(url.searchParams.get('state')),
        cookieNames: listRequestCookieNames(req),
        sessionCookieName: ctx.authCookies.sessionToken.name,
    });

    const activeSession = await getSessionFromFinalizeRequest(auth, req, url);
    console.log('[electron-auth][finalize] active session resolved', {
        userId: activeSession?.user?.id ?? null,
        email: activeSession?.user?.email ?? null,
        isAnonymous: activeSession?.user && 'isAnonymous' in activeSession.user ? (activeSession.user as DebugSessionUser).isAnonymous : null,
        activeOrganizationId:
            activeSession?.session && 'activeOrganizationId' in activeSession.session ? ((activeSession.session as DebugSession).activeOrganizationId ?? null) : null,
    });
    if (!activeSession?.session?.token) {
        return NextResponse.json({ error: 'missing_session_cookie' }, { status: 401 });
    }

    const session = await ctx.internalAdapter.findSession(activeSession.session.token);
    if (!session) {
        return NextResponse.json({ error: 'missing_session' }, { status: 401 });
    }

    const db = (await getClient()) as PostgresDBClient;
    const [dbUser] = await db.select().from(schema.user).where(eq(schema.user.id, session.user.id));
    const activeOrganizationId = resolveCurrentOrganizationIdStrict(activeSession);
    const user = buildElectronTicketUser({
        id: dbUser?.id ?? session.user.id,
        email: dbUser?.email ?? session.user.email ?? null,
        name: dbUser?.name ?? session.user.name ?? null,
        image: dbUser?.image ?? session.user.image ?? null,
        emailVerified: dbUser?.emailVerified ?? session.user.emailVerified ?? false,
        activeOrganizationId,
    }) satisfies TicketUser;
    const ticket = await createTicket(auth, { user });
    const deepLinkUrl = buildElectronAuthDeepLinkUrl({ ticket });

    return createElectronAuthFinalizeResponse(req, deepLinkUrl, copy);
}
