export type ConnectionType = 'clickhouse' | 'doris' | 'mysql' | 'postgres';
export type ConnectionStatus = 'Connected' | 'Error' | 'Disconnected';
export type ConnectionCheckStatus = 'unknown' | 'ok' | 'error';
export type ConnectionIdentityStatus = 'active' | 'disabled';

export interface Connection {
    id: string;

    createdByUserId: string | null;
    teamId: string;

    type: ConnectionType;
    engine: string;

    name: string;
    description: string | null;

    host: string;
    port: number;
    httpPort: number | null;
    database: string | null;

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
    teamId: string;

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
    teamId: string;

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

export type ConnectionItem = Omit<Connection, 'deletedAt' | 'teamId' | 'validationErrors' | 'createdByUserId'>

export interface ConnectionCreateInput {
    teamId: string;

    type: ConnectionType;
    engine: string;

    name: string;
    description?: string;

    host: string;
    port: number;
    httpPort?: number;
    database?: string;

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

    host?: string;
    port?: number;
    httpPort?: number | null;
    database?: string | null;

    options?: string;
    status?: ConnectionStatus;
    environment?: string;
    tags?: string;

}

export interface ConnectionIdentityCreateInput {
    connectionId: string;
    teamId: string;

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

export interface ConnectionListIdentity {
    id: string;
    name: string;
    username: string;
    role: string | null;
    isDefault: boolean;
    database: string | null;
    enabled?: boolean;
    status?: ConnectionIdentityStatus;
}

export interface ConnectionListItem {
    connection: Connection | ConnectionItem;
    identities: Array<ConnectionListIdentity>;
    ssh: ConnectionSsh | null;
}

export interface TestConnectionPayload {
    connection: Connection;
    identity: ConnectionIdentityUpdateInput & { id?: string; password?: string | null };
    ssh: ConnectionSsh | null;
    timeout?: number;
}

export interface CreateConnectionPayload {
    connection: Connection;
    identities: ConnectionListIdentity[];
    ssh: ConnectionSsh | null;
}

export interface UpdateConnectionPayload {
    connection: Connection;
    identities: ConnectionListIdentity[];
    ssh: ConnectionSsh | null;
}

export interface ConnectionIdentityWithSecret extends ConnectionIdentity {
    secret?: ConnectionIdentitySecret | null;
}

export interface ConnectionDetail extends Connection {
    identities: ConnectionIdentityWithSecret[];
    ssh: ConnectionSsh | null;
}


export interface ConnectionQueryParams {
    teamId: string;

    status?: ConnectionStatus | ConnectionStatus[];
    environment?: string | string[];
    keyword?: string;

}
export interface ConnectionPayload {
    connection: ConnectionCreateInput;

    identities: ConnectionIdentity &
        {
            password?: string | null;
        }[];

    ssh?: ConnectionSsh;
}
