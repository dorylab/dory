export type ParsedConnectionUrl = {
    connection: Record<string, boolean | number | string>;
    identity: Record<string, string>;
    tlsMode?: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-identity';
};

export const CONNECTION_URL_TYPES = new Set(['clickhouse', 'cloudflare-d1', 'duckdb', 'mariadb', 'mysql', 'oracle', 'postgres', 'snowflake', 'sqlite', 'sqlserver']);

const CONNECTION_URL_PLACEHOLDERS: Record<string, string> = {
    clickhouse: 'https://user:password@host:8443/database',
    'cloudflare-d1': 'https://api.cloudflare.com/client/v4/accounts/account-id/d1/database/database-id',
    duckdb: 'duckdb:///path/to/database.duckdb or md:database?motherduck_token=token',
    mariadb: 'mariadb://user:password@host:3306/database',
    mysql: 'mysql://user:password@host:3306/database',
    oracle: 'oracle://user:password@host:1521/service-name',
    postgres: 'postgresql://user:password@host:5432/database?sslmode=require',
    snowflake: 'snowflake://user:password@account/database/schema?warehouse=COMPUTE_WH',
    sqlite: 'sqlite:///path/to/database.sqlite',
    sqlserver: 'sqlserver://user:password@host:1433/database?encrypt=true',
};

export function getConnectionUrlPlaceholder(type?: string): string {
    return (type && CONNECTION_URL_PLACEHOLDERS[type]) || '';
}

function decodeUrlPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function normalizedHostname(url: URL): string {
    return url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname;
}

function pathnameSegments(url: URL): string[] {
    return url.pathname.split('/').filter(Boolean).map(decodeUrlPart);
}

function searchParam(url: URL, ...names: string[]): string | undefined {
    const normalizedNames = new Set(names.map(name => name.toLowerCase()));
    for (const [key, value] of url.searchParams) {
        if (normalizedNames.has(key.toLowerCase())) return value;
    }
    return undefined;
}

function booleanSearchParam(url: URL, ...names: string[]): boolean | undefined {
    const value = searchParam(url, ...names)
        ?.trim()
        .toLowerCase();
    if (typeof value === 'undefined') return undefined;
    if (['1', 'true', 'yes', 'on', 'require', 'required'].includes(value)) return true;
    if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(value)) return false;
    return undefined;
}

function identityFromUrl(url: URL): Record<string, string> {
    const identity: Record<string, string> = {};
    if (url.username) identity.username = decodeUrlPart(url.username);
    if (url.password) identity.password = decodeUrlPart(url.password);
    return identity;
}

function postgresTlsMode(url: URL): ParsedConnectionUrl['tlsMode'] {
    const sslMode = searchParam(url, 'sslmode')?.toLowerCase();
    if (!sslMode) return undefined;
    if (sslMode === 'disable') return 'disable';
    if (sslMode === 'prefer') return 'prefer';
    if (sslMode === 'verify-ca') return 'verify-ca';
    if (sslMode === 'verify-full' || sslMode === 'verify-identity') return 'verify-identity';
    return 'require';
}

function mysqlTlsMode(url: URL): ParsedConnectionUrl['tlsMode'] {
    const sslMode = searchParam(url, 'ssl-mode', 'sslmode')?.toLowerCase();
    if (sslMode === 'disabled' || sslMode === 'disable') return 'disable';
    if (sslMode === 'verify_ca') return 'verify-ca';
    if (sslMode === 'verify_identity') return 'verify-identity';
    if (sslMode) return 'require';

    const ssl = booleanSearchParam(url, 'ssl', 'tls');
    if (typeof ssl === 'boolean') return ssl ? 'require' : 'disable';
    if (url.protocol === 'mysqls:' || url.protocol === 'mariadbs:') return 'require';
    return undefined;
}

function parseServerUrl(type: string, rawValue: string): ParsedConnectionUrl | null {
    let url: URL;
    try {
        url = new URL(rawValue);
    } catch {
        return null;
    }

    const protocol = url.protocol.toLowerCase();
    const allowedProtocols: Record<string, Set<string>> = {
        postgres: new Set(['postgres:', 'postgresql:']),
        mysql: new Set(['mysql:', 'mysql2:', 'mysqls:']),
        mariadb: new Set(['mariadb:', 'mariadbs:']),
        clickhouse: new Set(['clickhouse:', 'clickhouses:', 'http:', 'https:']),
        oracle: new Set(['oracle:', 'oracles:', 'tcp:', 'tcps:']),
        sqlserver: new Set(['sqlserver:', 'mssql:']),
    };
    if (!allowedProtocols[type]?.has(protocol)) return null;

    const host = normalizedHostname(url);
    if (!host) return null;

    const [database] = pathnameSegments(url);
    const connection: Record<string, boolean | number | string> = { host };
    const parsedPort = url.port ? Number(url.port) : undefined;
    if (database) connection.database = database;

    let tlsMode: ParsedConnectionUrl['tlsMode'];
    if (type === 'clickhouse') {
        connection.httpPort = parsedPort ?? (protocol === 'https:' || protocol === 'clickhouses:' ? 8443 : 8123);
        const secure = booleanSearchParam(url, 'secure', 'ssl', 'tls');
        const usesTls = secure ?? (protocol === 'https:' || protocol === 'clickhouses:');
        connection.ssl = usesTls;
        tlsMode = usesTls ? 'require' : 'disable';
    } else {
        const defaultPorts: Record<string, number> = {
            postgres: 5432,
            mysql: 3306,
            mariadb: 3306,
            oracle: 1521,
            sqlserver: 1433,
        };
        connection.port = parsedPort ?? defaultPorts[type];
    }

    if (type === 'postgres') {
        tlsMode = postgresTlsMode(url);
        if (tlsMode) connection.ssl = tlsMode !== 'disable';
    }
    if (type === 'mysql' || type === 'mariadb') {
        tlsMode = mysqlTlsMode(url);
        if (tlsMode) connection.ssl = tlsMode !== 'disable';
    }
    if (type === 'sqlserver') {
        const encrypt = booleanSearchParam(url, 'encrypt');
        const trustServerCertificate = booleanSearchParam(url, 'trustServerCertificate', 'trust-server-certificate');
        if (typeof encrypt === 'boolean') connection.encrypt = encrypt;
        if (typeof trustServerCertificate === 'boolean') connection.trustServerCertificate = trustServerCertificate;
        if (encrypt === false) tlsMode = 'disable';
        if (encrypt === true) tlsMode = trustServerCertificate === false ? 'verify-identity' : 'require';
    }

    return {
        connection,
        identity: identityFromUrl(url),
        tlsMode,
    };
}

function parseSnowflakeUrl(rawValue: string): ParsedConnectionUrl | null {
    let url: URL;
    try {
        url = new URL(rawValue);
    } catch {
        return null;
    }
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'snowflake:' && (protocol !== 'https:' || !url.hostname.toLowerCase().endsWith('.snowflakecomputing.com'))) return null;

    const account = normalizedHostname(url).replace(/\.snowflakecomputing\.com$/i, '');
    if (!account) return null;

    const [databaseFromPath, schemaFromPath] = pathnameSegments(url);
    const database = searchParam(url, 'database', 'db') || databaseFromPath;
    const schema = searchParam(url, 'schema') || schemaFromPath;
    const warehouse = searchParam(url, 'warehouse');
    const role = searchParam(url, 'role');
    const authenticator = searchParam(url, 'authenticator')?.toLowerCase();
    const connection: Record<string, boolean | number | string> = { host: account };
    const identity = identityFromUrl(url);

    if (database) connection.database = database;
    if (schema) connection.schema = schema;
    if (warehouse) connection.warehouse = warehouse;
    if (authenticator === 'snowflake_jwt') connection.authMethod = 'key_pair';
    if (role) identity.role = role;

    return { connection, identity };
}

function parseCloudflareD1Url(rawValue: string): ParsedConnectionUrl | null {
    let url: URL;
    try {
        url = new URL(rawValue);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || !/(^|\.)cloudflare\.com$/i.test(url.hostname)) return null;

    const segments = pathnameSegments(url);
    const accountsIndex = segments.findIndex(segment => segment.toLowerCase() === 'accounts');
    const d1Index = segments.findIndex(segment => segment.toLowerCase() === 'd1');
    const databaseIndex = segments.findIndex((segment, index) => index > d1Index && segment.toLowerCase() === 'database');
    const accountId = accountsIndex >= 0 ? segments[accountsIndex + 1] : undefined;
    const databaseId = databaseIndex >= 0 ? segments[databaseIndex + 1] : undefined;
    if (!accountId || !databaseId) return null;

    return {
        connection: {
            accountId,
            database: databaseId,
            host: 'api.cloudflare.com',
            ssl: true,
        },
        identity: {},
    };
}

function normalizeLocalPath(pathname: string): string {
    const decodedPath = decodeUrlPart(pathname);
    return /^\/[a-zA-Z]:\//.test(decodedPath) ? decodedPath.slice(1) : decodedPath;
}

function parseLocalDatabaseUrl(type: 'duckdb' | 'sqlite', rawValue: string): ParsedConnectionUrl | null {
    let url: URL;
    try {
        url = new URL(rawValue);
    } catch {
        return null;
    }

    const protocol = url.protocol.toLowerCase();
    if (type === 'duckdb' && protocol === 'md:') {
        const database = decodeUrlPart(url.hostname || url.pathname.replace(/^\//, ''));
        if (!database) return null;
        const token = searchParam(url, 'motherduck_token', 'token');
        return {
            connection: { duckdbMode: 'motherduck', database },
            identity: token ? { password: token } : {},
        };
    }

    if (protocol !== `${type}:`) return null;
    const path = normalizeLocalPath(url.pathname);
    if (!path) return null;

    return {
        connection: {
            localDatabaseSource: 'existing',
            ...(type === 'duckdb' ? { duckdbMode: 'local' } : {}),
            path,
        },
        identity: {},
    };
}

export function parseConnectionUrl(type: string | undefined, rawValue: unknown): ParsedConnectionUrl | null {
    if (!type || typeof rawValue !== 'string') return null;
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    if (type === 'snowflake') return parseSnowflakeUrl(trimmed);
    if (type === 'cloudflare-d1') return parseCloudflareD1Url(trimmed);
    if (type === 'sqlite' || type === 'duckdb') return parseLocalDatabaseUrl(type, trimmed);
    return parseServerUrl(type, trimmed);
}
