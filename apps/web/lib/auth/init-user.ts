import type { PostgresDBClient } from '@dory/shared';
import { createProvisionedOrganization } from './organization-provisioning';
import { buildDefaultOrganizationValues, findFirstActiveOrganizationIdForUser, getDb } from './anonymous-lifecycle/common';

type InitUserCredentials = {
    email: string;
    password: string;
};

export type InitUserProvisioningResult = {
    userId: string;
    organizationId: string | null;
    email: string;
};

function deriveInitUserName(email: string) {
    const localPart = email.split('@')[0]?.trim();
    return localPart || email;
}

function readInitUserCredentials(): InitUserCredentials | null {
    const email = process.env.DORY_INIT_USER_EMAIL?.trim() || '';
    const password = process.env.DORY_INIT_USER_PASSWORD?.trim() || '';

    if (!email || !password) {
        return null;
    }

    return {
        email,
        password,
    };
}

async function upsertCredentialAccount(auth: any, email: string, password: string) {
    const ctx = await auth.$context;
    const passwordHash = await ctx.password.hash(password);
    const name = deriveInitUserName(email);
    const existing = await ctx.internalAdapter.findUserByEmail(email, {
        includeAccounts: true,
    });

    if (!existing) {
        const createdUser = await ctx.internalAdapter.createUser({
            email,
            name,
            emailVerified: true,
        });

        await ctx.internalAdapter.linkAccount({
            userId: createdUser.id,
            providerId: 'credential',
            accountId: createdUser.id,
            password: passwordHash,
        });

        return createdUser.id;
    }

    await ctx.internalAdapter.updateUser(existing.user.id, {
        email,
        name,
        emailVerified: true,
    });

    const hasCredentialAccount = existing.accounts?.some((account: { providerId?: string | null }) => account.providerId === 'credential');
    if (hasCredentialAccount) {
        await ctx.internalAdapter.updatePassword(existing.user.id, passwordHash);
    } else {
        await ctx.internalAdapter.linkAccount({
            userId: existing.user.id,
            providerId: 'credential',
            accountId: existing.user.id,
            password: passwordHash,
        });
    }

    return existing.user.id;
}

async function ensureDefaultOrganization(auth: any, db: PostgresDBClient, userId: string, email: string) {
    const existingOrganizationId = await findFirstActiveOrganizationIdForUser(db, userId);
    if (existingOrganizationId) {
        return existingOrganizationId;
    }

    const defaults = await buildDefaultOrganizationValues(userId, email);
    const organization = await createProvisionedOrganization({
        auth,
        userId,
        name: defaults.name,
        slug: defaults.slug,
        provisioningKind: 'system_default',
    });

    return organization.id;
}

export async function ensureConfiguredInitUser(auth: any) {
    const credentials = readInitUserCredentials();
    if (!credentials) {
        return null;
    }

    const db = (await getDb()) as PostgresDBClient;
    const userId = await upsertCredentialAccount(auth, credentials.email, credentials.password);
    const organizationId = await ensureDefaultOrganization(auth, db, userId, credentials.email);

    console.log('[auth] init user ensured', {
        email: credentials.email,
        userId,
        organizationId,
    });

    return {
        userId,
        organizationId,
        email: credentials.email,
    } satisfies InitUserProvisioningResult;
}
