export type ConnectionType = 'clickhouse' | 'cloudflare-d1' | 'doris' | 'duckdb' | 'mariadb' | 'mysql' | 'neon' | 'oracle' | 'postgres' | 'sqlite' | 'sqlserver';
export type ConnectionStatus = 'Connected' | 'Error' | 'Disconnected';
export type ConnectionCheckStatus = 'unknown' | 'ok' | 'error';
export type ConnectionIdentityStatus = 'active' | 'disabled';
export type ConnectionTlsMode = 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-identity';

export interface Connection {
    id: string;

    createdByUserId: string | null;
    organizationId: string;

    type: ConnectionType;
    engine: string;

    name: string;
    description: string | null;

    host: string | null;
    port: number | null;
    httpPort: number | null;
    database: string | null;
    path: string | null;

    options: string;

    status: ConnectionStatus;
    configVersion: number;
    validationErrors: string | null;

    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    lastUsedAt: Date | null;

    lastCheckStatus?: ConnectionCheckStatus;
    lastCheckAt?: Date | null;
    lastCheckLatencyMs?: number | null;
    lastCheckError?: string | null;

    environment: string;
    tags: string;
}

export interface ConnectionIdentity {
    id: string;

    connectionId: string;
    organizationId: string;

    name: string;
    username: string;
    role: string | null;

    options: string;
    isDefault: boolean;

    database: string | null;

    enabled: boolean;
    status: ConnectionIdentityStatus;

    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

export interface CreateConnectionIdentity {
    id: string;

    connectionId: string;
    organizationId: string;

    name: string;
    username: string;
    password?: string;

    isDefault: boolean;
    database: string | null;
}

export interface ConnectionIdentitySecret {
    identityId: string;
    passwordEncrypted: string | null;
    vaultRef: string | null;
    secretRef: string | null;

    createdAt: Date;
    updatedAt: Date;
}

export interface ConnectionSsh {
    connectionId: string;

    enabled: boolean;

    host: string | null;
    port: number | null;
    username: string | null;
    authMethod: string | null;

    createdAt: Date;
    updatedAt: Date;
}

export interface ConnectionTls {
    connectionId: string;

    mode: ConnectionTlsMode;

    caCertificatePath: string | null;
    clientCertificatePath: string | null;
    clientPrivateKeyPath: string | null;
    serverName: string | null;
    ciphers: string | null;
    minVersion: string | null;
    maxVersion: string | null;

    hasCaCertificateContent?: boolean;
    hasClientCertificateContent?: boolean;
    hasClientPrivateKeyContent?: boolean;
    hasClientPrivateKeyPassphrase?: boolean;

    createdAt: Date;
    updatedAt: Date;
}

export type ConnectionItem = Omit<Connection, 'deletedAt' | 'organizationId' | 'validationErrors' | 'createdByUserId'>;

export interface ConnectionCreateInput {
    organizationId: string;

    type: ConnectionType;
    engine: string;

    name: string;
    description?: string;

    host: string | null;
    port: number | null;
    httpPort?: number;
    database?: string;
    path?: string | null;

    options?: string;
    status?: ConnectionStatus;
    environment?: string;
    tags?: string;

    createdByUserId?: string | null;
}

export interface ConnectionUpdateInput {
    id: string;

    name?: string;
    description?: string | null;

    host?: string | null;
    port?: number | null;
    httpPort?: number | null;
    database?: string | null;
    path?: string | null;

    options?: string;
    status?: ConnectionStatus;
    environment?: string;
    tags?: string;
}

export interface ConnectionIdentityCreateInput {
    connectionId: string;
    organizationId: string;

    name: string;
    username: string;
    role?: string;
    password?: string;

    options?: string;
    isDefault?: boolean;
    database?: string;

    enabled?: boolean;
    status?: ConnectionIdentityStatus;
}

export interface ConnectionIdentityUpdateInput {
    id: string;

    name?: string;
    username?: string;
    role?: string | null;

    options?: string;
    isDefault?: boolean;
    database?: string | null;

    enabled?: boolean;
    status?: ConnectionIdentityStatus;
}

export interface ConnectionIdentitySecretUpsertInput {
    identityId: string;
    passwordEncrypted?: string | null;
    vaultRef?: string | null;
    secretRef?: string | null;
}

export interface ConnectionSshUpsertInput {
    connectionId: string;

    enabled?: boolean;

    host?: string | null;
    port?: number | null;
    username?: string | null;
    authMethod?: string | null;

    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
}

export interface ConnectionTlsUpsertInput {
    connectionId?: string;

    mode?: ConnectionTlsMode;

    caCertificatePath?: string | null;
    clientCertificatePath?: string | null;
    clientPrivateKeyPath?: string | null;
    serverName?: string | null;
    ciphers?: string | null;
    minVersion?: string | null;
    maxVersion?: string | null;

    caCertificateContent?: string | null;
    clientCertificateContent?: string | null;
    clientPrivateKeyContent?: string | null;
    clientPrivateKeyPassphrase?: string | null;
}

export interface ConnectionListIdentity {
    id: string;
    name: string;
    username: string;
    role: string | null;
    isDefault: boolean;
    database: string | null;
    enabled?: boolean;
    status?: ConnectionIdentityStatus;
    updatedAt?: Date;
}

export interface ConnectionListItem {
    connection: Connection | ConnectionItem;
    identities: Array<ConnectionListIdentity>;
    ssh: ConnectionSsh | null;
    tls?: ConnectionTls | null;
}

export interface TestConnectionPayload {
    connection: Connection;
    identity: ConnectionIdentityUpdateInput & { id?: string; password?: string | null };
    ssh: ConnectionSsh | null;
    tls?: ConnectionTlsUpsertInput | null;
    timeout?: number;
}

export interface CreateConnectionPayload {
    connection: Connection;
    identities: ConnectionListIdentity[];
    ssh: ConnectionSsh | null;
    tls?: ConnectionTlsUpsertInput | null;
}

export interface UpdateConnectionPayload {
    connection: Connection;
    identities: ConnectionListIdentity[];
    ssh: ConnectionSsh | null;
    tls?: ConnectionTlsUpsertInput | null;
}

export interface ConnectionIdentityWithSecret extends ConnectionIdentity {
    secret?: ConnectionIdentitySecret | null;
}

export interface ConnectionDetail extends Connection {
    identities: ConnectionIdentityWithSecret[];
    ssh: ConnectionSsh | null;
    tls?: ConnectionTls | null;
}

export interface ConnectionQueryParams {
    organizationId: string;

    status?: ConnectionStatus | ConnectionStatus[];
    environment?: string | string[];
    keyword?: string;
}
export interface ConnectionPayload {
    connection: ConnectionCreateInput;

    identities: Array<
        Partial<ConnectionIdentity> &
            ConnectionIdentityCreateInput & {
                id?: string;
                password?: string | null;
            }
    >;

    ssh?: ConnectionSshUpsertInput | null;
    tls?: ConnectionTlsUpsertInput | null;
}
