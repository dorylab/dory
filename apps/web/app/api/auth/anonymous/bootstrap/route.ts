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
    const userId = session?.user?.id;
    if (typeof userId !== 'string' || !userId) {
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
        const organizationId = typeof organization.id === 'string' ? organization.id : null;
        if (!organizationId) {
            throw new Error('anonymous_organization_missing_id');
        }
        const organizationSlug = typeof organization.slug === 'string' && organization.slug ? organization.slug : organizationId;
        const organizationName = typeof organization.name === 'string' ? organization.name : null;

        const response = NextResponse.json({
            organizationId,
            organizationSlug,
            organizationName,
        });

        const token = await issueAnonymousRecoveryToken({
            userId,
            activeOrganizationId: organizationId,
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
