import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { newEntityId } from '@/lib/id';

/**
 * User table: users can join multiple organizations/organizations.
 */
export const user = pgTable('user', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newEntityId()),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),

    emailVerified: boolean('email_verified')
        .$defaultFn(() => false)
        .notNull(),
    image: text('image'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Session table: bind to user and optionally the currently active organization.
 */
export const session = pgTable('session', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newEntityId()),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    activeOrganizationId: text('active_organization_id'),
});

/**
 * Third-party account binding: userId only, no organizationId
 */
export const account = pgTable('account', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newEntityId()),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),

    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Verification table (email codes, password reset, etc.)
 * No organizationId needed
 */
export const verification = pgTable('verification', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newEntityId()),
    identifier: text('identifier').notNull(), // e.g. email
    value: text('value').notNull(), // token / code
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Organization invitations used by better-auth organization plugin.
 * We do not enable nested organizations yet, so organizationId is intentionally omitted.
 */
export const invitation = pgTable(
    'invitation',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        email: text('email').notNull(),
        role: text('role').notNull(),
        status: text('status').notNull().default('pending'),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        inviterId: text('inviter_id').notNull(),
    },
    table => ({
        organizationIdIdx: index('idx_invitation_organization_id').on(table.organizationId),
        emailIdx: index('idx_invitation_email').on(table.email),
        statusIdx: index('idx_invitation_status').on(table.status),
    }),
);

/**
 * JWKS (for Better Auth JWT plugin signing/verification)
 */
export const jwks = pgTable('jwks', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newEntityId()),
    alg: text('alg'),
    crv: text('crv'),
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
});
