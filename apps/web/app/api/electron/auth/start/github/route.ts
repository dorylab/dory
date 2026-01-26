import { getAuth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
    redirectTo: z.string().optional(),
});

export async function GET(req: NextRequest) {
    const auth = await getAuth();
    const query = Object.fromEntries(req.nextUrl.searchParams);
    const { redirectTo } = querySchema.parse(query);
    const redirectTarget = redirectTo ?? 'dory://auth/callback';

    const origin = req.nextUrl.origin;
    const bridgeUrl = new URL('/api/electron/auth/bridge', origin);
    bridgeUrl.searchParams.set('redirectTo', redirectTarget);

    const ctx = await auth.$context;
    const previousBaseURL = ctx.options.baseURL;
    const previousBase = ctx.baseURL;
    const basePath = ctx.options.basePath ?? '/api/auth';
    const authBaseURL = `${origin}${basePath}`;
    ctx.options.baseURL = authBaseURL;
    ctx.baseURL = authBaseURL;

    try {
        const { response, headers } = await auth.api.signInSocial({
            headers: req.headers,
            body: {
                provider: 'github',
                callbackURL: bridgeUrl.toString(),
                errorCallbackURL: bridgeUrl.toString(),
                disableRedirect: true,
            },
            returnHeaders: true,
        });

        if (!response?.url) {
            return NextResponse.json({ error: 'Failed to generate authorization URL' }, { status: 500 });
        }

        const res = NextResponse.json({ url: response.url });
        headers?.forEach((value, key) => {
            res.headers.append(key, value);
        });
        return res;
    } finally {
        ctx.options.baseURL = previousBaseURL;
        ctx.baseURL = previousBase;
    }
}
