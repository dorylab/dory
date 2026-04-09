import { getAuth } from '@/lib/auth';
import { mirrorCloudSessionToDesktop } from '@/lib/auth/desktop-session-recovery';
import { buildSessionOrganizationPatch } from '@/lib/auth/migration-state';
import { serializeSignedCookie } from 'better-call';
import { proxyAuthRequest, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
    ticket: z.string().min(1),
});

type TicketUser = {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    activeOrganizationId?: string | null;
};

async function consumeTicketLocally(ticket: string) {
    const auth = await getAuth();
    const ctx = await auth.$context;

    const verification = await ctx.internalAdapter.findVerificationValue(ticket);
    if (!verification) {
        return NextResponse.json({ error: 'invalid_ticket' }, { status: 401 });
    }

    if (verification.expiresAt < new Date()) {
        await ctx.internalAdapter.deleteVerificationByIdentifier(ticket);
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
        await ctx.internalAdapter.deleteVerificationByIdentifier(ticket);
        return NextResponse.json({ error: 'invalid_ticket_payload' }, { status: 400 });
    }

    await ctx.internalAdapter.deleteVerificationByIdentifier(ticket);

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

export async function POST(req: Request) {
    if (shouldProxyAuthRequest()) {
        const response = await proxyAuthRequest(req);
        const mirroredCookie = response.ok ? await mirrorCloudSessionToDesktop(req, response.headers) : null;
        if (!mirroredCookie) {
            return response;
        }

        const headers = new Headers(response.headers);
        headers.append('set-cookie', mirroredCookie);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }

    const body = bodySchema.parse(await req.json().catch(() => ({})));
    return consumeTicketLocally(body.ticket);
}
