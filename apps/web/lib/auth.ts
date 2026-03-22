import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt, organization } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { dash, sentinel } from '@better-auth/infra';
import { createCachedAsyncFactory } from '@dory/auth-core';
import type { PostgresDBClient } from '../types';
import { getClient } from './database/postgres/client';
import { getDatabaseProvider } from './database/provider';
import { schema } from './database/schema';
import { sendEmail } from './email';
import { resolveOrganizationIdForSession, shouldCreateDefaultOrganization } from './auth/migration-state';
import { translate } from './i18n/i18n';
import { getServerLocale } from './i18n/server-locale';
import { isDesktopRuntime } from './runtime/runtime';
import { organizationAc, organizationRoles } from './auth/organization-ac';

type AuthUser = {
    id: string;
    email: string | null;
    emailVerified: boolean;
};

type SessionWithActiveOrganization = {
    userId: string;
    activeOrganizationId?: string | null;
};

function slugifyOrganizationName(name: string) {
    const normalized = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'workspace';
}

function createAuth() {
    return (async () => {
        const db = (await getClient()) as PostgresDBClient;
        const provider = getDatabaseProvider() === 'pglite' ? 'pg' : 'pg';
        const isDesktop = isDesktopRuntime();
        const desktopOrigin =
            process.env.DORY_ELECTRON_ORIGIN?.trim() || process.env.NEXT_PUBLIC_DORY_ELECTRON_ORIGIN?.trim() || (isDesktop ? `http://127.0.0.1:${process.env.PORT ?? 3000}` : '');
        const publicAuthBaseUrl = process.env.BETTER_AUTH_URL?.trim() || desktopOrigin || null;
        const betterAuthApiKey = process.env.BETTER_AUTH_API_KEY?.trim() || undefined;
        const betterAuthApiUrl = process.env.BETTER_AUTH_API_URL?.trim() || undefined;
        const betterAuthKvUrl = process.env.BETTER_AUTH_KV_URL?.trim() || undefined;
        const betterAuthInfraOptions = {
            ...(betterAuthApiKey ? { apiKey: betterAuthApiKey } : {}),
            ...(betterAuthApiUrl ? { apiUrl: betterAuthApiUrl } : {}),
            ...(betterAuthKvUrl ? { kvUrl: betterAuthKvUrl } : {}),
        };

        console.log('[auth] TRUSTED_ORIGINS =', process.env.TRUSTED_ORIGINS);

        async function findInitialOrganizationId(userId: string): Promise<string | null> {
            const [existingMembership] = await db
                .select({ organizationId: schema.organizationMembers.organizationId })
                .from(schema.organizationMembers)
                .where(eq(schema.organizationMembers.userId, userId))
                .limit(1);

            const resolvedOrganizationId = resolveOrganizationIdForSession({
                membershipOrganizationId: existingMembership?.organizationId ?? null,
            });

            if (!resolvedOrganizationId) {
                return null;
            }

            return resolvedOrganizationId;
        }

        async function hasExistingOrganization(userId: string): Promise<boolean> {
            return Boolean(await findInitialOrganizationId(userId));
        }

        /**
         * Shared helper: create a default organization + member relation through better-auth.
         * The plugin owns the organization/member writes.
         */
        async function ensureDefaultOrganizationForUser(auth: any, userId: string, email: string | null | undefined) {
            if (isDesktop) {
                return;
            }

            const existingOrganizationId = await findInitialOrganizationId(userId);
            if (existingOrganizationId) {
                return;
            }

            const locale = await getServerLocale();
            const t = (key: string, values?: Record<string, unknown>) => translate(locale, key, values);
            const name = t('Auth.TeamName', { name: email ?? t('Auth.TeamDefaultName') });

            const created = await auth.api.createOrganization({
                body: {
                    name,
                    slug: `${slugifyOrganizationName(name)}-${userId.slice(0, 8)}`,
                    userId,
                    keepCurrentActiveOrganization: false,
                },
            });

            const organizationId = created?.id ?? null;
            if (!organizationId) {
                throw new Error(`failed_to_create_default_organization_for_${userId}`);
            }

            console.log(`[auth] default organization ${organizationId} created for user ${userId}`);
        }

        const auth = betterAuth({
            appName: 'Dory',
            // experimental: {
            //     joins: true,
            // },
            database: drizzleAdapter(db, { provider, schema }),
            plugins: [
                jwt(),
                dash({
                    ...betterAuthInfraOptions,
                    activityTracking: {
                        enabled: true,
                        updateInterval: 300000,
                    },
                }),
                sentinel({
                    ...betterAuthInfraOptions,
                    security: {
                        credentialStuffing: {
                            enabled: true,
                            thresholds: {
                                challenge: 3,
                                block: 5,
                            },
                            windowSeconds: 3600,
                            cooldownSeconds: 900,
                        },
                        impossibleTravel: {
                            enabled: true,
                            action: 'log',
                        },
                        botBlocking: {
                            action: 'challenge',
                        },
                        suspiciousIpBlocking: {
                            action: 'challenge',
                        },
                        velocity: {
                            enabled: true,
                            thresholds: {
                                challenge: 10,
                                block: 20,
                            },
                            maxSignupsPerVisitor: 5,
                            maxPasswordResetsPerIp: 10,
                            maxSignInsPerIp: 50,
                            windowSeconds: 3600,
                            action: 'challenge',
                        },
                        challengeDifficulty: 18,
                    },
                }),
                organization({
                    ac: organizationAc,
                    roles: organizationRoles,
                    creatorRole: 'owner',
                    invitationExpiresIn: 60 * 60 * 48,
                    cancelPendingInvitationsOnReInvite: true,
                    schema: {
                        session: {
                            fields: {
                                activeOrganizationId: 'activeOrganizationId',
                            },
                        },
                        organization: {
                            modelName: 'organizations',
                            fields: {
                                name: 'name',
                                slug: 'slug',
                                logo: 'logo',
                                metadata: 'metadata',
                                createdAt: 'createdAt',
                                updatedAt: 'updatedAt',
                            },
                            additionalFields: {
                                ownerUserId: {
                                    type: 'string',
                                    required: false,
                                    input: false,
                                },
                            },
                        },
                        member: {
                            modelName: 'organizationMembers',
                            fields: {
                                organizationId: 'organizationId',
                                userId: 'userId',
                                role: 'role',
                                createdAt: 'createdAt',
                            },
                            additionalFields: {
                                status: {
                                    type: 'string',
                                    required: false,
                                    input: false,
                                },
                                joinedAt: {
                                    type: 'date',
                                    required: false,
                                    input: false,
                                },
                            },
                        },
                        invitation: {
                            modelName: 'invitation',
                            fields: {
                                organizationId: 'organizationId',
                                email: 'email',
                                role: 'role',
                                status: 'status',
                                expiresAt: 'expiresAt',
                                createdAt: 'createdAt',
                                inviterId: 'inviterId',
                            },
                        },
                    },
                    organizationHooks: {
                        beforeCreateOrganization: async ({ organization, user }) => {
                            return {
                                data: {
                                    ...organization,
                                    ownerUserId: user.id,
                                },
                            };
                        },
                    },
                    sendInvitationEmail: async ({ id, email, role, organization, inviter }) => {
                        if (!publicAuthBaseUrl) {
                            console.warn('[auth] missing BETTER_AUTH_URL, skipping invitation email', {
                                invitationId: id,
                                email,
                            });
                            return;
                        }

                        const locale = await getServerLocale();
                        const t = (key: string, values?: Record<string, unknown>) => translate(locale, key, values);
                        const invitationUrl = new URL('/organization/accept-invitation', publicAuthBaseUrl);
                        invitationUrl.searchParams.set('invitationId', id);

                        await sendEmail({
                            to: email,
                            subject: `Invitation to join ${organization.name}`,
                            text: `You've been invited to join ${organization.name} as ${role}. Accept the invitation: ${invitationUrl.toString()}`,
                            html: `
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #0f172a; padding: 24px;">
                                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
                                        <img src="https://app.getdory.dev/logo.png" width="32" height="32" alt="Dory" style="display: inline-block; border-radius: 6px;" />
                                        <span style="font-size: 16px; font-weight: 600; color: #0f172a;">Dory</span>
                                    </div>
                                    <h2 style="margin: 0 0 12px; font-size: 20px;">Invitation to join ${organization.name}</h2>
                                    <p style="margin: 0 0 12px; font-size: 14px; color: #334155;">
                                        ${inviter.user.name || inviter.user.email} invited you to join <strong>${organization.name}</strong> as <strong>${role}</strong>.
                                    </p>
                                    <p style="margin: 0 0 24px;">
                                        <a href="${invitationUrl.toString()}" style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px;">
                                            Accept invitation
                                        </a>
                                    </p>
                                    <p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">
                                        If you do not have an account yet, sign up with this email address first, then accept the invitation.
                                    </p>
                                    <p style="margin: 0; font-size: 12px; color: #2563eb; word-break: break-all;">
                                        <a href="${invitationUrl.toString()}" style="color: #2563eb; text-decoration: underline;">${invitationUrl.toString()}</a>
                                    </p>
                                </div>
                            `.trim(),
                        });
                    },
                }),
            ],
            baseURL: isDesktop && desktopOrigin ? desktopOrigin : undefined,
            advanced: isDesktop ? { useSecureCookies: false } : undefined,
            account: {
                storeStateStrategy: 'database',
                skipStateCookieCheck: true,
            },
            trustedOrigins: [
                'http://127.0.0.1:*',
                'http://localhost:*',
                `dory://`,
                ...(process.env.TRUSTED_ORIGINS?.split(',')
                    .map(s => s.trim())
                    .filter(Boolean) ?? []),
            ],

            /**
             * ✅ Database hooks:
             * user.create.after: runs after any new-user creation (email / social / magic link, etc.)
             *
             * Used to:
             *   - auto-create a organization on first social login
             *   - for email signup, optionally wait for emailVerified=true (enabled here)
             */
            databaseHooks: {
                user: {
                    create: {
                        after: async rawUser => {
                            const user = rawUser as AuthUser;

                            // Skip if the user is already attached to an organization.
                            const existingOrganizationId = await findInitialOrganizationId(user.id);

                            // For social login:
                            //   - If SSO marks email as verified, emailVerified is true
                            //   → Create the organization immediately here
                            //
                            // For email+password signup:
                            //   - With requireEmailVerification, emailVerified is usually false
                            //   → Create the organization in afterEmailVerification instead
                            if (
                                shouldCreateDefaultOrganization({
                                    isDesktop,
                                    existingOrganizationId,
                                    emailVerified: user.emailVerified,
                                })
                            ) {
                                await ensureDefaultOrganizationForUser(auth as any, user.id, user.email);
                            }
                        },
                    },
                },
                session: {
                    expiresIn: 60 * 60 * 24 * 30, // 30 days
                    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
                    create: {
                        before: async rawSession => {
                            const session = rawSession as SessionWithActiveOrganization;
                            const activeOrganizationId = resolveOrganizationIdForSession({
                                activeOrganizationId: session.activeOrganizationId ?? null,
                                membershipOrganizationId: await findInitialOrganizationId(session.userId),
                            });

                            return {
                                data: {
                                    ...session,
                                    activeOrganizationId,
                                },
                            };
                        },
                    },
                },
            },

            emailAndPassword: {
                enabled: true,
                requireEmailVerification: true,
                autoSignInAfterVerification: true,

                sendResetPassword: async ({ user, url, token }, request) => {
                    const locale = await getServerLocale();
                    const t = (key: string, values?: Record<string, unknown>) => translate(locale, key, values);
                    const r = console.log('[auth] sendVerificationEmail hook', { to: user.email, url });
                    await sendEmail({
                        to: user.email,
                        subject: t('Auth.Emails.ResetPassword.Subject'),
                        text: t('Auth.Emails.ResetPassword.Text', { url }),
                        html: `
                            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #0f172a; padding: 24px;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
                                    <img src="https://app.getdory.dev/logo.png" width="32" height="32" alt="${t('Auth.Emails.ResetPassword.BrandName')}" style="display: inline-block; border-radius: 6px;" />
                                    <span style="font-size: 16px; font-weight: 600; color: #0f172a;">${t('Auth.Emails.ResetPassword.BrandName')}</span>
                                </div>
                                <h2 style="margin: 0 0 12px; font-size: 20px;">${t('Auth.Emails.ResetPassword.Subject')}</h2>
                                <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">
                                    ${t('Auth.Emails.ResetPassword.Intro')}
                                </p>
                                <p style="margin: 0 0 24px;">
                                    <a href="${url}" style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px;">
                                        ${t('Auth.Emails.ResetPassword.Button')}
                                    </a>
                                </p>
                                <p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">
                                    ${t('Auth.Emails.ResetPassword.Fallback')}
                                </p>
                                <p style="margin: 0; font-size: 12px; color: #2563eb; word-break: break-all;">
                                    <a href="${url}" style="color: #2563eb; text-decoration: underline;">${url}</a>
                                </p>
                            </div>
                        `.trim(),
                    });
                    console.log('[auth] sendEmail result', r);
                },
            },

            emailVerification: {
                sendOnSignUp: true,

                sendVerificationEmail: async ({ user, url, token }, request) => {
                    const locale = await getServerLocale();
                    const t = (key: string, values?: Record<string, unknown>) => translate(locale, key, values);
                    await sendEmail({
                        to: user.email,
                        subject: t('Auth.Emails.VerifyEmail.Subject'),
                        text: t('Auth.Emails.VerifyEmail.Text', { url }),
                        html: `
                            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #0f172a; padding: 24px;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
                                    <img src="https://app.getdory.dev/logo.png" width="32" height="32" alt="${t('Auth.Emails.VerifyEmail.BrandName')}" style="display: inline-block; border-radius: 6px;" />
                                    <span style="font-size: 16px; font-weight: 600; color: #0f172a;">${t('Auth.Emails.VerifyEmail.BrandName')}</span>
                                </div>
                                <h2 style="margin: 0 0 12px; font-size: 20px;">${t('Auth.Emails.VerifyEmail.Subject')}</h2>
                                <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">
                                    ${t('Auth.Emails.VerifyEmail.Intro')}
                                </p>
                                <p style="margin: 0 0 24px;">
                                    <a href="${url}" style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px;">
                                        ${t('Auth.Emails.VerifyEmail.Button')}
                                    </a>
                                </p>
                                <p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">
                                    ${t('Auth.Emails.VerifyEmail.Fallback')}
                                </p>
                                <p style="margin: 0; font-size: 12px; color: #2563eb; word-break: break-all;">
                                    <a href="${url}" style="color: #2563eb; text-decoration: underline;">${url}</a>
                                </p>
                            </div>
                        `.trim(),
                    });
                },

                /**
                 * ✅ After email verification:
                 * - Create organization only if the user has not joined any organization yet
                 * - Covers two cases:
                 *   1) Standard email+password signup
                 *   2) Social login where SSO doesn't mark emailVerified
                 */
                afterEmailVerification: async (rawUser, request) => {
                    const user = rawUser as AuthUser;

                    if (await hasExistingOrganization(user.id)) {
                        // Possibly created via databaseHooks during social login,
                        // or backfilled from an existing membership.
                        return;
                    }

                    await ensureDefaultOrganizationForUser(auth as any, user.id, user.email);
                    console.log(`[auth] user ${user.email} verified by email, default organization created via afterEmailVerification`);
                },
            },

            socialProviders: {
                github: {
                    clientId: process.env.GITHUB_CLIENT_ID as string,
                    clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
                },
                google: {
                    clientId: process.env.GOOGLE_CLIENT_ID as string,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
                },
            },
        });

        return auth;
    })();
}

const getCachedAuth = createCachedAsyncFactory(createAuth);

export async function getAuth() {
    return getCachedAuth();
}
