import { getAuth } from '@/lib/auth';
import { appendClearAnonymousRecoveryCookieHeader } from '@/lib/auth/anonymous-recovery';
import { buildSessionOrganizationPatch } from '@/lib/auth/migration-state';
import { getDBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { schema } from '@dory/database/schema';
import { proxyAuthRequest, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { ensureDemoConnection } from '@/lib/demo/ensure-demo-connection';
import { getRuntimeForServer } from '@dory/shared/runtime';
import { serializeSignedCookie } from 'better-call';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_USER = {
    email: 'demo@getdory.dev',
    password: 'demo',
    name: 'Demo User',
};

const LEGACY_DEMO_EMAILS = ['demo@example.com', 'demo@dory.local'];

function slugifyOrganizationName(name: string) {
    const normalized = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'workspace';
}

export async function POST(req: NextRequest) {
    const runtime = getRuntimeForServer() ?? 'web';
    if (runtime !== 'web') {
        return NextResponse.json({ error: 'demo_sign_in_unavailable' }, { status: 404 });
    }

    if (shouldProxyAuthRequest()) {
        return proxyAuthRequest(req);
    }

    const auth = await getAuth();
    const ctx = await auth.$context;

    let existing = await ctx.internalAdapter.findUserByEmail(DEMO_USER.email, {
        includeAccounts: true,
    });

    if (!existing) {
        for (const legacyEmail of LEGACY_DEMO_EMAILS) {
            const legacyUser = await ctx.internalAdapter.findUserByEmail(legacyEmail, {
                includeAccounts: true,
            });

            if (!legacyUser) {
                continue;
            }

            await ctx.internalAdapter.updateUser(legacyUser.user.id, {
                email: DEMO_USER.email,
            });

            existing = await ctx.internalAdapter.findUserByEmail(DEMO_USER.email, {
                includeAccounts: true,
            });
            break;
        }
    }

    const passwordHash = await ctx.password.hash(DEMO_USER.password);

    let userId: string;

    if (!existing) {
        const createdUser = await ctx.internalAdapter.createUser({
            email: DEMO_USER.email,
            name: DEMO_USER.name,
            emailVerified: true,
        });

        userId = createdUser.id;

        await ctx.internalAdapter.linkAccount({
            userId: createdUser.id,
            providerId: 'credential',
            accountId: createdUser.id,
            password: passwordHash,
        });
    } else {
        userId = existing.user.id;

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

    const db = await getDBService();
    if (!db) {
        throw new Error('Database service not initialized');
    }

    const existingMemberships = await db.organizations.listByUser(userId);
    if (existingMemberships.length === 0) {
        const now = new Date();
        const name = `${DEMO_USER.name}'s Workspace`;
        const slug = `${slugifyOrganizationName(name)}-${userId.slice(0, 8)}`;
        const postgres = await getClient();

        const insertedOrganizations = await postgres
            .insert(schema.organizations)
            .values({
                name,
                slug,
                ownerUserId: userId,
                provisioningKind: 'manual',
                createdAt: now,
                updatedAt: now,
            })
            .returning({ id: schema.organizations.id });

        const organizationId = insertedOrganizations[0]?.id;
        if (!organizationId) {
            throw new Error(`failed_to_create_demo_organization_for_${userId}`);
        }

        await postgres.insert(schema.organizationMembers).values({
            userId,
            organizationId,
            role: 'owner',
            status: 'active',
            createdAt: now,
            joinedAt: now,
        });
    }

    // Ensure demo SQLite connection exists for the user's organization
    const memberships = await db.organizations.listByUser(userId);
    if (memberships.length > 0) {
        try {
            await ensureDemoConnection(db, userId, memberships[0]!.organizationId);
        } catch (error) {
            console.warn('[demo] failed to ensure demo connection:', error);
        }
    }

    const session = await ctx.internalAdapter.createSession(userId, false);
    if (!session) {
        return NextResponse.json({ error: 'FAILED_TO_CREATE_SESSION' }, { status: 500 });
    }

    const activeOrganizationId = memberships[0]?.organizationId ?? null;
    const activeOrganization = activeOrganizationId ? await db.organizations.getOrganizationBySlugOrId(activeOrganizationId) : null;
    const sessionPatch = buildSessionOrganizationPatch({
        activeOrganizationId,
    });
    if (sessionPatch) {
        await ctx.internalAdapter.updateSession(session.token, sessionPatch);
    }

    const res = NextResponse.json({
        ok: true,
        organizationSlug: activeOrganization?.slug ?? activeOrganizationId,
    });
    const baseAttrs = ctx.authCookies.sessionToken.attributes ?? {};
    const maxAge = ctx.sessionConfig?.expiresIn;
    const sessionCookie = await serializeSignedCookie(ctx.authCookies.sessionToken.name, session.token, ctx.secret, {
        ...baseAttrs,
        ...(maxAge ? { maxAge } : {}),
    });

    res.headers.append('set-cookie', sessionCookie);
    appendClearAnonymousRecoveryCookieHeader(res.headers, req.url);

    return res;
}
