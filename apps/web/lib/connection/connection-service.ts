import { getDBService } from '@/lib/database';
import { ensureDatasourcePool, getDatasourcePool, type DatasourcePoolEntry } from './pool-store';
import type { ConnectionSsh } from '@/types/connections';
import { buildStoredConnectionConfig, pickConnectionIdentity } from './config-builder';

type SshWithSecrets = ConnectionSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null };

export async function getOrCreateConnectionPool(
    organizationId: string,
    connectionId: string,
): Promise<DatasourcePoolEntry | undefined> {
    const existing = await getDatasourcePool(connectionId);
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

    const config = buildStoredConnectionConfig(record.connection, { ...identity, password: plainPassword }, sshConfig);
    return ensureDatasourcePool(config);
}
