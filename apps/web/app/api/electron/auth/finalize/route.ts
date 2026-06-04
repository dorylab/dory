import { getAuth } from '@/lib/auth';
import { proxyAuthRequest, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { schema } from '@dory/database/schema';
import { getClient } from '@dory/database/postgres/client';
import type { PostgresDBClient } from '@dory/shared';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveCurrentOrganizationIdStrict } from '@/lib/auth/current-organization';
import { buildElectronTicketUser } from '@/lib/auth/migration-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEEP_LINK = 'dory://auth-complete';
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

function buildDeepLinkUrl(params: Record<string, string | undefined | null>) {
    const deepLinkUrl = new URL(DEEP_LINK);
    for (const [key, value] of Object.entries(params)) {
        if (value) {
            deepLinkUrl.searchParams.set(key, value);
        }
    }
    return deepLinkUrl.toString();
}

type FinalizePageCopy = {
    title: string;
    description: string;
    openApp: string;
    closePage: string;
    hint: string;
};

function getFinalizePageCopy(locale: Awaited<ReturnType<typeof getApiLocale>>): FinalizePageCopy {
    return {
        title: translateApi('Api.ElectronAuthFinalize.Title', undefined, locale),
        description: translateApi('Api.ElectronAuthFinalize.Description', undefined, locale),
        openApp: translateApi('Api.ElectronAuthFinalize.OpenApp', undefined, locale),
        closePage: translateApi('Api.ElectronAuthFinalize.ClosePage', undefined, locale),
        hint: translateApi('Api.ElectronAuthFinalize.Hint', undefined, locale),
    };
}

function createDeepLinkResponse(deepLinkUrl: string, copy: FinalizePageCopy) {
    return new NextResponse(
        `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${copy.title}</title>
          <style>
            :root {
              color-scheme: light;
            }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background: linear-gradient(180deg, #f7fafc 0%, #eef2f7 100%);
              color: #1f2937;
            }
            .card {
              width: min(560px, calc(100vw - 32px));
              background: #fff;
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              padding: 24px;
              box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
            }
            h1 {
              margin: 0 0 8px;
              font-size: 22px;
              line-height: 1.3;
            }
            p {
              margin: 0;
              line-height: 1.6;
              color: #4b5563;
            }
            .actions {
              margin-top: 18px;
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
            }
            a, button {
              border-radius: 10px;
              border: 1px solid #cbd5e1;
              background: #f8fafc;
              color: #0f172a;
              padding: 10px 14px;
              font-size: 14px;
              text-decoration: none;
              cursor: pointer;
            }
            a.primary {
              background: #0f172a;
              border-color: #0f172a;
              color: #fff;
            }
            .hint {
              margin-top: 14px;
              font-size: 13px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <main class="card">
            <h1>${copy.title}</h1>
            <p>${copy.description}</p>
            <div class="actions">
              <a id="open-link" class="primary" href=${JSON.stringify(deepLinkUrl)}>${copy.openApp}</a>
              <button id="close-btn" type="button">${copy.closePage}</button>
            </div>
            <p class="hint">${copy.hint}</p>
          </main>
          <script>
            const deepLinkUrl = ${JSON.stringify(deepLinkUrl)};
            const openLink = document.getElementById('open-link');
            const closeBtn = document.getElementById('close-btn');
            if (openLink) {
              openLink.setAttribute('href', deepLinkUrl);
            }
            if (closeBtn) {
              closeBtn.addEventListener('click', () => window.close());
            }

            // Trigger deep link after first paint so fallback UI is visible.
            setTimeout(() => {
              window.location.assign(deepLinkUrl);
            }, 200);
          </script>
        </body>
      </html>
    `,
        { headers: { 'Content-Type': 'text/html' } },
    );
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
    const copy = getFinalizePageCopy(locale);
    const error = url.searchParams.get('error');
    if (error) {
        const deepLinkUrl = buildDeepLinkUrl({
            error,
            error_description: url.searchParams.get('error_description') ?? undefined,
        });
        return createDeepLinkResponse(deepLinkUrl, copy);
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
    const deepLinkUrl = buildDeepLinkUrl({ ticket });

    return createDeepLinkResponse(deepLinkUrl, copy);
}
