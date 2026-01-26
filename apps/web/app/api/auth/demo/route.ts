import { getAuth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_USER = {
    email: 'demo@dory.local',
    password: 'demo',
    name: 'Demo User',
};

export async function POST(req: NextRequest) {
    const auth = await getAuth();
    const ctx = await auth.$context;

    const existing = await ctx.internalAdapter.findUserByEmail(DEMO_USER.email, {
        includeAccounts: true,
    });

    const passwordHash = await ctx.password.hash(DEMO_USER.password);

    if (!existing) {
        const createdUser = await ctx.internalAdapter.createUser({
            email: DEMO_USER.email,
            name: DEMO_USER.name,
            emailVerified: true,
        });

        await ctx.internalAdapter.linkAccount({
            userId: createdUser.id,
            providerId: 'credential',
            accountId: createdUser.id,
            password: passwordHash,
        });
    } else {
        if (!existing.user.emailVerified) {
            await ctx.internalAdapter.updateUser(existing.user.id, { emailVerified: true });
        }

        const hasCredential = existing.accounts?.some(account => account.providerId === 'credential' && account.password);
        if (!hasCredential) {
            await ctx.internalAdapter.linkAccount({
                userId: existing.user.id,
                providerId: 'credential',
                accountId: existing.user.id,
                password: passwordHash,
            });
        } else {
            await ctx.internalAdapter.updatePassword(existing.user.id, passwordHash);
        }
    }

    const { headers } = await auth.api.signInEmail({
        headers: req.headers,
        body: {
            email: DEMO_USER.email,
            password: DEMO_USER.password,
        },
        returnHeaders: true,
    });

    const res = NextResponse.json({ ok: true });
    headers?.forEach((value, key) => {
        res.headers.append(key, value);
    });
    return res;
}
