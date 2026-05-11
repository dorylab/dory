import { ensureOrganizationDefaults } from '@/lib/demo/organization-defaults';
import { serializeSignedCookie } from 'better-call';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import {
    appendAnonymousRecoveryCookieHeader,
    issueAnonymousRecoveryToken,
    readAnonymousRecoveryPayload,
    resolveRecoverableAnonymousPayload,
} from '@/lib/auth/anonymous-recovery';
import {
    buildAnonymousOrganizationValues,
    findFirstActiveOrganizationIdForUser,
} from '@/lib/auth/anonymous-lifecycle/common';
import { buildSessionOrganizationPatch } from '@/lib/auth/migration-state';
import { getDBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { schema } from '@dory/database/schema';
import { newEntityId } from '@dory/shared/id';
import { isDesktopRuntime } from '@dory/shared/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveOrganizationForUser(userId: string, activeOrganizationId?: string | null) {
    const db = await getClient();
    const organizationId = activeOrganizationId ?? (await findFirstActiveOrganizationIdForUser(db, userId));
    if (!organizationId) {
        return null;
    }

    const [organization] = await db
        .select({
            id: schema.organizations.id,
            slug: schema.organizations.slug,
            name: schema.organizations.name,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);

    return organization ?? null;
}

async function createSessionForOfflineAnonymousUser(userId: string, organizationId: string) {
    const auth = await getAuth();
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(userId, false);
    if (!session) {
        throw new Error('failed_to_create_offline_anonymous_session');
    }

    const sessionPatch = buildSessionOrganizationPatch({
        activeOrganizationId: organizationId,
    });
    if (sessionPatch) {
        await ctx.internalAdapter.updateSession(session.token, sessionPatch);
    }

    return {
        ctx,
        session,
    };
}

async function recoverOfflineAnonymousUser(req: NextRequest) {
    const payload = await readAnonymousRecoveryPayload(req.headers);
    const recoverableUser = await resolveRecoverableAnonymousPayload(payload);
    if (!recoverableUser?.userId) {
        return null;
    }

    const organization = await resolveOrganizationForUser(recoverableUser.userId, recoverableUser.activeOrganizationId);
    if (!organization?.id) {
        return null;
    }

    const dbService = await getDBService();
    await ensureOrganizationDefaults(dbService, recoverableUser.userId, organization.id);
    const { ctx, session } = await createSessionForOfflineAnonymousUser(recoverableUser.userId, organization.id);

    return {
        ctx,
        session,
        userId: recoverableUser.userId,
        organization,
    };
}

async function createOfflineAnonymousUser() {
    const db = await getClient();
    const now = new Date();
    const userId = newEntityId();

    await db.insert(schema.user).values({
        id: userId,
        name: 'Guest',
        email: `${userId}@anon.getdory.dev`,
        isAnonymous: true,
        emailVerified: false,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
    });

    const defaults = await buildAnonymousOrganizationValues(userId);
    const insertedOrganizations = await db
        .insert(schema.organizations)
        .values({
            name: defaults.name,
            slug: defaults.slug,
            ownerUserId: userId,
            provisioningKind: 'anonymous',
            createdAt: now,
            updatedAt: now,
        })
        .returning({
            id: schema.organizations.id,
            slug: schema.organizations.slug,
            name: schema.organizations.name,
        });

    const organization = insertedOrganizations[0];
    if (!organization?.id) {
        throw new Error(`failed_to_create_offline_anonymous_organization_for_${userId}`);
    }

    await db.insert(schema.organizationMembers).values({
        userId,
        organizationId: organization.id,
        role: 'owner',
        status: 'active',
        createdAt: now,
        joinedAt: now,
    });

    const dbService = await getDBService();
    await ensureOrganizationDefaults(dbService, userId, organization.id);
    const { ctx, session } = await createSessionForOfflineAnonymousUser(userId, organization.id);

    return {
        ctx,
        session,
        userId,
        organization,
    };
}

export async function POST(req: NextRequest) {
    if (!isDesktopRuntime()) {
        return NextResponse.json({ error: 'DESKTOP_RUNTIME_REQUIRED' }, { status: 404 });
    }

    try {
        const { ctx, session, userId, organization } = (await recoverOfflineAnonymousUser(req)) ?? (await createOfflineAnonymousUser());
        const response = NextResponse.json({
            organizationId: organization.id,
            organizationSlug: organization.slug ?? organization.id,
            organizationName: organization.name,
        });

        const baseAttrs = ctx.authCookies.sessionToken.attributes ?? {};
        const maxAge = ctx.sessionConfig?.expiresIn;
        const sessionCookie = await serializeSignedCookie(ctx.authCookies.sessionToken.name, session.token, ctx.secret, {
            ...baseAttrs,
            ...(maxAge ? { maxAge } : {}),
        });
        response.headers.append('set-cookie', sessionCookie);

        const recoveryToken = await issueAnonymousRecoveryToken({
            userId,
            activeOrganizationId: organization.id,
        });
        appendAnonymousRecoveryCookieHeader(response.headers, {
            requestUrl: req.url,
            token: recoveryToken,
        });

        return response;
    } catch (error) {
        console.error('[desktop][offline-anonymous] failed', error);
        return NextResponse.json({ error: 'OFFLINE_ANONYMOUS_BOOTSTRAP_FAILED' }, { status: 500 });
    }
}
