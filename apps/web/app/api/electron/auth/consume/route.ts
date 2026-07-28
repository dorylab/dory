import { getAuth } from '@/lib/auth';
import { buildSessionOrganizationPatch } from '@/lib/auth/migration-state';
import { linkAnonymousOrganizationToUser } from '@/lib/auth/anonymous-lifecycle/link';
import { appendClearAnonymousRecoveryCookieHeader } from '@/lib/auth/anonymous-recovery';
import { resolveSessionLifetime } from '@/lib/auth/session-lifetime';
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

function getTicketUserDisplayName(user: TicketUser): string {
    return user.name?.trim() || user.email?.split('@')[0]?.trim() || 'User';
}

async function resolveLocalTicketUser(user: TicketUser): Promise<TicketUser | null> {
    const db = await getClient();
    const [idUser] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, user.id)).limit(1);
    const [emailUser] = idUser || !user.email ? [] : await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, user.email)).limit(1);
    const resolvedUserId = idUser?.id ?? emailUser?.id ?? user.id;

    if (!idUser && !emailUser) {
        if (!user.email) {
            return null;
        }

        await db.insert(schema.user).values({
            id: resolvedUserId,
            email: user.email,
            name: getTicketUserDisplayName(user),
            image: user.image,
            emailVerified: user.emailVerified,
        });
    } else {
        await db
            .update(schema.user)
            .set({
                name: getTicketUserDisplayName(user),
                image: user.image,
                emailVerified: user.emailVerified,
                updatedAt: new Date(),
            })
            .where(eq(schema.user.id, resolvedUserId));
    }

    return {
        ...user,
        id: resolvedUserId,
    };
}

async function consumeTicketLocally(params: { ticket: string; anonymousUserId?: string | null; anonymousActiveOrganizationId?: string | null; requestUrl?: string | null }) {
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

    const ticketUser = parsed?.user;
    if (!ticketUser?.id) {
        await ctx.internalAdapter.deleteVerificationByIdentifier(params.ticket);
        return NextResponse.json({ error: 'invalid_ticket_payload' }, { status: 400 });
    }

    await ctx.internalAdapter.deleteVerificationByIdentifier(params.ticket);

    const user = await resolveLocalTicketUser(ticketUser);
    if (!user?.id) {
        return NextResponse.json({ error: 'invalid_ticket_user' }, { status: 400 });
    }

    const lifetime = resolveSessionLifetime({ desktop: true });
    const session = await ctx.internalAdapter.createSession(
        user.id,
        false,
        {
            expiresAt: lifetime.expiresAt,
        },
        true,
    );
    if (!session) {
        return NextResponse.json({ error: 'failed_to_create_session' }, { status: 500 });
    }

    const sessionPatch = buildSessionOrganizationPatch({
        activeOrganizationId: user.activeOrganizationId,
    });
    if (sessionPatch) {
        await ctx.internalAdapter.updateSession(session.token, sessionPatch);
    }

    let linkedAnonymousUser = false;
    if (params.anonymousUserId && params.anonymousUserId !== user.id) {
        linkedAnonymousUser = await linkAnonymousUserLocally({
            anonymousUserId: params.anonymousUserId,
            anonymousActiveOrganizationId: params.anonymousActiveOrganizationId ?? null,
            newUserId: user.id,
            newActiveOrganizationId: user.activeOrganizationId ?? null,
            newSessionToken: session.token,
        });
    }

    const baseAttrs = ctx.authCookies.sessionToken.attributes ?? {};
    const cookieAttrs = {
        ...baseAttrs,
        maxAge: lifetime.cookieMaxAgeSeconds,
    };
    const cookie = await serializeSignedCookie(ctx.authCookies.sessionToken.name, session.token, ctx.secret, cookieAttrs);

    const res = NextResponse.json({ ok: true });
    res.headers.append('set-cookie', cookie);
    if (linkedAnonymousUser) {
        appendClearAnonymousRecoveryCookieHeader(res.headers, params.requestUrl);
    }
    return res;
}

async function linkAnonymousUserLocally(params: {
    anonymousUserId: string;
    anonymousActiveOrganizationId: string | null;
    newUserId: string;
    newActiveOrganizationId: string | null;
    newSessionToken?: string | null;
}): Promise<boolean> {
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
            return false;
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
        return true;
    } catch (err) {
        console.error('[electron-auth][consume] failed to link anonymous org locally', err);
        return false;
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

        const { anonymousUserId } = parsed.data;

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

        console.log('[electron-auth][consume] proxy response', {
            status: response.status,
        });

        if (response.ok && anonymousUserId) {
            const responseHeaders = new Headers(response.headers);
            appendClearAnonymousRecoveryCookieHeader(responseHeaders, req.url);
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
            });
        }

        return response;
    }

    const body = bodySchemaWithAnonymous.parse(await req.json().catch(() => ({})));
    console.log('[electron-auth][consume] local consume', {
        hasTicket: Boolean(body.ticket),
        ticketPrefix: body.ticket.slice(0, 16),
        hasAnonymousUserId: Boolean(body.anonymousUserId),
    });
    return consumeTicketLocally({
        ...body,
        requestUrl: req.url,
    });
}
