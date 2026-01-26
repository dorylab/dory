import { and, eq, inArray, isNull } from 'drizzle-orm';

import { connections, connectionIdentities, connectionIdentitySecrets, connectionSsh } from '@/lib/database/postgres/schemas/connections';
import { getDBEngineViaType } from '@/lib/database/utils';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import { decrypt, encrypt } from '@/lib/utils/crypto';
import type { PostgresDBClient } from '@/types';
import { translateDatabase } from '@/lib/database/i18n';

import type {
    ConnectionIdentity,
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
} from '@/types/connections';
import { DbExecutor } from '@/lib/database/types';
import { teamMembers } from '../../schemas';
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
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    /* -------------------- List: returns ConnectionListItem[] -------------------- */

    async list(teamId: string): Promise<ConnectionListItem[]> {
        // 1) Fetch all non-soft-deleted connections
        const connectionMap = new Map<string, any>();
        const rows = await this.db
            .select()
            .from(connections)
            .where(and(eq(connections.teamId, teamId), isNull(connections.deletedAt)))
            .orderBy(connections.createdAt);

        if (!rows.length) return [];
        for (const row of rows) {
            connectionMap.set(row.id, {
                id: row.id,
                host: row.host,
                port: row.port,
                httpPort: row.httpPort,
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
            });
            identitiesMap.set(row.connectionId, list);
        }

        // 4) Build ConnectionListItem
        const result: ConnectionListItem[] = rows.map(row => {
            return {
                connection: connectionMap.get(row.id),
                identities: identitiesMap.get(row.id) ?? [],
                ssh: sshMap.get(row.id) ?? null,
            };
        });

        return result;
    }

    /* -------------------- Detail: single connection -------------------- */

    async getById(teamId: string, connectionId: string, db: DbExecutor = this.db): Promise<ConnectionListItem | null> {
        const rows = await db
            .select()
            .from(connections)
            .where(and(eq(connections.id, connectionId), eq(connections.teamId, teamId), isNull(connections.deletedAt)))
            .limit(1);

        if (!rows[0]) return null;
        return this.toConnectionListItem(db, teamId, rows[0]);
    }

    /* ---------------- Create: create Connection + default Identity + SSH -------------------- */

    async create(userId: string, teamId: string, payload: ConnectionPayload): Promise<ConnectionListItem> {
        const { connection, identities, ssh } = payload;
        try {
            return await this.db.transaction(async tx => {
                const engine = connection.engine ?? getDBEngineViaType(connection.type);
                const baseRecord = {
                    createdByUserId: userId,
                    ...connection,
                    teamId,
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
                        }
                        await this.createIdentityWithSecret(tx, created.teamId, created.id, savedIdentityWithSecret as any);
                    }
                }

                return this.getById(teamId, created.id, tx) as Promise<ConnectionListItem>;
            });
        } catch (error: any) {
            const message = String(error?.message ?? '');
            if (message.includes('uniq_connections_team_name') || message.includes('duplicate key')) {
                throw new ConnectionDuplicateNameError();
            }
            throw error;
        }
    }

    async update(userId: string, teamId: string, connectionId: string, payload: ConnectionPayload): Promise<any> {
        console.log('Updating connection with payload:', payload);
        const [member] = await this.db
            .select()
            .from(teamMembers)
            .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)))
            .limit(1);
        if (!member) {
            throw new DatabaseError(translateDatabase('Database.Errors.NotTeamMember'), 401);
        }
        if (member.role !== 'admin' && member.role !== 'owner') {
            throw new DatabaseError(translateDatabase('Database.Errors.NotAdmin'), 401);
        }
        const connectionPayload = { ...payload.connection } as any;
        // Avoid writing id back
        if ('id' in connectionPayload) {
            delete connectionPayload.id;
        }

        const [updatedConnection] = await this.db
            .update(connections)
            .set(connectionPayload)
            .where(eq(connections.id, connectionId))
            .returning();

        const sshPayload = payload.ssh;
        if (sshPayload) {
            // Prefer client-provided connectionId; fallback to param
            const sshConnectionId = (sshPayload as any)?.connectionId ?? connectionId;
            await this.saveSshConfig(this.db, sshConnectionId, sshPayload);
        }

        if (payload.identities && payload.identities.length > 0) {
            for (const identity of payload.identities as any) {
                if (!identity.id) {
                    throw new ConnectionIdentityValidationError(
                        translateDatabase('Database.Errors.ConnectionIdentityUpdateRequiresId'),
                    );
                }

                const { password, ...restIdentity } = identity;
                const secret =
                    typeof password === 'undefined' ? undefined : { passwordEncrypted: await encrypt(password ?? '') };

                await this.updateIdentityWithSecret(this.db, teamId, connectionId, {
                    ...restIdentity,
                    id: identity.id,
                    secret,
                } as any);
            }
        }
        return updatedConnection;
    }


    async delete(userId: string, teamId: string, connectionId: string): Promise<any> {
        const [member] = await this.db
            .select()
            .from(teamMembers)
            .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)))
            .limit(1);
        if (!member) {
            throw new DatabaseError(translateDatabase('Database.Errors.NotTeamMember'), 401);
        }
        if (member.role !== 'admin' && member.role !== 'owner') {
            throw new DatabaseError(translateDatabase('Database.Errors.NotAdmin'), 401);
        }
        const result = await this.db.delete(connections).where(eq(connections.id, connectionId));
        return result;
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
            teamId?: string;
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
        if (info.teamId) {
            conditions.push(eq(connections.teamId, info.teamId));
        }

        await this.db
            .update(connections)
            .set(payload)
            .where(and(...conditions));
    }


    async toConnectionListItem(db: DbExecutor, teamId: string, row: any): Promise<ConnectionListItem> {
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

        // 2) Identities list
        const identityRows = await db
            .select({
                id: connectionIdentities.id,
                name: connectionIdentities.name,
                username: connectionIdentities.username,
                role: connectionIdentities.role,
                isDefault: connectionIdentities.isDefault,
                database: connectionIdentities.database,
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


    /**
     * Create identity + secret (for create)
     * Incoming secret fields are already *Encrypted
     */
    private async createIdentityWithSecret(
        db: DbExecutor,
        teamId: string,
        connectionId: string,
        payload: ConnectionIdentityCreateInput & {
            secret?: Omit<ConnectionIdentitySecretUpsertInput, 'identityId'>;
        },
    ) {
        console.log('Creating identity with payload:', payload);
        if (!payload.name || !payload.username) {
            throw new ConnectionIdentityValidationError();
        }

        const [identity] = await db
            .insert(connectionIdentities)
            .values({
                teamId,
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
        teamId: string,
        connectionId: string,
        payload: ConnectionIdentityUpdateInput & {
            id: string; // 👈 Update requires id
            secret?: Omit<ConnectionIdentitySecretUpsertInput, 'identityId'> | null;
        },
    ) {
        console.log('Updating identity with payload:', payload);

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
        // Update updatedAt if you have that field
        // updateData.updatedAt = new Date();

        // Allow only secret updates even if no other fields are provided
        const [identity] = await db
            .update(connectionIdentities)
            .set(updateData)
            .where(
                and(
                    eq(connectionIdentities.id, payload.id),
                    eq(connectionIdentities.teamId, teamId),
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
        const [existing] = await db
            .select()
            .from(connectionIdentitySecrets)
            .where(eq(connectionIdentitySecrets.identityId, identity.id));


        if (payload.secret === null) {
            return null;
        }
        // Has object -> upsert
        const secret: ConnectionIdentitySecret = {
            identityId: identity.id,
            passwordEncrypted: payload?.secret.passwordEncrypted ?? null,
            vaultRef: payload.secret.vaultRef ?? null,
        } as any;

        return await db
            .update(connectionIdentitySecrets)
            .set(secret)
            .where(eq(connectionIdentitySecrets.identityId, identity.id));

    }


    /**
     * Decrypt plaintext password by identityId (for testConnection)
     */
    async getIdentityPlainPassword(identityId: string): Promise<string | null> {
        const [secret] = await this.db.select().from(connectionIdentitySecrets).where(eq(connectionIdentitySecrets.identityId, identityId)).limit(1);

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
    async getSshPlainSecrets(connectionId: string): Promise<{ password: string | null; privateKey: string | null; passphrase: string | null } | null> {
        const [sshRow] = await this.db.select().from(connectionSsh).where(eq(connectionSsh.connectionId, connectionId)).limit(1);
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
}
