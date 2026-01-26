import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { newEntityId } from '@/lib/id';
import { teams } from './teams/teams';

/**
 * User table: users can join multiple teams
 * Keep defaultTeamId as the current/default team
 */
export const user = pgTable('user', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newEntityId()),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),

    // Default team (nullable; set when user first joins a team)
    defaultTeamId: text('default_team_id').references(() => teams.id),

    emailVerified: boolean('email_verified')
        .$defaultFn(() => false)
        .notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Session table: bind to user, not required to bind team
 * Current team via cookie/header, or user.defaultTeamId
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
});

/**
 * Third-party account binding: userId only, no teamId
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
 * No teamId needed
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
