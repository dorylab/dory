import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthRequest, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { getAuth } from '@/lib/auth';
import { getSessionFromRequest } from '@/lib/auth/session';
import { bootstrapAnonymousOrganization } from '@/lib/auth/anonymous';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';
import { appendAnonymousRecoveryCookieHeader, issueAnonymousRecoveryToken } from '@/lib/auth/anonymous-recovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    if (shouldProxyAuthRequest()) {
        return proxyAuthRequest(req);
    }

    const session = await getSessionFromRequest(req);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    if (!isAnonymousUser(session.user)) {
        return NextResponse.json({ error: 'ANONYMOUS_SESSION_REQUIRED' }, { status: 403 });
    }

    try {
        const auth = await getAuth();
        const organization = await bootstrapAnonymousOrganization({
            auth,
            session,
            headers: req.headers,
        });

        const response = NextResponse.json({
            organizationId: organization.id,
            organizationSlug: organization.slug ?? organization.id,
            organizationName: organization.name,
        });

        const token = await issueAnonymousRecoveryToken({
            userId: session.user.id,
            activeOrganizationId: organization.id,
        });
        appendAnonymousRecoveryCookieHeader(response.headers, {
            requestUrl: req.url,
            token,
        });

        return response;
    } catch (error) {
        console.error('[auth][anonymous-bootstrap] failed', error);
        return NextResponse.json({ error: 'ANONYMOUS_BOOTSTRAP_FAILED' }, { status: 500 });
    }
}
