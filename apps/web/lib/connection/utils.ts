import { getDBService } from '@dory/database';
import '@/lib/drivers/register-database-drivers';

import type { ConnectionListItem, ConnectionSsh, ConnectionTls } from '@dory/shared/types/connections';
import { BaseConfig } from '@dory/drivers/types';
import { destroyDriverPool, ensureDriverPool, getDriverPool } from '@dory/drivers/core';
import { parseConnectionOptions, pickConnectionIdentity } from '@dory/drivers/config';
import { buildStoredConnectionConfig } from '@/lib/connection/config';
import { createSqlAuditConnectionSnapshot, isSqlAuditConnectionSnapshotCurrent, patchDriverPoolForSqlAudit, type SqlAuditConnectionSnapshot } from '@/lib/server/sql-audit';

type SshWithSecrets = ConnectionSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null };
type TlsWithSecrets = ConnectionTls & {
    caCertificateContent?: string | null;
    clientCertificateContent?: string | null;
    clientPrivateKeyContent?: string | null;
    clientPrivateKeyPassphrase?: string | null;
};

export const CONNECTION_ERROR_CODES = {
    notFound: 'connection_not_found',
    missingHost: 'missing_host',
    missingAccountId: 'missing_account_id',
    missingDatabase: 'missing_database',
    missingPath: 'missing_path',
    missingUsername: 'missing_username',
    missingIdentity: 'missing_identity',
    missingPassword: 'missing_password',
    missingIdentityInfo: 'missing_identity_info',
    missingSshPassword: 'missing_ssh_password',
    missingSshPrivateKey: 'missing_ssh_private_key',
} as const;

export type ConnectionErrorCode = (typeof CONNECTION_ERROR_CODES)[keyof typeof CONNECTION_ERROR_CODES];

export function createConnectionError(code: ConnectionErrorCode) {
    const error = new Error(code) as Error & { code: ConnectionErrorCode };
    error.code = code;
    return error;
}

export function getConnectionErrorCode(error: unknown): ConnectionErrorCode | null {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'string') {
            return code as ConnectionErrorCode;
        }
    }

    if (error instanceof Error) {
        const message = error.message;
        if ((Object.values(CONNECTION_ERROR_CODES) as string[]).includes(message)) {
            return message as ConnectionErrorCode;
        }
    }

    return null;
}

export function parseNumber(val: unknown): number | undefined {
    if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
    if (typeof val === 'string' && val.trim() !== '') {
        const num = Number(val);
        return Number.isFinite(num) ? num : undefined;
    }
    return undefined;
}

export function normalizeOptions(raw: unknown): string | Record<string, unknown> | null {
    if (typeof raw === 'string' || raw === null || typeof raw === 'undefined') return raw as any;
    if (typeof raw === 'object') {
        try {
            return JSON.stringify(raw as Record<string, unknown>);
        } catch {
            return '{}';
        }
    }
    return null;
}

function isLocalFilesDatasetOptions(options: unknown) {
    return Boolean(
        options &&
        typeof options === 'object' &&
        !Array.isArray(options) &&
        (options as Record<string, unknown>).managedBy === 'local-files' &&
        (options as Record<string, unknown>).mode === 'localFilesDataset',
    );
}

async function withLocalFilesSchema(organizationId: string, record: ConnectionListItem): Promise<ConnectionListItem> {
    const options = parseConnectionOptions(record.connection.options) ?? {};
    if (!isLocalFilesDatasetOptions(options) || typeof options.schemaName === 'string') {
        return record;
    }

    const db = await getDBService();
    const dataset = await db.localFiles.getDatasetByConnectionId(organizationId, record.connection.id);
    if (!dataset?.dataset?.schemaName) {
        return record;
    }

    return {
        ...record,
        connection: {
            ...record.connection,
            options: JSON.stringify({
                ...options,
                datasetId: typeof options.datasetId === 'string' ? options.datasetId : dataset.dataset.id,
                schemaName: dataset.dataset.schemaName,
            }),
        },
    };
}

async function ensurePoolWithLatest(config: BaseConfig, auditSnapshot: SqlAuditConnectionSnapshot) {
    const existing = await getDriverPool(config.id);
    const needRefresh =
        existing &&
        ((config.configVersion && existing.config.configVersion !== config.configVersion) ||
            (config.updatedAt && existing.config.updatedAt !== config.updatedAt) ||
            JSON.stringify(existing.config.options ?? {}) !== JSON.stringify(config.options ?? {}) ||
            !isSqlAuditConnectionSnapshotCurrent(existing, auditSnapshot));

    if (needRefresh) {
        await destroyDriverPool(config.id);
    }

    return patchDriverPoolForSqlAudit(await ensureDriverPool(config), auditSnapshot);
}

export async function ensureConnectionPoolForUser(userId: string, organizationId: string, connectionId: string, identityId?: string | null) {
    const db = await getDBService();
    const record = await db.connections.getById(organizationId, connectionId).then(item => (item ? withLocalFilesSchema(organizationId, item) : item));

    if (!record) {
        throw createConnectionError(CONNECTION_ERROR_CODES.notFound);
    }

    const identity = pickConnectionIdentity(record.identities, identityId ?? null);
    if (!identity) {
        throw createConnectionError(CONNECTION_ERROR_CODES.missingIdentity);
    }

    const plainPassword = identity.id ? await db.connections.getIdentityPlainPassword(organizationId, identity.id) : null;

    const sshSecrets = await db.connections.getSshPlainSecrets(organizationId, record.connection.id);
    const sshConfig: SshWithSecrets | null = record.ssh ? { ...record.ssh, ...(sshSecrets ?? {}) } : sshSecrets ? ({ enabled: true, ...sshSecrets } as SshWithSecrets) : null;
    const tlsSecrets = await db.connections.getTlsPlainSecrets(organizationId, record.connection.id);
    const tlsConfig: TlsWithSecrets | null = record.tls ? { ...record.tls, ...(tlsSecrets ?? {}) } : null;

    const config = buildStoredConnectionConfig(record.connection, { ...identity, password: plainPassword }, sshConfig, tlsConfig, code =>
        createConnectionError(code as ConnectionErrorCode),
    );
    const auditSnapshot = createSqlAuditConnectionSnapshot(record, identity);
    const entry = await ensurePoolWithLatest(config, auditSnapshot);

    return { entry: patchDriverPoolForSqlAudit(entry, auditSnapshot), config, identity };
}

export function mapNamesToLabelValue(names: string[]) {
    return (names ?? []).map(name => ({ label: name, value: name }));
}
