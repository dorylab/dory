import { getDBService } from '@/lib/database';
import '@/lib/drivers/register-database-drivers';

import { ensureDriverPool, getDriverPool, type DriverPoolEntry } from '@dory/drivers/core';
import { buildStoredConnectionConfig, pickConnectionIdentity } from '@dory/drivers/config';
import type { ConnectionSsh } from '@/types/connections';
import { resolveStoredSqlitePath } from '@/lib/demo/paths';

type SshWithSecrets = ConnectionSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null };

export async function getOrCreateConnectionPool(
    organizationId: string,
    connectionId: string,
): Promise<DriverPoolEntry | undefined> {
    const existing = await getDriverPool(connectionId);
    if (existing) return existing;

    const db = await getDBService();
    const record = await db.connections.getById(organizationId, connectionId);
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
    return ensureDriverPool(config);
}
