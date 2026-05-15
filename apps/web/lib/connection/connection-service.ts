import { getDBService } from '@dory/database';
import '@/lib/drivers/register-database-drivers';

import { destroyDriverPool, ensureDriverPool, getDriverPool, type DriverPoolEntry } from '@dory/drivers/core';
import { buildStoredConnectionConfig, parseConnectionOptions, pickConnectionIdentity } from '@dory/drivers/config';
import type { ConnectionListItem, ConnectionSsh } from '@dory/shared/types/connections';
import { resolveStoredSqlitePath } from '@/lib/demo/paths';

type SshWithSecrets = ConnectionSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null };

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
    if (!dataset?.dataset.schemaName) {
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

export async function getOrCreateConnectionPool(
    organizationId: string,
    connectionId: string,
): Promise<DriverPoolEntry | undefined> {
    const existing = await getDriverPool(connectionId);
    if (existing && !isLocalFilesDatasetOptions(existing.config.options)) return existing;

    const db = await getDBService();
    const record = await db.connections.getById(organizationId, connectionId).then(item => (item ? withLocalFilesSchema(organizationId, item) : item));
    if (!record) return undefined;

    const identity = pickConnectionIdentity(record.identities, null);
    if (!identity) return undefined;

    const plainPassword = identity.id ? await db.connections.getIdentityPlainPassword(organizationId, identity.id) : null;

    const sshSecrets = await db.connections.getSshPlainSecrets(organizationId, record.connection.id);
    const sshConfig: SshWithSecrets | null = record.ssh
        ? { ...record.ssh, ...(sshSecrets ?? {}) }
        : sshSecrets
          ? ({ enabled: true, ...sshSecrets } as SshWithSecrets)
          : null;

    const config = buildStoredConnectionConfig(
        record.connection,
        { ...identity, password: plainPassword },
        sshConfig,
        undefined,
        resolveStoredSqlitePath,
    );
    if (existing) {
        const currentOptions = JSON.stringify(existing.config.options ?? {});
        const nextOptions = JSON.stringify(config.options ?? {});
        if (currentOptions !== nextOptions || (config.updatedAt && existing.config.updatedAt !== config.updatedAt)) {
            await destroyDriverPool(config.id);
        }
    }
    return ensureDriverPool(config);
}
