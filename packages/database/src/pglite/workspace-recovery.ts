import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { PostgresDBClient } from '@dory/shared';
import {
    account,
    chatMessages,
    chatSessionState,
    chatSessions,
    connectionIdentities,
    connectionIdentitySecrets,
    connections,
    connectionSsh,
    connectionTls,
    invitation,
    jwks,
    organizationMembers,
    organizations,
    savedQueries,
    savedQueryFolders,
    session,
    tabs,
    user,
} from '../postgres/schemas';

type ColumnMapping = {
    target: string;
    sources?: string[];
    required?: boolean;
};

type RecoveryTableSpec = {
    key: string;
    sourceTables: string[];
    targetTable: unknown;
    columns: ColumnMapping[];
};

type RecoveryTableSnapshot = {
    key: string;
    sourceTable: string | null;
    rowCount: number;
    rows: Record<string, unknown>[];
};

export type WorkspaceRecoverySnapshot = {
    createdAt: string;
    sourceDataDir: string;
    tables: RecoveryTableSnapshot[];
};

const RECOVERY_TABLES: RecoveryTableSpec[] = [
    {
        key: 'user',
        sourceTables: ['user'],
        targetTable: user,
        columns: [
            { target: 'id', required: true },
            { target: 'name', required: true },
            { target: 'email', required: true },
            { target: 'emailVerified', sources: ['email_verified'], required: true },
            { target: 'image' },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
    {
        key: 'organizations',
        sourceTables: ['organizations', 'teams'],
        targetTable: organizations,
        columns: [
            { target: 'id', required: true },
            { target: 'name', required: true },
            { target: 'ownerUserId', sources: ['owner_user_id'], required: true },
            { target: 'slug' },
            { target: 'logo' },
            { target: 'metadata' },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
    {
        key: 'members',
        sourceTables: ['members', 'organization_members', 'team_members'],
        targetTable: organizationMembers,
        columns: [
            { target: 'id', required: true },
            { target: 'userId', sources: ['user_id'], required: true },
            { target: 'organizationId', sources: ['organization_id', 'team_id'], required: true },
            { target: 'role', required: true },
            { target: 'status' },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'joinedAt', sources: ['joined_at'] },
        ],
    },
    {
        key: 'account',
        sourceTables: ['account'],
        targetTable: account,
        columns: [
            { target: 'id', required: true },
            { target: 'accountId', sources: ['account_id'], required: true },
            { target: 'providerId', sources: ['provider_id'], required: true },
            { target: 'userId', sources: ['user_id'], required: true },
            { target: 'accessToken', sources: ['access_token'] },
            { target: 'refreshToken', sources: ['refresh_token'] },
            { target: 'idToken', sources: ['id_token'] },
            { target: 'accessTokenExpiresAt', sources: ['access_token_expires_at'] },
            { target: 'refreshTokenExpiresAt', sources: ['refresh_token_expires_at'] },
            { target: 'scope' },
            { target: 'password' },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
    {
        key: 'session',
        sourceTables: ['session'],
        targetTable: session,
        columns: [
            { target: 'id', required: true },
            { target: 'expiresAt', sources: ['expires_at'], required: true },
            { target: 'token', required: true },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
            { target: 'ipAddress', sources: ['ip_address'] },
            { target: 'userAgent', sources: ['user_agent'] },
            { target: 'userId', sources: ['user_id'], required: true },
            { target: 'activeOrganizationId', sources: ['active_organization_id'] },
        ],
    },
    {
        key: 'invitation',
        sourceTables: ['invitation'],
        targetTable: invitation,
        columns: [
            { target: 'id', required: true },
            { target: 'organizationId', sources: ['organization_id'], required: true },
            { target: 'email', required: true },
            { target: 'role', required: true },
            { target: 'status', required: true },
            { target: 'expiresAt', sources: ['expires_at'] },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'inviterId', sources: ['inviter_id'], required: true },
        ],
    },
    {
        key: 'jwks',
        sourceTables: ['jwks'],
        targetTable: jwks,
        columns: [
            { target: 'id', required: true },
            { target: 'alg' },
            { target: 'crv' },
            { target: 'publicKey', sources: ['public_key'], required: true },
            { target: 'privateKey', sources: ['private_key'], required: true },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'expiresAt', sources: ['expires_at'] },
        ],
    },
    {
        key: 'connections',
        sourceTables: ['connections'],
        targetTable: connections,
        columns: [
            { target: 'id', required: true },
            { target: 'createdByUserId', sources: ['created_by_user_id'] },
            { target: 'organizationId', sources: ['organization_id', 'team_id'], required: true },
            { target: 'source' },
            { target: 'cloudId', sources: ['cloud_id'] },
            { target: 'syncStatus', sources: ['sync_status'] },
            { target: 'lastSyncedAt', sources: ['last_synced_at'] },
            { target: 'remoteUpdatedAt', sources: ['remote_updated_at'] },
            { target: 'syncError', sources: ['sync_error'] },
            { target: 'type', required: true },
            { target: 'engine', required: true },
            { target: 'name', required: true },
            { target: 'description' },
            { target: 'host', required: true },
            { target: 'port', required: true },
            { target: 'httpPort', sources: ['http_port'] },
            { target: 'database' },
            { target: 'path' },
            { target: 'options', required: true },
            { target: 'status', required: true },
            { target: 'configVersion', sources: ['config_version'] },
            { target: 'validationErrors', sources: ['validation_errors'] },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
            { target: 'deletedAt', sources: ['deleted_at'] },
            { target: 'lastUsedAt', sources: ['last_used_at'] },
            { target: 'lastCheckStatus', sources: ['last_check_status'] },
            { target: 'lastCheckAt', sources: ['last_check_at'] },
            { target: 'lastCheckLatencyMs', sources: ['last_check_latency_ms'] },
            { target: 'lastCheckError', sources: ['last_check_error'] },
            { target: 'environment' },
            { target: 'tags' },
        ],
    },
    {
        key: 'connection_identities',
        sourceTables: ['connection_identities'],
        targetTable: connectionIdentities,
        columns: [
            { target: 'id', required: true },
            { target: 'createdByUserId', sources: ['created_by_user_id'] },
            { target: 'connectionId', sources: ['connection_id'], required: true },
            { target: 'organizationId', sources: ['organization_id', 'team_id'], required: true },
            { target: 'source' },
            { target: 'cloudId', sources: ['cloud_id'] },
            { target: 'syncStatus', sources: ['sync_status'] },
            { target: 'lastSyncedAt', sources: ['last_synced_at'] },
            { target: 'remoteUpdatedAt', sources: ['remote_updated_at'] },
            { target: 'syncError', sources: ['sync_error'] },
            { target: 'name', required: true },
            { target: 'username', required: true },
            { target: 'role' },
            { target: 'options', required: true },
            { target: 'isDefault', sources: ['is_default'] },
            { target: 'database' },
            { target: 'enabled' },
            { target: 'status' },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
            { target: 'deletedAt', sources: ['deleted_at'] },
        ],
    },
    {
        key: 'connection_identity_secrets',
        sourceTables: ['connection_identity_secrets'],
        targetTable: connectionIdentitySecrets,
        columns: [
            { target: 'identityId', sources: ['identity_id'], required: true },
            { target: 'passwordEncrypted', sources: ['password_encrypted'] },
            { target: 'privateKeyEncrypted', sources: ['private_key_encrypted'] },
            { target: 'privateKeyPassphraseEncrypted', sources: ['private_key_passphrase_encrypted'] },
            { target: 'vaultRef', sources: ['vault_ref'] },
            { target: 'secretRef', sources: ['secret_ref'] },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
    {
        key: 'connection_ssh',
        sourceTables: ['connection_ssh'],
        targetTable: connectionSsh,
        columns: [
            { target: 'connectionId', sources: ['connection_id'], required: true },
            { target: 'enabled', required: true },
            { target: 'host' },
            { target: 'port' },
            { target: 'username' },
            { target: 'authMethod', sources: ['auth_method'] },
            { target: 'passwordEncrypted', sources: ['password_encrypted'] },
            { target: 'privateKeyEncrypted', sources: ['private_key_encrypted'] },
            { target: 'passphraseEncrypted', sources: ['passphrase_encrypted'] },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
    {
        key: 'connection_tls',
        sourceTables: ['connection_tls'],
        targetTable: connectionTls,
        columns: [
            { target: 'connectionId', sources: ['connection_id'], required: true },
            { target: 'mode', required: true },
            { target: 'caCertificatePath', sources: ['ca_certificate_path'] },
            { target: 'clientCertificatePath', sources: ['client_certificate_path'] },
            { target: 'clientPrivateKeyPath', sources: ['client_private_key_path'] },
            { target: 'serverName', sources: ['server_name'] },
            { target: 'ciphers' },
            { target: 'minVersion', sources: ['min_version'] },
            { target: 'maxVersion', sources: ['max_version'] },
            { target: 'caCertificateEncrypted', sources: ['ca_certificate_encrypted'] },
            { target: 'clientCertificateEncrypted', sources: ['client_certificate_encrypted'] },
            { target: 'clientPrivateKeyEncrypted', sources: ['client_private_key_encrypted'] },
            { target: 'clientPrivateKeyPassphraseEncrypted', sources: ['client_private_key_passphrase_encrypted'] },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
    {
        key: 'tabs',
        sourceTables: ['tabs'],
        targetTable: tabs,
        columns: [
            { target: 'tabId', sources: ['tab_id'], required: true },
            { target: 'tabType', sources: ['tab_type'], required: true },
            { target: 'tabName', sources: ['tab_name'], required: true },
            { target: 'userId', sources: ['user_id'], required: true },
            { target: 'connectionId', sources: ['connection_id'], required: true },
            { target: 'databaseName', sources: ['database_name'] },
            { target: 'tableName', sources: ['table_name'] },
            { target: 'activeSubTab', sources: ['active_sub_tab'], required: true },
            { target: 'content', required: true },
            { target: 'state' },
            { target: 'resultMeta', sources: ['result_meta'] },
            { target: 'orderIndex', sources: ['order_index'], required: true },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
    {
        key: 'saved_query_folders',
        sourceTables: ['saved_query_folders'],
        targetTable: savedQueryFolders,
        columns: [
            { target: 'id', required: true },
            { target: 'organizationId', sources: ['organization_id', 'team_id'], required: true },
            { target: 'userId', sources: ['user_id'], required: true },
            { target: 'connectionId', sources: ['connection_id'], required: true },
            { target: 'name', required: true },
            { target: 'position', required: true },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
    {
        key: 'saved_queries',
        sourceTables: ['saved_queries'],
        targetTable: savedQueries,
        columns: [
            { target: 'id', required: true },
            { target: 'organizationId', sources: ['organization_id', 'team_id'], required: true },
            { target: 'userId', sources: ['user_id'], required: true },
            { target: 'title', required: true },
            { target: 'description' },
            { target: 'sqlText', sources: ['sql_text'], required: true },
            { target: 'connectionId', sources: ['connection_id'], required: true },
            { target: 'context' },
            { target: 'tags' },
            { target: 'folderId', sources: ['folder_id'] },
            { target: 'position' },
            { target: 'workId', sources: ['work_id'] },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
            { target: 'archivedAt', sources: ['archived_at'] },
        ],
    },
    {
        key: 'chat_sessions',
        sourceTables: ['chat_sessions'],
        targetTable: chatSessions,
        columns: [
            { target: 'id', required: true },
            { target: 'organizationId', sources: ['organization_id', 'team_id'], required: true },
            { target: 'userId', sources: ['user_id'], required: true },
            { target: 'type', required: true },
            { target: 'tabId', sources: ['tab_id'] },
            { target: 'connectionId', sources: ['connection_id'] },
            { target: 'activeDatabase', sources: ['active_database'] },
            { target: 'activeSchema', sources: ['active_schema'] },
            { target: 'title' },
            { target: 'settings' },
            { target: 'metadata' },
            { target: 'createdAt', sources: ['created_at'], required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
            { target: 'archivedAt', sources: ['archived_at'] },
            { target: 'lastMessageAt', sources: ['last_message_at'] },
        ],
    },
    {
        key: 'chat_messages',
        sourceTables: ['chat_messages'],
        targetTable: chatMessages,
        columns: [
            { target: 'id', required: true },
            { target: 'organizationId', sources: ['organization_id', 'team_id'], required: true },
            { target: 'sessionId', sources: ['session_id'], required: true },
            { target: 'userId', sources: ['user_id'] },
            { target: 'connectionId', sources: ['connection_id'] },
            { target: 'role', required: true },
            { target: 'parts', required: true },
            { target: 'metadata' },
            { target: 'createdAt', sources: ['created_at'], required: true },
        ],
    },
    {
        key: 'chat_session_state',
        sourceTables: ['chat_session_state'],
        targetTable: chatSessionState,
        columns: [
            { target: 'sessionId', sources: ['session_id'], required: true },
            { target: 'organizationId', sources: ['organization_id', 'team_id'], required: true },
            { target: 'connectionId', sources: ['connection_id'] },
            { target: 'activeTabId', sources: ['active_tab_id'] },
            { target: 'activeDatabase', sources: ['active_database'] },
            { target: 'activeSchema', sources: ['active_schema'] },
            { target: 'editorContext', sources: ['editor_context'] },
            { target: 'lastRunSummary', sources: ['last_run_summary'] },
            { target: 'stableContext', sources: ['stable_context'] },
            { target: 'revision', required: true },
            { target: 'updatedAt', sources: ['updated_at'], required: true },
        ],
    },
];

function quoteIdentifier(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}

async function listColumns(db: PGlite, tableName: string) {
    const result = await db.query<{ column_name: string }>(
        `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
        `,
        [tableName],
    );

    return new Set(result.rows.map(row => row.column_name));
}

async function findSourceTable(db: PGlite, candidates: string[]) {
    for (const tableName of candidates) {
        const columns = await listColumns(db, tableName);
        if (columns.size > 0) {
            return { tableName, columns };
        }
    }

    return null;
}

function resolveColumn(column: ColumnMapping, sourceColumns: Set<string>) {
    const candidates = column.sources ?? [toSnakeCase(column.target)];
    const sourceName = candidates.find(candidate => sourceColumns.has(candidate));

    if (!sourceName) {
        return null;
    }

    return `${quoteIdentifier(sourceName)} AS ${quoteIdentifier(column.target)}`;
}

function toSnakeCase(value: string) {
    return value.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`);
}

function compactRow(row: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function parseJsonObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== 'string') return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function isMotherDuckConnection(value: { type: unknown; options: unknown }) {
    if (value.type !== 'duckdb') return false;
    return parseJsonObject(value.options).mode === 'motherduck';
}

function archiveTimestamp(name: string) {
    return name.match(/(?:broken|pg\d+-upgrade)-(\d{8}-\d{6})$/)?.[1] ?? '';
}

async function findPgliteArchiveDataDirs(dataDir: string) {
    const parentDir = path.dirname(dataDir);
    const baseName = path.basename(dataDir);
    const entries = await fs.readdir(parentDir, { withFileTypes: true });

    return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => name.startsWith(`${baseName}.broken-`) || /^.+\.pg\d+-upgrade-\d{8}-\d{6}$/.test(name))
        .filter(name => name.startsWith(`${baseName}.`))
        .sort((left, right) => {
            const rightTimestamp = archiveTimestamp(right);
            const leftTimestamp = archiveTimestamp(left);
            return rightTimestamp.localeCompare(leftTimestamp) || right.localeCompare(left);
        })
        .map(name => path.join(parentDir, name));
}

async function readArchiveFileConnectionPaths(archiveDataDir: string) {
    const archiveDb = new PGlite({ dataDir: archiveDataDir });

    try {
        const result = await archiveDb.query<{ id: string; type: string; path: string | null; options: string | null }>(
            "SELECT id, type, path, options FROM connections WHERE type IN ('sqlite', 'duckdb') AND path IS NOT NULL AND btrim(path) <> ''",
        );

        return result.rows.filter(row => !isMotherDuckConnection(row));
    } finally {
        await archiveDb.close();
    }
}

export async function repairMissingFileConnectionPathsFromArchives(dataDir: string, targetDb: PostgresDBClient) {
    const missingRows = await targetDb
        .select({
            id: connections.id,
            type: connections.type,
            options: connections.options,
        })
        .from(connections)
        .where(and(inArray(connections.type, ['sqlite', 'duckdb']), or(isNull(connections.path), eq(connections.path, '')), isNull(connections.deletedAt)));

    const missing = new Map(missingRows.filter(row => !isMotherDuckConnection(row)).map(row => [row.id, row]));

    if (missing.size === 0) {
        return { checkedArchives: 0, repaired: 0 };
    }

    let checkedArchives = 0;
    let repaired = 0;

    let archiveDataDirs: string[] = [];
    try {
        archiveDataDirs = await findPgliteArchiveDataDirs(dataDir);
    } catch (error) {
        console.warn('[PGlite recovery] Failed to list archive directories for connection path repair', {
            dataDir,
            error,
        });
        return { checkedArchives, repaired };
    }

    for (const archiveDataDir of archiveDataDirs) {
        if (missing.size === 0) break;
        checkedArchives += 1;

        let archiveRows: Array<{ id: string; path: string | null }> = [];
        try {
            archiveRows = await readArchiveFileConnectionPaths(archiveDataDir);
        } catch (error) {
            console.warn('[PGlite recovery] Failed to read archive connection paths', {
                archiveDataDir,
                error,
            });
            continue;
        }

        for (const archiveRow of archiveRows) {
            if (!missing.has(archiveRow.id) || !archiveRow.path) continue;

            const [updated] = await targetDb
                .update(connections)
                .set({ path: archiveRow.path })
                .where(
                    and(
                        eq(connections.id, archiveRow.id),
                        inArray(connections.type, ['sqlite', 'duckdb']),
                        or(isNull(connections.path), eq(connections.path, '')),
                        isNull(connections.deletedAt),
                    ),
                )
                .returning({ id: connections.id });

            if (!updated) continue;

            repaired += 1;
            missing.delete(archiveRow.id);
        }
    }

    if (repaired > 0) {
        console.warn('[PGlite recovery] Repaired missing file connection paths from archives', {
            dataDir,
            checkedArchives,
            repaired,
        });
    }

    return { checkedArchives, repaired };
}

async function extractTableSnapshot(db: PGlite, spec: RecoveryTableSpec): Promise<RecoveryTableSnapshot> {
    const source = await findSourceTable(db, spec.sourceTables);

    if (!source) {
        return {
            key: spec.key,
            sourceTable: null,
            rowCount: 0,
            rows: [],
        };
    }

    const selectColumns: string[] = [];

    for (const column of spec.columns) {
        const resolved = resolveColumn(column, source.columns);

        if (!resolved) {
            if (column.required) {
                console.warn('[PGlite recovery] Skip table because required column is missing', {
                    key: spec.key,
                    sourceTable: source.tableName,
                    targetColumn: column.target,
                    sourceCandidates: column.sources ?? [toSnakeCase(column.target)],
                });

                return {
                    key: spec.key,
                    sourceTable: source.tableName,
                    rowCount: 0,
                    rows: [],
                };
            }

            continue;
        }

        selectColumns.push(resolved);
    }

    if (selectColumns.length === 0) {
        return {
            key: spec.key,
            sourceTable: source.tableName,
            rowCount: 0,
            rows: [],
        };
    }

    const result = await db.query<Record<string, unknown>>(`SELECT ${selectColumns.join(', ')} FROM ${quoteIdentifier(source.tableName)}`);

    return {
        key: spec.key,
        sourceTable: source.tableName,
        rowCount: result.rows.length,
        rows: result.rows.map(compactRow),
    };
}

async function insertRows(targetDb: PostgresDBClient, targetTable: unknown, rows: Record<string, unknown>[], key: string) {
    if (rows.length === 0) {
        return;
    }

    const batchSize = 100;

    for (let index = 0; index < rows.length; index += batchSize) {
        const batch = rows.slice(index, index + batchSize);

        try {
            await (targetDb as any).insert(targetTable).values(batch);
            continue;
        } catch (error) {
            console.warn('[PGlite recovery] Batch restore failed, retrying row by row', {
                key,
                batchStart: index,
                batchSize: batch.length,
                error,
            });
        }

        for (const row of batch) {
            try {
                await (targetDb as any).insert(targetTable).values(row);
            } catch (error) {
                console.warn('[PGlite recovery] Skip row during restore', {
                    key,
                    row,
                    error,
                });
            }
        }
    }
}

export async function exportWorkspaceRecoverySnapshot(sourceDataDir: string, snapshotPath: string, PGliteImpl: new (options: { dataDir: string }) => PGlite = PGlite) {
    const sourceDb = new PGliteImpl({ dataDir: sourceDataDir });

    try {
        const tables: RecoveryTableSnapshot[] = [];

        for (const spec of RECOVERY_TABLES) {
            const tableSnapshot = await extractTableSnapshot(sourceDb, spec);
            tables.push(tableSnapshot);
        }

        const snapshot: WorkspaceRecoverySnapshot = {
            createdAt: new Date().toISOString(),
            sourceDataDir,
            tables,
        };

        await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 4), 'utf8');

        console.warn('[PGlite recovery] Workspace snapshot exported', {
            snapshotPath,
            tableCounts: tables.map(table => ({
                key: table.key,
                sourceTable: table.sourceTable,
                rowCount: table.rowCount,
            })),
        });

        return snapshot;
    } finally {
        await sourceDb.close();
    }
}

export async function importWorkspaceRecoverySnapshot(targetDb: PostgresDBClient, snapshot: WorkspaceRecoverySnapshot) {
    for (const spec of RECOVERY_TABLES) {
        const tableSnapshot = snapshot.tables.find(table => table.key === spec.key);

        if (!tableSnapshot || tableSnapshot.rows.length === 0) {
            continue;
        }

        await insertRows(targetDb, spec.targetTable, tableSnapshot.rows, spec.key);
    }
}
