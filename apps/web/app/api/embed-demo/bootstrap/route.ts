import { NextRequest, NextResponse } from 'next/server';
import { getDBService } from '@dory/database';

import { getAuth } from '@/lib/auth';
import { getSessionFromRequest } from '@/lib/auth/session';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';
import { bootstrapHackerNewsEmbedDemo } from '@/lib/server/embed-demo/bootstrap';
import { EMBED_DEMO_TTL_MS, isAllowedEmbedDemoHost, normalizeEmbedDemoLocale } from '@/lib/server/embed-demo/config';
import { consumeEmbedDemoSession } from '@/lib/server/embed-demo/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    if (!isAllowedEmbedDemoHost(req.headers.get('host'))) {
        return NextResponse.json({ code: 'EMBED_DEMO_HOST_NOT_ALLOWED' }, { status: 404 });
    }

    const session = await getSessionFromRequest(req);
    if (!session?.user?.id) {
        return NextResponse.json({ code: 'EMBED_DEMO_SESSION_REQUIRED' }, { status: 401 });
    }
    if (!isAnonymousUser(session.user)) {
        return NextResponse.json({ code: 'EMBED_DEMO_ANONYMOUS_SESSION_REQUIRED' }, { status: 403 });
    }

    try {
        const body = (await req.json().catch(() => null)) as { locale?: unknown } | null;
        const locale = normalizeEmbedDemoLocale(body?.locale);
        const db = await getDBService();
        if (!(await db.organizations.hasEmbedDemoForOwner(session.user.id))) {
            const rateLimit = await consumeEmbedDemoSession(req.headers);
            if (!rateLimit.allowed) {
                return NextResponse.json({ code: 'EMBED_DEMO_LIMIT_REACHED' }, { status: 429 });
            }
        }
        const auth = await getAuth();
        const { organization, connection } = await bootstrapHackerNewsEmbedDemo({ auth, session, headers: req.headers });
        const response = NextResponse.json({
            organizationSlug: organization.slug ?? organization.id,
            connectionId: connection.id,
            expiresAt: new Date(organization.createdAt.getTime() + EMBED_DEMO_TTL_MS).toISOString(),
        });
        response.cookies.set('locale', locale, {
            httpOnly: false,
            maxAge: Math.floor(EMBED_DEMO_TTL_MS / 1_000),
            path: '/',
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        });
        return response;
    } catch (error) {
        console.error('[embed-demo] bootstrap failed', error);
        return NextResponse.json({ code: 'EMBED_DEMO_BOOTSTRAP_FAILED' }, { status: 500 });
    }
}
