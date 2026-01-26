import { getAuth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_DEEP_LINK = 'dory://auth/callback';

export async function GET(req: NextRequest) {
    const auth = await getAuth();
    const origin = req.nextUrl.origin;

    const ctx = await auth.$context;
    if (!ctx.options.baseURL) {
        const basePath = ctx.options.basePath ?? '/api/auth';
        const authBaseURL = `${origin.trim()}${basePath}`;
        ctx.options.baseURL = authBaseURL;
        ctx.baseURL = authBaseURL;
    }

    const redirectTo = req.nextUrl.searchParams.get('redirectTo') ?? DEFAULT_DEEP_LINK;
    let error = req.nextUrl.searchParams.get('error') ?? null;
    let token: string | null = null;

    try {
        const apiWithToken = auth.api as typeof auth.api & {
            getToken?: (context: { headers: Headers }) => Promise<{ token?: string }>;
        };
        if (apiWithToken.getToken) {
            const jwt = await apiWithToken.getToken({ headers: req.headers });
            token = jwt?.token ?? null;
        }
    } catch (err) {
        console.error('[auth-bridge] failed to get jwt token', err);
    }

    if (!token) {
        try {
            const session = await auth.api.getSession({ headers: req.headers });
            token = session?.session?.token ?? null;
        } catch (err) {
            console.error('[auth-bridge] failed to get session token', err);
        }
    }

    if (!token && !error) {
        error = 'missing_token';
    }

    let deepLinkUrl: URL;
    try {
        deepLinkUrl = new URL(redirectTo);
    } catch {
        deepLinkUrl = new URL(DEFAULT_DEEP_LINK);
    }

    if (error) {
        deepLinkUrl.searchParams.set('error', error);
    }
    if (token) {
        deepLinkUrl.searchParams.set('token', token);
    }

    
    return NextResponse.redirect(deepLinkUrl.toString());
}
