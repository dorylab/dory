import {
    buildStoredConnectionConfig as buildStoredDriverConnectionConfig,
    buildTestConnectionConfig as buildTestDriverConnectionConfig,
    parseConnectionOptions,
    type StoredDriverConnection,
    type StoredDriverIdentity,
    type StoredDriverSsh,
    type TestDriverConnectionPayload,
} from '@dory/drivers/config';

import { isDemoDuckDbResourcePath, resolveStoredDatabasePath } from '@/lib/demo/paths';

type ErrorFactory = (code: string) => Error;

function withDemoDuckDbReadOnlyOptions<Connection extends StoredDriverConnection>(connection: Connection): Connection {
    const type = (connection.type ?? connection.engine)?.toLowerCase();
    if (type !== 'duckdb' || !isDemoDuckDbResourcePath(connection.path)) {
        return connection;
    }

    const options = parseConnectionOptions(connection.options) ?? {};
    const instanceOptions =
        options.instanceOptions && typeof options.instanceOptions === 'object' && !Array.isArray(options.instanceOptions)
            ? { ...(options.instanceOptions as Record<string, unknown>) }
            : {};

    return {
        ...connection,
        options: {
            ...options,
            instanceOptions: {
                ...instanceOptions,
                access_mode: typeof instanceOptions.access_mode === 'string' ? instanceOptions.access_mode : 'READ_ONLY',
            },
        },
    };
}

export function buildStoredConnectionConfig(
    connection: StoredDriverConnection,
    identity: StoredDriverIdentity & { password?: string | null },
    ssh?: (StoredDriverSsh & { password?: string | null; privateKey?: string | null; passphrase?: string | null }) | null,
    createError?: ErrorFactory,
) {
    return buildStoredDriverConnectionConfig(withDemoDuckDbReadOnlyOptions(connection), identity, ssh, createError, resolveStoredDatabasePath);
}

export function buildTestConnectionConfig(
    payload: TestDriverConnectionPayload & {
        ssh?:
            | (NonNullable<TestDriverConnectionPayload['ssh']> & {
                  password?: string | null;
                  privateKey?: string | null;
                  passphrase?: string | null;
              })
            | null;
    },
    createError?: ErrorFactory,
) {
    return buildTestDriverConnectionConfig(
        {
            ...payload,
            connection: withDemoDuckDbReadOnlyOptions(payload.connection),
        },
        createError,
        resolveStoredDatabasePath,
    );
}
