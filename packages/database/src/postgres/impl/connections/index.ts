import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { connections, connectionIdentities, connectionIdentitySecrets, connectionSsh, connectionTls } from '@dory/database/postgres/schemas/connections';
import { getDBEngineViaType } from '@dory/database/utils';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { decrypt, encrypt } from '@dory/shared/utils/crypto';
import type { PostgresDBClient } from '@dory/shared';
import { translateDatabase } from '@dory/database/i18n';
import { isDesktopRuntime } from '@dory/shared/runtime';

import type {
    ConnectionIdentitySecret,
    ConnectionIdentityStatus,
    ConnectionSsh,
    ConnectionListItem,
    ConnectionIdentityCreateInput,
    ConnectionIdentitySecretUpsertInput,
    ConnectionSshUpsertInput,
    ConnectionPayload,
    ConnectionListIdentity,
    ConnectionItem,
    ConnectionIdentityUpdateInput,
    ConnectionTls,
    ConnectionTlsUpsertInput,
} from '@dory/shared/types/connections';
import { DbExecutor } from '@dory/database/types';
import { getClient } from '../../client';

export class ConnectionDuplicateNameError extends Error {
    constructor(message = translateDatabase('Database.Errors.ConnectionDuplicateName')) {
        super(message);
        this.name = 'ConnectionDuplicateNameError';
    }
}

export class ConnectionNotFoundError extends Error {
    constructor(message = translateDatabase('Database.Errors.ConnectionNotFound')) {
        super(message);
        this.name = 'ConnectionNotFoundError';
    }
}

export class ConnectionIdentityValidationError extends Error {
    constructor(message = translateDatabase('Database.Errors.ConnectionIdentityInvalid')) {
        super(message);
        this.name = 'ConnectionIdentityValidationError';
    }
}

export class PostgresConnectionsRepository {
    private db!: PostgresDBClient;

    async init() {
        try {
            const client = await getClient();
            if (!client) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
            this.db = client as PostgresDBClient;

            if (isDesktopRuntime()) {
                try {
                    await this.db.execute(sql`ALTER TABLE "connections" DROP CONSTRAINT IF EXISTS "connections_created_by_user_id_user_id_fk"`);
                } catch (error) {
                    console.warn('[db:init] skipped legacy desktop constraint cleanup:', error);
                }
            }
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    /* -------------------- List: returns ConnectionListItem[] -------------------- */

    async list(organizationId: string): Promise<ConnectionListItem[]> {
        // 1) Fetch all non-soft-deleted connections
        const connectionMap = new Map<string, any>();
        const rows = await this.db
            .select()
            .from(connections)
            .where(and(eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
            .orderBy(connections.createdAt);

        if (!rows.length) return [];
        for (const row of rows) {
            connectionMap.set(row.id, {
                id: row.id,
                host: row.host,
                port: row.port,
                httpPort: row.httpPort,
                database: row.database,
                path: row.path,
                options: row.options,
                configVersion: row.configVersion,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                type: row.type,
                engine: row.engine,
                name: row.name,
                description: row.description,
                status: row.status,
                lastCheckStatus: row.lastCheckStatus,
                lastCheckAt: row.lastCheckAt,
                lastCheckLatencyMs: row.lastCheckLatencyMs,
                lastCheckError: row.lastCheckError,
                environment: row.environment,
                tags: row.tags,
                lastUsedAt: row.lastUsedAt,
            });
        }

        const connectionIds = rows.map(r => r.id);
        if (!connectionIds.length) {
            console.log('No connectionIds, skip identity & ssh query');
            return [];
        }

        // 2) Fetch SSH config
        const sshRows = await this.db.select().from(connectionSsh).where(inArray(connectionSsh.connectionId, connectionIds));

        const sshMap = new Map<string, any>();
        for (const row of sshRows) {
            sshMap.set(row.connectionId, {
                connectionId: row.connectionId,
                enabled: row.enabled,
                host: row.host,
                port: row.port,
                username: row.username,
                authMethod: row.authMethod,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            });
        }

        const tlsRows = await this.db.select().from(connectionTls).where(inArray(connectionTls.connectionId, connectionIds));
        const tlsMap = new Map<string, ConnectionTls>();
        for (const row of tlsRows) {
            tlsMap.set(row.connectionId, this.toTlsConfig(row));
        }

        // 3) Fetch identities (for stats + list display)
        const identityRows = await this.db
            .select({
                id: connectionIdentities.id,
                connectionId: connectionIdentities.connectionId,
                name: connectionIdentities.name,
                username: connectionIdentities.username,
                role: connectionIdentities.role,
                isDefault: connectionIdentities.isDefault,
                database: connectionIdentities.database,
                updatedAt: connectionIdentities.updatedAt,
            })
            .from(connectionIdentities)
            .where(and(inArray(connectionIdentities.connectionId, connectionIds), isNull(connectionIdentities.deletedAt)));

        const aggMap = new Map<string, { count: number; defaultId: string | null }>();
        const identitiesMap = new Map<
            string,
            Array<{
                id: string;
                name: string;
                username: string;
                role: string | null;
                isDefault: boolean;
                database: string | null;
                updatedAt: Date;
            }>
        >();

        for (const row of identityRows) {
            // Aggregate identityCount + defaultIdentityId
            const agg = aggMap.get(row.connectionId) ?? { count: 0, defaultId: null };
            agg.count += 1;
            if (row.isDefault) agg.defaultId = row.id;
            aggMap.set(row.connectionId, agg);

            // Collect identities
            const list = identitiesMap.get(row.connectionId) ?? [];
            list.push({
                id: row.id,
                name: row.name,
                username: row.username,
                role: row.role,
                isDefault: row.isDefault,
                database: row.database,
                updatedAt: row.updatedAt,
            });
            identitiesMap.set(row.connectionId, list);
        }

        // 4) Build ConnectionListItem
        const result: ConnectionListItem[] = rows
            .map(row => {
                return {
                    connection: connectionMap.get(row.id),
                    identities: identitiesMap.get(row.id) ?? [],
                    ssh: sshMap.get(row.id) ?? null,
                    tls: tlsMap.get(row.id) ?? null,
                };
            })
            .filter(item => !this.isHiddenManagedConnection(item.connection));

        return result;
    }

    private parseConnectionOptions(raw: unknown): Record<string, unknown> {
        if (!raw) return {};
        if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
            } catch {
                return {};
            }
        }
        return {};
    }

    private isHiddenManagedConnection(connection: { type?: string | null; options?: string | null }) {
        const options = this.parseConnectionOptions(connection.options);
        if (connection.type !== 'duckdb' || options.managedBy !== 'local-files') return false;
        if (options.mode === 'localFilesWorkspace') return true;
        if (options.mode === 'localFilesDataset') {
            return typeof options.datasetId !== 'string' || !options.datasetId;
        }
        return false;
    }

    private isManagedLocalFilesDataset(connection: { type?: string | null; options?: string | null }) {
        const options = this.parseConnectionOptions(connection.options);
        return connection.type === 'duckdb' && options.managedBy === 'local-files' && options.mode === 'localFilesDataset';
    }

    private async getUniqueDuplicateName(db: DbExecutor, organizationId: string, sourceName: string) {
        const baseName = `${sourceName} copy`;
        const rows = await db
            .select({ name: connections.name })
            .from(connections)
            .where(and(eq(connections.organizationId, organizationId), isNull(connections.deletedAt)));
        const existingNames = new Set(rows.map(row => row.name));

        if (!existingNames.has(baseName)) return baseName;

        for (let index = 2; index < 1000; index += 1) {
            const candidate = `${baseName} ${index}`;
            if (!existingNames.has(candidate)) return candidate;
        }

        return `${baseName} ${Date.now()}`;
    }

    /* -------------------- Detail: single connection -------------------- */

    async getById(organizationId: string, connectionId: string, db: DbExecutor = this.db): Promise<ConnectionListItem | null> {
        const rows = await db
            .select()
            .from(connections)
            .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
            .limit(1);

        if (!rows[0]) return null;
        return this.toConnectionListItem(db, organizationId, rows[0]);
    }

    /* ---------------- Create: create Connection + default Identity + SSH -------------------- */

    async create(userId: string, organizationId: string, payload: ConnectionPayload): Promise<ConnectionListItem> {
        const { connection, identities, ssh, tls } = payload;
        try {
            return await this.db.transaction(async tx => {
                const engine = connection.engine ?? getDBEngineViaType(connection.type);
                const baseRecord = {
                    createdByUserId: userId,
                    ...connection,
                    organizationId,
                    engine,
                } as any;

                const [created] = await tx.insert(connections).values(baseRecord).returning();

                if (!created) {
                    throw new DatabaseError(translateDatabase('Database.Errors.ConnectionCreateFailed'), 500);
                }

                // SSH (optional)
                if (ssh) {
                    await this.saveSshConfig(tx, created.id, ssh);
                } else {
                    await tx.insert(connectionSsh).values({
                        connectionId: created.id,
                        enabled: false,
                    });
                }

                if (tls) {
                    await this.saveTlsConfig(tx, created.id, tls);
                }

                // Default identity (optional)
                if (identities && identities.length > 0) {
                    for (const identity of identities) {
                        let passwordEncrypted = null;
                        if (identity.password) {
                            passwordEncrypted = await encrypt(identity.password ?? '');
                        }
                        const savedIdentityWithSecret = {
                            ...identity,
                            secret: {
                                passwordEncrypted,
                            },
                        };
                        await this.createIdentityWithSecret(tx, userId, created.organizationId, created.id, savedIdentityWithSecret as any);
                    }
                }

                return this.getById(organizationId, created.id, tx) as Promise<ConnectionListItem>;
            });
        } catch (error: any) {
            const message = String(error?.message ?? '');
            if (message.includes('uniq_connections_team_name') || message.includes('duplicate key')) {
                throw new ConnectionDuplicateNameError();
            }
            throw error;
        }
    }

    async duplicate(userId: string, organizationId: string, connectionId: string): Promise<ConnectionListItem> {
        return this.db.transaction(async tx => {
            const [sourceConnection] = await tx
                .select()
                .from(connections)
                .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
                .limit(1);

            if (!sourceConnection) {
                throw new ConnectionNotFoundError();
            }

            if (this.isManagedLocalFilesDataset(sourceConnection)) {
                throw new DatabaseError(translateDatabase('Database.Errors.LocalFilesDuplicateUnsupported'), 400);
            }

            const duplicateName = await this.getUniqueDuplicateName(tx, organizationId, sourceConnection.name);
            const [createdConnection] = await tx
                .insert(connections)
                .values({
                    createdByUserId: userId,
                    organizationId,
                    type: sourceConnection.type,
                    engine: sourceConnection.engine,
                    name: duplicateName,
                    description: sourceConnection.description,
                    host: sourceConnection.host,
                    port: sourceConnection.port,
                    httpPort: sourceConnection.httpPort,
                    database: sourceConnection.database,
                    path: sourceConnection.path,
                    options: sourceConnection.options,
                    status: sourceConnection.status,
                    configVersion: sourceConnection.configVersion,
                    environment: sourceConnection.environment,
                    tags: sourceConnection.tags,
                })
                .returning();

            if (!createdConnection) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionCreateFailed'), 500);
            }

            const sourceSshRows = await tx.select().from(connectionSsh).where(eq(connectionSsh.connectionId, sourceConnection.id)).limit(1);
            const sourceSsh = sourceSshRows[0];
            if (sourceSsh) {
                await tx.insert(connectionSsh).values({
                    connectionId: createdConnection.id,
                    enabled: sourceSsh.enabled,
                    host: sourceSsh.host,
                    port: sourceSsh.port,
                    username: sourceSsh.username,
                    authMethod: sourceSsh.authMethod,
                    passwordEncrypted: sourceSsh.passwordEncrypted,
                    privateKeyEncrypted: sourceSsh.privateKeyEncrypted,
                    passphraseEncrypted: sourceSsh.passphraseEncrypted,
                });
            } else {
                await tx.insert(connectionSsh).values({
                    connectionId: createdConnection.id,
                    enabled: false,
                });
            }

            const sourceTlsRows = await tx.select().from(connectionTls).where(eq(connectionTls.connectionId, sourceConnection.id)).limit(1);
            const sourceTls = sourceTlsRows[0];
            if (sourceTls) {
                await tx.insert(connectionTls).values({
                    connectionId: createdConnection.id,
                    mode: sourceTls.mode,
                    caCertificatePath: sourceTls.caCertificatePath,
                    clientCertificatePath: sourceTls.clientCertificatePath,
                    clientPrivateKeyPath: sourceTls.clientPrivateKeyPath,
                    serverName: sourceTls.serverName,
                    ciphers: sourceTls.ciphers,
                    minVersion: sourceTls.minVersion,
                    maxVersion: sourceTls.maxVersion,
                    caCertificateEncrypted: sourceTls.caCertificateEncrypted,
                    clientCertificateEncrypted: sourceTls.clientCertificateEncrypted,
                    clientPrivateKeyEncrypted: sourceTls.clientPrivateKeyEncrypted,
                    clientPrivateKeyPassphraseEncrypted: sourceTls.clientPrivateKeyPassphraseEncrypted,
                });
            }

            const sourceIdentities = await tx
                .select()
                .from(connectionIdentities)
                .where(
                    and(
                        eq(connectionIdentities.connectionId, sourceConnection.id),
                        eq(connectionIdentities.organizationId, organizationId),
                        isNull(connectionIdentities.deletedAt),
                    ),
                );

            for (const sourceIdentity of sourceIdentities) {
                const [createdIdentity] = await tx
                    .insert(connectionIdentities)
                    .values({
                        createdByUserId: userId,
                        organizationId,
                        connectionId: createdConnection.id,
                        name: sourceIdentity.name,
                        username: sourceIdentity.username,
                        role: sourceIdentity.role,
                        options: sourceIdentity.options,
                        isDefault: sourceIdentity.isDefault,
                        enabled: sourceIdentity.enabled,
                        status: sourceIdentity.status,
                        database: sourceIdentity.database,
                    })
                    .returning();

                if (!createdIdentity) {
                    throw new DatabaseError(translateDatabase('Database.Errors.ConnectionIdentityCreateFailed'), 500);
                }

                const [sourceSecret] = await tx.select().from(connectionIdentitySecrets).where(eq(connectionIdentitySecrets.identityId, sourceIdentity.id)).limit(1);
                if (sourceSecret) {
                    await tx.insert(connectionIdentitySecrets).values({
                        identityId: createdIdentity.id,
                        passwordEncrypted: sourceSecret.passwordEncrypted,
                        vaultRef: sourceSecret.vaultRef,
                        secretRef: sourceSecret.secretRef,
                    });
                }
            }

            return this.toConnectionListItem(tx, organizationId, createdConnection);
        });
    }

    async update(organizationId: string, connectionId: string, payload: ConnectionPayload): Promise<ConnectionListItem> {
        const connectionPayload = { ...(payload.connection ?? {}) } as any;
        // Avoid writing id back
        if ('id' in connectionPayload) {
            delete connectionPayload.id;
        }

        if (connectionPayload.type) {
            connectionPayload.engine = getDBEngineViaType(connectionPayload.type);
        }

        const hasConnectionUpdates = Object.keys(connectionPayload).length > 0;
        const [updatedConnection] = hasConnectionUpdates
            ? await this.db
                  .update(connections)
                  .set(connectionPayload)
                  .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
                  .returning()
            : await this.db
                  .select()
                  .from(connections)
                  .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
                  .limit(1);

        if (!updatedConnection) {
            throw new ConnectionNotFoundError();
        }

        const sshPayload = payload.ssh;
        if (sshPayload) {
            await this.saveSshConfig(this.db, connectionId, sshPayload);
        }

        if (typeof payload.tls !== 'undefined') {
            await this.saveTlsConfig(this.db, connectionId, payload.tls);
        }

        if (payload.identities && payload.identities.length > 0) {
            for (const identity of payload.identities as any) {
                const { password, ...restIdentity } = identity;
                const secret =
                    typeof password === 'undefined' || (typeof password === 'string' && password.trim() === '')
                        ? undefined
                        : password === null
                          ? null
                          : { passwordEncrypted: await encrypt(password) };

                if (identity.id) {
                    await this.updateIdentityWithSecret(this.db, organizationId, connectionId, {
                        ...restIdentity,
                        id: identity.id,
                        secret,
                    } as any);
                } else {
                    await this.createIdentityWithSecret(this.db, null, organizationId, connectionId, {
                        ...restIdentity,
                        secret: secret ?? undefined,
                    } as any);
                }
            }
        }
        return this.toConnectionListItem(this.db, organizationId, updatedConnection);
    }

    async patchConnectionFields(organizationId: string, connectionId: string, payload: Partial<typeof connections.$inferInsert>): Promise<ConnectionListItem> {
        const [updatedConnection] = await this.db
            .update(connections)
            .set(payload)
            .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
            .returning();

        if (!updatedConnection) {
            throw new ConnectionNotFoundError();
        }

        return this.toConnectionListItem(this.db, organizationId, updatedConnection);
    }

    async delete(organizationId: string, connectionId: string): Promise<any> {
        const deleted = await this.db
            .delete(connections)
            .where(and(eq(connections.id, connectionId), eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
            .returning({ id: connections.id });

        if (!deleted[0]) {
            throw new ConnectionNotFoundError();
        }

        return deleted[0];
    }

    /**
     * Update last connectivity info
     * - status: unknown / ok / error
     */
    async updateLastCheck(
        connectionId: string,
        info: {
            status?: 'unknown' | 'ok' | 'error';
            tookMs?: number | null;
            error?: string | null;
            checkedAt?: Date | null;
            organizationId?: string;
        },
    ) {
        if (!connectionId) return;
        const payload: Partial<typeof connections.$inferInsert> = {};

        if (info.status) {
            const normalized = ['unknown', 'ok', 'error'].includes(info.status) ? info.status : 'unknown';
            payload.lastCheckStatus = normalized;
        }
        payload.lastCheckAt = info.checkedAt ?? new Date();

        if (typeof info.tookMs === 'number') {
            payload.lastCheckLatencyMs = info.tookMs;
        } else if (info.tookMs === null) {
            payload.lastCheckLatencyMs = null;
        }

        if (typeof info.error === 'string' || info.error === null) {
            const trimmed = typeof info.error === 'string' ? info.error.slice(0, 500) : info.error;
            payload.lastCheckError = trimmed ?? null;
        }

        if (!Object.keys(payload).length) return;

        const conditions = [eq(connections.id, connectionId)];
        if (info.organizationId) {
            conditions.push(eq(connections.organizationId, info.organizationId));
        }

        await this.db
            .update(connections)
            .set(payload)
            .where(and(...conditions));
    }

    async toConnectionListItem(db: DbExecutor, organizationId: string, row: any): Promise<ConnectionListItem> {
        // 1) SSH config
        const [sshRow] = await db.select().from(connectionSsh).where(eq(connectionSsh.connectionId, row.id)).limit(1);
        const sshConfig: ConnectionSsh | null = sshRow
            ? {
                  connectionId: sshRow.connectionId,
                  enabled: sshRow.enabled,
                  host: sshRow.host,
                  port: sshRow.port,
                  username: sshRow.username,
                  authMethod: sshRow.authMethod,
                  createdAt: sshRow.createdAt,
                  updatedAt: sshRow.updatedAt,
              }
            : null;

        const [tlsRow] = await db.select().from(connectionTls).where(eq(connectionTls.connectionId, row.id)).limit(1);
        const tlsConfig: ConnectionTls | null = tlsRow ? this.toTlsConfig(tlsRow) : null;

        // 2) Identities list
        const identityRows = await db
            .select({
                id: connectionIdentities.id,
                name: connectionIdentities.name,
                username: connectionIdentities.username,
                role: connectionIdentities.role,
                isDefault: connectionIdentities.isDefault,
                database: connectionIdentities.database,
                updatedAt: connectionIdentities.updatedAt,
            })
            .from(connectionIdentities)
            .where(and(eq(connectionIdentities.connectionId, row.id), isNull(connectionIdentities.deletedAt)));

        const identities: ConnectionListIdentity[] = identityRows.map(r => ({
            id: r.id,
            name: r.name,
            username: r.username,
            role: r.role,
            isDefault: r.isDefault,
            database: r.database,
            updatedAt: r.updatedAt,
        }));

        // 3) Build response
        const connection: ConnectionItem = {
            httpPort: row.httpPort,
            options: row.options,
            configVersion: row.configVersion,
            status: row.status,
            type: row.type,
            engine: row.engine,
            database: row.database,
            path: row.path,
            id: row.id,
            host: row.host,
            port: row.port,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            name: row.name,
            description: row.description,
            environment: row.environment,
            tags: row.tags,
            lastUsedAt: row.lastUsedAt,
            lastCheckStatus: row.lastCheckStatus,
            lastCheckAt: row.lastCheckAt,
            lastCheckLatencyMs: row.lastCheckLatencyMs,
            lastCheckError: row.lastCheckError,
        };

        return {
            connection,
            identities,
            ssh: sshConfig,
            tls: tlsConfig,
        };
    }

    /* -------------------- Private helpers: SSH / Identity creation -------------------- */

    /**
     * Save/update SSH config
     * Assumes passwordEncrypted / privateKeyEncrypted / passphraseEncrypted are already encrypted upstream
     */
    private async saveSshConfig(db: DbExecutor, connectionId: string, input: Omit<ConnectionSshUpsertInput, 'connectionId'>) {
        const payload: Record<string, unknown> = {};

        if (typeof input.enabled !== 'undefined') payload.enabled = Boolean(input.enabled);
        if (typeof input.host !== 'undefined') payload.host = input.host ?? null;
        if (typeof input.port !== 'undefined') payload.port = input.port ?? null;
        if (typeof input.username !== 'undefined') payload.username = input.username ?? null;
        if (typeof input.authMethod !== 'undefined') payload.authMethod = input.authMethod ?? null;

        if (typeof input.password !== 'undefined') {
            payload.passwordEncrypted = await encrypt(input.password ?? '');
        }
        if (typeof input.privateKey !== 'undefined') {
            payload.privateKeyEncrypted = await encrypt(input.privateKey ?? '');
        }
        if (typeof input.passphrase !== 'undefined') {
            payload.passphraseEncrypted = await encrypt(input.passphrase ?? '');
        }

        const existing = await db.select().from(connectionSsh).where(eq(connectionSsh.connectionId, connectionId)).limit(1);

        if (existing[0]) {
            if (Object.keys(payload).length === 0) return;
            await db.update(connectionSsh).set(payload).where(eq(connectionSsh.connectionId, connectionId));
            return;
        }

        await db.insert(connectionSsh).values({
            connectionId,
            enabled: false,
            ...payload,
        });
    }

    private toTlsConfig(row: typeof connectionTls.$inferSelect): ConnectionTls {
        return {
            connectionId: row.connectionId,
            mode: row.mode as ConnectionTls['mode'],
            caCertificatePath: row.caCertificatePath,
            clientCertificatePath: row.clientCertificatePath,
            clientPrivateKeyPath: row.clientPrivateKeyPath,
            serverName: row.serverName,
            ciphers: row.ciphers,
            minVersion: row.minVersion,
            maxVersion: row.maxVersion,
            hasCaCertificateContent: Boolean(row.caCertificateEncrypted),
            hasClientCertificateContent: Boolean(row.clientCertificateEncrypted),
            hasClientPrivateKeyContent: Boolean(row.clientPrivateKeyEncrypted),
            hasClientPrivateKeyPassphrase: Boolean(row.clientPrivateKeyPassphraseEncrypted),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    private async saveTlsConfig(db: DbExecutor, connectionId: string, input: Omit<ConnectionTlsUpsertInput, 'connectionId'> | null) {
        if (!input) {
            await (db as any).delete(connectionTls).where(eq(connectionTls.connectionId, connectionId));
            return;
        }

        const payload: Record<string, unknown> = {};
        if (typeof input.mode !== 'undefined') payload.mode = input.mode ?? 'disable';
        if (typeof input.caCertificatePath !== 'undefined') payload.caCertificatePath = input.caCertificatePath ?? null;
        if (typeof input.clientCertificatePath !== 'undefined') payload.clientCertificatePath = input.clientCertificatePath ?? null;
        if (typeof input.clientPrivateKeyPath !== 'undefined') payload.clientPrivateKeyPath = input.clientPrivateKeyPath ?? null;
        if (typeof input.serverName !== 'undefined') payload.serverName = input.serverName ?? null;
        if (typeof input.ciphers !== 'undefined') payload.ciphers = input.ciphers ?? null;
        if (typeof input.minVersion !== 'undefined') payload.minVersion = input.minVersion ?? null;
        if (typeof input.maxVersion !== 'undefined') payload.maxVersion = input.maxVersion ?? null;

        if (typeof input.caCertificateContent !== 'undefined') {
            payload.caCertificateEncrypted = input.caCertificateContent ? await encrypt(input.caCertificateContent) : null;
        }
        if (typeof input.clientCertificateContent !== 'undefined') {
            payload.clientCertificateEncrypted = input.clientCertificateContent ? await encrypt(input.clientCertificateContent) : null;
        }
        if (typeof input.clientPrivateKeyContent !== 'undefined') {
            payload.clientPrivateKeyEncrypted = input.clientPrivateKeyContent ? await encrypt(input.clientPrivateKeyContent) : null;
        }
        if (typeof input.clientPrivateKeyPassphrase !== 'undefined') {
            payload.clientPrivateKeyPassphraseEncrypted = input.clientPrivateKeyPassphrase ? await encrypt(input.clientPrivateKeyPassphrase) : null;
        }

        const existing = await db.select().from(connectionTls).where(eq(connectionTls.connectionId, connectionId)).limit(1);

        if (existing[0]) {
            if (Object.keys(payload).length === 0) return;
            await db.update(connectionTls).set(payload).where(eq(connectionTls.connectionId, connectionId));
            return;
        }

        await db.insert(connectionTls).values({
            connectionId,
            mode: 'disable',
            ...payload,
        });
    }

    /**
     * Create identity + secret (for create)
     * Incoming secret fields are already *Encrypted
     */
    private async createIdentityWithSecret(
        db: DbExecutor,
        userId: string | null,
        organizationId: string,
        connectionId: string,
        payload: ConnectionIdentityCreateInput & {
            secret?: Omit<ConnectionIdentitySecretUpsertInput, 'identityId'>;
        },
    ) {
        if (!payload.name || !payload.username) {
            throw new ConnectionIdentityValidationError();
        }

        const [identity] = await db
            .insert(connectionIdentities)
            .values({
                createdByUserId: userId,
                organizationId,
                connectionId,
                name: payload.name,
                username: payload.username,
                role: payload.role ?? null,
                options: payload.options ?? '{}',
                isDefault: payload.isDefault ?? true,
                enabled: typeof payload.enabled === 'boolean' ? payload.enabled : true,
                status: (payload.status ?? 'active') as ConnectionIdentityStatus,
                database: payload.database ?? null,
            })
            .returning();

        if (!identity) {
            throw new DatabaseError(translateDatabase('Database.Errors.ConnectionIdentityCreateFailed'), 500);
        }

        if (payload.secret) {
            const secret: ConnectionIdentitySecret = {
                identityId: identity.id,
                passwordEncrypted: payload.secret.passwordEncrypted ?? null,
                vaultRef: payload.secret.vaultRef ?? null,
                secretRef: payload.secret.secretRef ?? null,
            } as any;

            await db.insert(connectionIdentitySecrets).values(secret);
        }
    }

    /**
     * Update identity + secret
     * - payload.id is required
     * - other fields optional; only update provided fields
     * - secret rules:
     *   - secret === undefined: no change
     *   - secret === null: delete existing secret
     *   - secret object: insert/update
     */
    private async updateIdentityWithSecret(
        db: DbExecutor,
        organizationId: string,
        connectionId: string,
        payload: ConnectionIdentityUpdateInput & {
            id: string; // 👈 Update requires id
            secret?: Omit<ConnectionIdentitySecretUpsertInput, 'identityId'> | null;
        },
    ) {
        if (!payload.id) {
            throw new ConnectionIdentityValidationError(translateDatabase('Database.Errors.ConnectionIdentityMissingId'));
        }

        // Basic validation: name/username cannot be empty if provided
        if (payload.name !== undefined && !payload.name) {
            throw new ConnectionIdentityValidationError(translateDatabase('Database.Errors.ConnectionIdentityNameRequired'));
        }
        if (payload.username !== undefined && !payload.username) {
            throw new ConnectionIdentityValidationError(translateDatabase('Database.Errors.ConnectionIdentityUsernameRequired'));
        }

        // -------- 1. Build update fields (partial update) --------
        const updateData: Partial<typeof connectionIdentities.$inferInsert> = {};

        if (payload.name !== undefined) updateData.name = payload.name;
        if (payload.username !== undefined) updateData.username = payload.username;
        if (payload.role !== undefined) updateData.role = payload.role ?? null;
        if (payload.options !== undefined) updateData.options = payload.options ?? '{}';
        if (payload.isDefault !== undefined) updateData.isDefault = payload.isDefault;
        if (payload.enabled !== undefined) updateData.enabled = payload.enabled;
        if (payload.status !== undefined) {
            updateData.status = payload.status as ConnectionIdentityStatus;
        }
        if (payload.database !== undefined) updateData.database = payload.database ?? null;
        updateData.updatedAt = new Date();

        // Allow only secret updates even if no other fields are provided
        const [identity] = await db
            .update(connectionIdentities)
            .set(updateData)
            .where(
                and(
                    eq(connectionIdentities.id, payload.id),
                    eq(connectionIdentities.organizationId, organizationId),
                    eq(connectionIdentities.connectionId, connectionId),
                    isNull(connectionIdentities.deletedAt),
                ),
            )
            .returning();

        if (!identity) {
            throw new DatabaseError(translateDatabase('Database.Errors.ConnectionIdentityUpdateFailed'), 404);
        }

        // -------- 2. Secret logic --------
        // secret === undefined -> no change
        if (typeof payload.secret === 'undefined') {
            return;
        }

        // Check existing secret
        const [existing] = await db.select().from(connectionIdentitySecrets).where(eq(connectionIdentitySecrets.identityId, identity.id));

        if (payload.secret === null) {
            await (db as any).delete(connectionIdentitySecrets).where(eq(connectionIdentitySecrets.identityId, identity.id));
            return null;
        }
        // Has object -> upsert
        const secret: ConnectionIdentitySecret = {
            identityId: identity.id,
            passwordEncrypted: payload.secret?.passwordEncrypted ?? null,
            vaultRef: payload.secret.vaultRef ?? null,
            secretRef: payload.secret.secretRef ?? null,
        } as any;

        if (existing) {
            return await db.update(connectionIdentitySecrets).set(secret).where(eq(connectionIdentitySecrets.identityId, identity.id));
        }

        return await db.insert(connectionIdentitySecrets).values(secret);
    }

    /**
     * Decrypt plaintext password by identityId (for testConnection)
     */
    async getIdentityPlainPassword(organizationId: string, identityId: string): Promise<string | null> {
        const [secret] = await this.db
            .select({
                passwordEncrypted: connectionIdentitySecrets.passwordEncrypted,
            })
            .from(connectionIdentitySecrets)
            .innerJoin(connectionIdentities, eq(connectionIdentitySecrets.identityId, connectionIdentities.id))
            .innerJoin(connections, eq(connectionIdentities.connectionId, connections.id))
            .where(
                and(
                    eq(connectionIdentitySecrets.identityId, identityId),
                    eq(connectionIdentities.organizationId, organizationId),
                    eq(connections.organizationId, organizationId),
                    isNull(connectionIdentities.deletedAt),
                    isNull(connections.deletedAt),
                ),
            )
            .limit(1);

        if (!secret || !secret.passwordEncrypted) return null;

        try {
            return await decrypt(secret.passwordEncrypted);
        } catch (e) {
            console.error('[connections] decrypt identity password failed', e);
            return null;
        }
    }

    /**
     * Decrypt SSH credentials by connectionId (for testConnection)
     */
    async getSshPlainSecrets(organizationId: string, connectionId: string): Promise<{ password: string | null; privateKey: string | null; passphrase: string | null } | null> {
        const [sshRow] = await this.db
            .select({
                passwordEncrypted: connectionSsh.passwordEncrypted,
                privateKeyEncrypted: connectionSsh.privateKeyEncrypted,
                passphraseEncrypted: connectionSsh.passphraseEncrypted,
            })
            .from(connectionSsh)
            .innerJoin(connections, eq(connectionSsh.connectionId, connections.id))
            .where(and(eq(connectionSsh.connectionId, connectionId), eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
            .limit(1);
        if (!sshRow) return null;

        const safeDecrypt = async (cipher?: string | null) => {
            if (!cipher) return null;
            try {
                return await decrypt(cipher);
            } catch (e) {
                console.error('[connections] decrypt ssh secret failed', e);
                return null;
            }
        };

        return {
            password: await safeDecrypt(sshRow.passwordEncrypted),
            privateKey: await safeDecrypt(sshRow.privateKeyEncrypted),
            passphrase: await safeDecrypt(sshRow.passphraseEncrypted),
        };
    }

    async getTlsPlainSecrets(
        organizationId: string,
        connectionId: string,
    ): Promise<{
        caCertificateContent: string | null;
        clientCertificateContent: string | null;
        clientPrivateKeyContent: string | null;
        clientPrivateKeyPassphrase: string | null;
    } | null> {
        const [tlsRow] = await this.db
            .select({
                caCertificateEncrypted: connectionTls.caCertificateEncrypted,
                clientCertificateEncrypted: connectionTls.clientCertificateEncrypted,
                clientPrivateKeyEncrypted: connectionTls.clientPrivateKeyEncrypted,
                clientPrivateKeyPassphraseEncrypted: connectionTls.clientPrivateKeyPassphraseEncrypted,
            })
            .from(connectionTls)
            .innerJoin(connections, eq(connectionTls.connectionId, connections.id))
            .where(and(eq(connectionTls.connectionId, connectionId), eq(connections.organizationId, organizationId), isNull(connections.deletedAt)))
            .limit(1);
        if (!tlsRow) return null;

        const safeDecrypt = async (cipher?: string | null) => {
            if (!cipher) return null;
            try {
                return await decrypt(cipher);
            } catch (e) {
                console.error('[connections] decrypt tls secret failed', e);
                return null;
            }
        };

        return {
            caCertificateContent: await safeDecrypt(tlsRow.caCertificateEncrypted),
            clientCertificateContent: await safeDecrypt(tlsRow.clientCertificateEncrypted),
            clientPrivateKeyContent: await safeDecrypt(tlsRow.clientPrivateKeyEncrypted),
            clientPrivateKeyPassphrase: await safeDecrypt(tlsRow.clientPrivateKeyPassphraseEncrypted),
        };
    }
}
