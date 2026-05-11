import { getAuth } from '@/lib/auth';
import { mirrorCloudSessionToDesktop } from '@/lib/auth/desktop-session-recovery';
import { buildSessionOrganizationPatch } from '@/lib/auth/migration-state';
import { linkAnonymousOrganizationToUser } from '@/lib/auth/anonymous-lifecycle/link';
import { serializeSignedCookie } from 'better-call';
import { proxyAuthRequest, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { getClient } from '@dory/database/postgres/client';
import { schema } from '@dory/database/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchemaWithAnonymous = z.object({
    ticket: z.string().min(1),
    anonymousUserId: z.string().optional().nullable(),
    anonymousActiveOrganizationId: z.string().optional().nullable(),
});

type TicketUser = {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    activeOrganizationId?: string | null;
};

async function consumeTicketLocally(params: {
    ticket: string;
    anonymousUserId?: string | null;
    anonymousActiveOrganizationId?: string | null;
}) {
    const auth = await getAuth();
    const ctx = await auth.$context;

    const verification = await ctx.internalAdapter.findVerificationValue(params.ticket);
    if (!verification) {
        return NextResponse.json({ error: 'invalid_ticket' }, { status: 401 });
    }

    if (verification.expiresAt < new Date()) {
        await ctx.internalAdapter.deleteVerificationByIdentifier(params.ticket);
        return NextResponse.json({ error: 'ticket_expired' }, { status: 401 });
    }

    let parsed: { user?: TicketUser } | null = null;
    try {
        parsed = JSON.parse(verification.value) as { user?: TicketUser };
    } catch {
        parsed = null;
    }

    const user = parsed?.user;
    if (!user?.id) {
        await ctx.internalAdapter.deleteVerificationByIdentifier(params.ticket);
        return NextResponse.json({ error: 'invalid_ticket_payload' }, { status: 400 });
    }

    await ctx.internalAdapter.deleteVerificationByIdentifier(params.ticket);

    const session = await ctx.internalAdapter.createSession(user.id, false);
    if (!session) {
        return NextResponse.json({ error: 'failed_to_create_session' }, { status: 500 });
    }

    const sessionPatch = buildSessionOrganizationPatch({
        activeOrganizationId: user.activeOrganizationId,
    });
    if (sessionPatch) {
        await ctx.internalAdapter.updateSession(session.token, sessionPatch);
    }

    if (params.anonymousUserId && params.anonymousUserId !== user.id) {
        await linkAnonymousUserLocally({
            anonymousUserId: params.anonymousUserId,
            anonymousActiveOrganizationId: params.anonymousActiveOrganizationId ?? null,
            newUserId: user.id,
            newActiveOrganizationId: user.activeOrganizationId ?? null,
            newSessionToken: session.token,
        });
    }

    const baseAttrs = ctx.authCookies.sessionToken.attributes ?? {};
    const maxAge = ctx.sessionConfig?.expiresIn;
    const cookieAttrs = {
        ...baseAttrs,
        ...(maxAge ? { maxAge } : {}),
    };
    const cookie = await serializeSignedCookie(
        ctx.authCookies.sessionToken.name,
        session.token,
        ctx.secret,
        cookieAttrs,
    );

    const res = NextResponse.json({ ok: true });
    res.headers.append('set-cookie', cookie);
    return res;
}

async function linkAnonymousUserLocally(params: {
    anonymousUserId: string;
    anonymousActiveOrganizationId: string | null;
    newUserId: string;
    newActiveOrganizationId: string | null;
    newSessionToken?: string | null;
}) {
    try {
        const db = await getClient();
        const [anonUser] = await db
            .select({ id: schema.user.id, isAnonymous: schema.user.isAnonymous })
            .from(schema.user)
            .where(eq(schema.user.id, params.anonymousUserId))
            .limit(1);

        if (!anonUser?.isAnonymous) {
            console.log('[electron-auth][consume] anonymous user not found or not anonymous locally, skipping link', {
                anonymousUserId: params.anonymousUserId,
            });
            return;
        }

        await linkAnonymousOrganizationToUser({
            anonymousUserId: params.anonymousUserId,
            anonymousActiveOrganizationId: params.anonymousActiveOrganizationId,
            newUserId: params.newUserId,
            newSessionToken: params.newSessionToken,
            newActiveOrganizationId: params.newActiveOrganizationId,
        });

        console.log('[electron-auth][consume] linked anonymous org locally', {
            anonymousUserId: params.anonymousUserId,
            newUserId: params.newUserId,
        });
    } catch (err) {
        console.error('[electron-auth][consume] failed to link anonymous org locally', err);
    }
}

export async function POST(req: Request) {
    if (shouldProxyAuthRequest()) {
        // Buffer the body as text first — reading it as JSON would consume the stream
        // and proxyAuthRequest would receive an empty body.
        const rawBodyText = await req.text().catch(() => '{}');
        let rawBody: unknown = {};
        try {
            rawBody = JSON.parse(rawBodyText);
        } catch {
            /* leave as {} */
        }

        const parsed = bodySchemaWithAnonymous.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 });
        }

        const { anonymousUserId, anonymousActiveOrganizationId } = parsed.data;

        console.log('[electron-auth][consume] proxying request', {
            hasAnonymousUserId: Boolean(anonymousUserId),
        });

        // Forward the original body text — cloud's Zod schema strips unknown fields.
        const proxyReq = new Request(req.url, {
            method: req.method,
            headers: req.headers,
            body: rawBodyText,
        });

        const response = await proxyAuthRequest(proxyReq);
        const mirror = response.ok ? await mirrorCloudSessionToDesktop(req, response.headers) : null;

        console.log('[electron-auth][consume] proxy response', {
            status: response.status,
            hasMirror: Boolean(mirror),
        });

        // Migrate local anonymous user's org/connections to the new user
        if (mirror && anonymousUserId && mirror.userId !== anonymousUserId) {
            await linkAnonymousUserLocally({
                anonymousUserId,
                anonymousActiveOrganizationId: anonymousActiveOrganizationId ?? null,
                newUserId: mirror.userId,
                newActiveOrganizationId: mirror.activeOrganizationId,
            });
        }

        if (!mirror) {
            return response;
        }

        const headers = new Headers(response.headers);
        headers.append('set-cookie', mirror.cookie);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }

    const body = bodySchemaWithAnonymous.parse(await req.json().catch(() => ({})));
    console.log('[electron-auth][consume] local consume', {
        hasTicket: Boolean(body.ticket),
        ticketPrefix: body.ticket.slice(0, 16),
        hasAnonymousUserId: Boolean(body.anonymousUserId),
    });
    return consumeTicketLocally(body);
}
