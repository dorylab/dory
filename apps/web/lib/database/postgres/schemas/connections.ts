import { boolean, integer, text, timestamp, pgTable, check, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { newEntityId } from '@/lib/id';
import { user } from './auth-schema';
import { teams } from './teams/teams';

export type ConnectionType = 'clickhouse' | 'doris' | 'mysql' | 'postgres';
export type ConnectionStatus = 'draft' | 'ready' | 'error' | 'disabled';

export const connections = pgTable(
    'connections',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),

        // Creator (nullable)
        createdByUserId: text('created_by_user_id').references(() => user.id, {
            onDelete: 'set null',
        }),

        // Team-scoped resource
        teamId: text('team_id')
            .notNull()
            .references(() => teams.id, { onDelete: 'cascade' }),

        type: text('type').notNull(),

        engine: text('engine').notNull(),

        name: text('name').notNull().default('Untitled connection'),
        description: text('description'),

        host: text('host').notNull(),
        port: integer('port').notNull(),
        httpPort: integer('http_port'),
        database: text('database'),

        // Extended config:
        // App layer handles JSON.parse / JSON.stringify
        options: text('options').notNull().default('{}'),

        // draft / ready / error / disabled ...
        status: text('status').notNull().default('draft'),

        configVersion: integer('config_version').notNull().default(1),

        validationErrors: text('validation_errors').default('{}'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
        lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

        // —— Latest connectivity info (display only, not real-time) ——
        // unknown / ok / error
        lastCheckStatus: text('last_check_status').notNull().default('unknown'),
        // Last check time
        lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
        // Last check latency (ms)
        lastCheckLatencyMs: integer('last_check_latency_ms'),
        // Last error message (trim to UI-friendly length)
        lastCheckError: text('last_check_error'),

        // Environment: dev / staging / prod / personal / shared ...
        environment: text('environment').default(''),

        // Free-form tags: comma-separated; app parses
        tags: text('tags').notNull().default(''),
    },
    t => [
        // Name unique within team (excluding soft-deleted)
        uniqueIndex('uniq_connections_team_name')
            .on(t.teamId, t.name)
            .where(sql`${t.deletedAt} IS NULL`),

        index('idx_connections_team_id_status').on(t.teamId, t.status),
        index('idx_connections_created_by_user_id').on(t.createdByUserId),

        index('idx_connections_team_env').on(t.teamId, t.environment),

        check('chk_connections_port', sql`${t.port} IS NULL OR (${t.port} BETWEEN 1 AND 65535)`),
        check('chk_connections_http_port', sql`${t.httpPort} IS NULL OR (${t.httpPort} BETWEEN 1 AND 65535)`),
    ],
);

export type ConnectionIdentityStatus = 'active' | 'disabled';

export const connectionIdentities = pgTable(
    'connection_identities',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),

        connectionId: text('connection_id')
            .notNull()
            .references(() => connections.id, { onDelete: 'cascade' }),

        // Redundant teamId for permission checks/queries
        teamId: text('team_id')
            .notNull()
            .references(() => teams.id, { onDelete: 'cascade' }),

        // Display name for users, e.g. "Admin", "Read-only analyst"
        name: text('name').notNull(),

        // Actual DB username
        username: text('username').notNull(),

        // DB role/profile (optional)
        role: text('role'),

        // Extra settings: readonly flag, default schema, session params
        options: text('options').notNull().default('{}'),

        // At most one isDefault per connection
        isDefault: boolean('is_default').notNull().default(false),

        database: text('database'),

        // Identity enabled
        enabled: boolean('enabled').notNull().default(true),

        status: text('status').notNull().default('active'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    t => [
        // Name unique within connection (excluding soft-deleted)
        uniqueIndex('uniq_conn_identity_connection_name')
            .on(t.connectionId, t.name)
            .where(sql`${t.deletedAt} IS NULL`),

        // Only one default identity per connection
        uniqueIndex('uniq_conn_identity_default_per_connection')
            .on(t.connectionId)
            .where(sql`${t.isDefault} = true`),

        // Environment-level filter index

        index('idx_conn_identity_connection_id').on(t.connectionId),
        index('idx_conn_identity_team_id').on(t.teamId),
        index('idx_conn_identity_enabled').on(t.enabled),
    ],
);

export const connectionIdentitySecrets = pgTable(
    'connection_identity_secrets',
    {
        identityId: text('identity_id')
            .primaryKey()
            .references(() => connectionIdentities.id, { onDelete: 'cascade' }),

        // Encrypted password; app handles encrypt/decrypt
        passwordEncrypted: text('password_encrypted'),

        // For future KMS/Vault integration, store reference here
        vaultRef: text('vault_ref'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
    },
    () => [],
);

export const connectionSsh = pgTable(
    'connection_ssh',
    {
        connectionId: text('connection_id')
            .primaryKey()
            .references(() => connections.id, { onDelete: 'cascade' }),

        enabled: boolean('enabled').notNull().default(false),

        host: text('host'),
        port: integer('port'),
        username: text('username'),
        authMethod: text('auth_method'), // password / private_key / agent ...

        passwordEncrypted: text('password_encrypted'),
        privateKeyEncrypted: text('private_key_encrypted'),
        passphraseEncrypted: text('passphrase_encrypted'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
    },
    t => [check('chk_connection_ssh_port', sql`${t.port} IS NULL OR (${t.port} BETWEEN 1 AND 65535)`)],
);
