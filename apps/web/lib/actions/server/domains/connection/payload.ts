import { z } from 'zod';
import { createCredentiallessDefaultIdentity, isCredentiallessConnection } from '@/lib/connection/credentialless-identity';

type UnknownRecord = Record<string, unknown>;

const inlineIdentityKeys = new Set(['identity', 'identities', 'username', 'password', 'role', 'isDefault', 'enabled']);
const sidecarKeys = new Set(['ssh', 'tls', 'timeout']);

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stripConnectionSidecars(value: UnknownRecord) {
    const connection: UnknownRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        if (!inlineIdentityKeys.has(key) && !sidecarKeys.has(key)) {
            connection[key] = entry;
        }
    }
    return connection;
}

function deriveIdentity(value: UnknownRecord) {
    const username = typeof value.username === 'string' ? value.username.trim() : '';
    const password = typeof value.password === 'string' ? value.password : undefined;
    if (!username && typeof password === 'undefined') return null;

    return {
        name: typeof value.identityName === 'string' && value.identityName.trim() ? value.identityName.trim() : 'Default',
        username,
        password,
        role: typeof value.role === 'string' ? value.role : undefined,
        isDefault: typeof value.isDefault === 'boolean' ? value.isDefault : true,
        database: typeof value.database === 'string' ? value.database : null,
        enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    };
}

function normalizeIdentities(payload: UnknownRecord, connection: UnknownRecord) {
    if (Array.isArray(payload.identities)) return payload.identities;
    if (isRecord(payload.identity)) return [payload.identity];

    const inlineIdentity = deriveIdentity(connection);
    return inlineIdentity ? [inlineIdentity] : [];
}

function normalizeCreateIdentities(payload: UnknownRecord, connection: UnknownRecord) {
    const identities = normalizeIdentities(payload, connection);
    if (identities.length > 0 || !isCredentiallessConnection(connection)) return identities;
    return [createCredentiallessDefaultIdentity(connection)];
}

function normalizeUpdateIdentities(patch: UnknownRecord, connection: UnknownRecord) {
    const identities = normalizeIdentities(patch, connection);
    if (identities.length > 0 || !isCredentiallessConnection(connection)) return identities;
    return [createCredentiallessDefaultIdentity(connection)];
}

function pickTestIdentity(payload: UnknownRecord, connection: UnknownRecord) {
    if (isRecord(payload.identity)) return payload.identity;
    if (Array.isArray(payload.identities)) {
        const records = payload.identities.filter(isRecord);
        return records.find(identity => identity.isDefault === true) ?? records[0] ?? null;
    }
    return deriveIdentity(connection) ?? (isCredentiallessConnection(connection) ? createCredentiallessDefaultIdentity(connection) : null);
}

function normalizedConnectionFromPayload(payload: UnknownRecord) {
    const rawConnection = isRecord(payload.connection) ? payload.connection : payload;
    return stripConnectionSidecars(rawConnection);
}

export function normalizeConnectionCreatePayload(value: unknown) {
    const payload = isRecord(value) ? value : {};
    const connection = normalizedConnectionFromPayload(payload);
    const rawConnection = isRecord(payload.connection) ? payload.connection : payload;
    return {
        ...payload,
        connection,
        identities: normalizeCreateIdentities(payload, rawConnection),
        ssh: payload.ssh ?? null,
        tls: payload.tls ?? null,
    };
}

export function normalizeConnectionTestPayload(value: unknown) {
    const payload = isRecord(value) ? value : {};
    const rawConnection = isRecord(payload.connection) ? payload.connection : payload;
    const connection = stripConnectionSidecars(rawConnection);
    return {
        ...payload,
        connection,
        identity: pickTestIdentity(payload, rawConnection) ?? {},
        ssh: payload.ssh ?? null,
        tls: payload.tls ?? null,
    };
}

export function normalizeConnectionUpdatePatch(value: unknown) {
    const patch = isRecord(value) ? value : {};
    const rawConnection = isRecord(patch.connection) ? patch.connection : patch;
    const normalized: UnknownRecord = {
        ...patch,
        connection: stripConnectionSidecars(rawConnection),
        identities: normalizeUpdateIdentities(patch, rawConnection),
    };

    if ('ssh' in patch) normalized.ssh = patch.ssh ?? null;
    if ('tls' in patch) normalized.tls = patch.tls ?? null;

    return normalized;
}

const connectionFieldsSchema = z
    .object({
        id: z.string().optional().describe('Existing connection id. Omit for connection.create.'),
        type: z.string().optional().describe('Driver type, for example postgres, mysql, clickhouse, sqlite, duckdb, or oracle.'),
        engine: z.string().optional().describe('Database engine. For Postgres use postgres. If omitted, Dory derives it from type when possible.'),
        name: z.string().optional().describe('Human-readable connection name.'),
        description: z.string().nullable().optional(),
        host: z.string().nullable().optional().describe('Database host, for example 127.0.0.1.'),
        port: z.number().int().nullable().optional().describe('Database TCP port, for example 5432.'),
        httpPort: z.number().int().nullable().optional().describe('Optional HTTP port for drivers that need one.'),
        database: z.string().nullable().optional().describe('Default database name.'),
        path: z.string().nullable().optional().describe('Local database file path for file-backed drivers.'),
        environment: z.string().optional().describe('Optional environment label such as local, staging, or production.'),
        tags: z.string().optional().describe('Optional serialized tags.'),
        options: z.string().optional().describe('Optional serialized driver options JSON.'),
        username: z.string().optional().describe('Convenience inline identity username. Dory moves this to identities[0].'),
        password: z.string().optional().describe('Convenience inline identity password. Dory stores this as an identity secret.'),
    })
    .passthrough()
    .describe('Connection fields. For agents, prefer wrapping these under payload.connection.');

const connectionIdentitySchema = z
    .object({
        id: z.string().optional(),
        name: z.string().optional().describe('Identity label, usually Default.'),
        username: z.string().optional().describe('Database username.'),
        password: z.string().nullable().optional().describe('Database password or secret value.'),
        role: z.string().nullable().optional(),
        database: z.string().nullable().optional().describe('Database for this identity.'),
        isDefault: z.boolean().optional(),
        enabled: z.boolean().optional(),
        status: z.string().optional(),
        options: z.string().optional(),
    })
    .passthrough();

const connectionSshSchema = z.record(z.string(), z.unknown()).nullable().optional().describe('Optional SSH tunnel config, or null.');
const connectionTlsSchema = z.record(z.string(), z.unknown()).nullable().optional().describe('Optional TLS config, or null.');

export const connectionCreatePayloadSchema = z
    .object({
        connection: connectionFieldsSchema.optional().describe('Connection object to save. Required for the canonical shape.'),
        identities: z.array(connectionIdentitySchema).optional().describe('Connection identities. Include one default identity for username/password credentials.'),
        identity: connectionIdentitySchema.optional().describe('Convenience single identity; Dory converts it to identities[0].'),
        ssh: connectionSshSchema,
        tls: connectionTlsSchema,
    })
    .passthrough()
    .describe(
        'Dory connection creation payload. Canonical shape is { connection: { type, engine, name, host, port, database }, identities: [{ name, username, password, isDefault, database, enabled }], ssh: null, tls: null }. Convenience flat fields like username/password are accepted and normalized. SQLite connections may omit identities; Dory creates a default sqlite identity for query execution.',
    );

export const connectionTestPayloadSchema = z
    .object({
        connection: connectionFieldsSchema.optional().describe('Connection object to test.'),
        identity: connectionIdentitySchema.optional().describe('Identity to test with. If omitted, Dory uses the default item from identities.'),
        identities: z.array(connectionIdentitySchema).optional().describe('Optional identities array; Dory uses the default item or first item.'),
        ssh: connectionSshSchema,
        tls: connectionTlsSchema,
        timeout: z.number().int().positive().optional(),
    })
    .passthrough()
    .describe(
        'Dory connection test payload. Canonical shape is { connection: { type, engine, name, host, port, database }, identity: { username, password, database }, ssh: null, tls: null }. A create-style identities array is also accepted.',
    );

export const connectionPatchSchema = connectionCreatePayloadSchema.describe(
    'Partial Dory connection update payload. Include only fields to update; the same connection/identities/ssh/tls shape as connection.create is accepted.',
);
