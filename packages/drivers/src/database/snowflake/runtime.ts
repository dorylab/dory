import { createPrivateKey } from 'node:crypto';
import snowflake from 'snowflake-sdk';
import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import { enforceSelectLimit } from '@dory/drivers/core';
import { compileParams } from '@dory/drivers/core';
import { asyncIterableWithCleanup, onceAsync } from '@dory/drivers/core';
import type { DriverQueryParams } from '@dory/drivers/core';
import type { BaseConfig, ConnectionQueryContext, DriverRowCursor, HealthInfo, QueryResult } from '@dory/drivers/types';
import { SnowflakeDialect } from './dialect';

type SnowflakeConnection = snowflake.Connection;
type SnowflakeStatement = snowflake.RowStatement | snowflake.FileAndStageBindStatement;

type SnowflakeRuntimeOptions = {
    account: string;
    warehouse?: string;
    schema?: string;
    role?: string;
    authMethod: 'password' | 'key_pair';
    privateKey?: string;
    privateKeyPassphrase?: string;
    requestTimeoutMs?: number;
    loginTimeoutMs?: number;
};

function textOption(options: Record<string, unknown>, key: string): string | undefined {
    const value = options[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveIntOption(options: Record<string, unknown>, key: string): number | undefined {
    const value = options[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
    }
    return undefined;
}

function extractRuntimeOptions(config: BaseConfig): SnowflakeRuntimeOptions {
    const options = (config.options ?? {}) as Record<string, unknown>;
    const account = textOption(options, 'account') ?? config.host.trim();
    const authMethod = textOption(options, 'authMethod') === 'key_pair' ? 'key_pair' : 'password';

    return {
        account,
        warehouse: textOption(options, 'warehouse'),
        schema: textOption(options, 'schema'),
        role: textOption(options, 'role'),
        authMethod,
        privateKey: textOption(options, 'privateKey'),
        privateKeyPassphrase: textOption(options, 'privateKeyPassphrase'),
        requestTimeoutMs: positiveIntOption(options, 'request_timeout') ?? positiveIntOption(options, 'query_timeout'),
        loginTimeoutMs: positiveIntOption(options, 'connect_timeout'),
    };
}

function normalizePrivateKey(privateKey: string, passphrase?: string): string {
    const keyObject = createPrivateKey(passphrase ? { key: privateKey, passphrase } : privateKey);
    return keyObject.export({ format: 'pem', type: 'pkcs8' }).toString();
}

export function buildSnowflakeConnectionOptions(config: BaseConfig): snowflake.ConnectionOptions {
    const runtime = extractRuntimeOptions(config);
    const options: snowflake.ConnectionOptions = {
        account: runtime.account,
        username: config.username,
        warehouse: runtime.warehouse,
        database: config.database,
        schema: runtime.schema,
        role: runtime.role,
        clientSessionKeepAlive: false,
        clientStoreTemporaryCredential: false,
        disableConsoleLogin: true,
        fetchAsString: ['Number', 'Date', 'JSON'],
    };

    if (runtime.loginTimeoutMs) {
        options.timeout = runtime.loginTimeoutMs;
    }

    if (runtime.authMethod === 'key_pair') {
        options.authenticator = 'SNOWFLAKE_JWT';
        options.privateKey = normalizePrivateKey(runtime.privateKey ?? '', runtime.privateKeyPassphrase);
        if (runtime.privateKeyPassphrase) {
            options.privateKeyPass = runtime.privateKeyPassphrase;
        }
    } else {
        options.password = config.password;
    }

    return options;
}

export function createSnowflakeConnection(config: BaseConfig): SnowflakeConnection {
    return snowflake.createConnection(buildSnowflakeConnectionOptions(config));
}

export async function connectSnowflake(connection: SnowflakeConnection): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        connection.connect((err: snowflake.SnowflakeError | undefined) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

export async function closeSnowflake(connection: SnowflakeConnection): Promise<void> {
    await new Promise<void>(resolve => {
        connection.destroy(() => resolve());
    });
}

function normalizeColumns(statement?: SnowflakeStatement) {
    const columns = 'getColumns' in (statement ?? {}) ? (statement as snowflake.RowStatement).getColumns() : undefined;
    return (columns ?? []).map(column => ({
        name: column.getName(),
        type: column.getType(),
    }));
}

function normalizeParams(sql: string, params?: DriverQueryParams) {
    const compiled = compileParams(SnowflakeDialect, sql, params);
    return {
        sql: compiled.sql,
        values: (compiled.params as unknown[] | undefined) ?? [],
    };
}

function isSelectLike(sql: string) {
    return /^\s*(select|with|show|describe|desc|explain)\b/i.test(sql);
}

export function quoteSnowflakeIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

export function parseSnowflakeTableReference(table: string): { database?: string; schema?: string; table: string } {
    const sanitized = table
        .trim()
        .split('.')
        .map(part => part.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
        .filter(Boolean);

    if (sanitized.length >= 3) {
        return {
            database: sanitized[sanitized.length - 3],
            schema: sanitized[sanitized.length - 2],
            table: sanitized[sanitized.length - 1],
        };
    }
    if (sanitized.length === 2) {
        return {
            schema: sanitized[0],
            table: sanitized[1],
        };
    }
    return { table: sanitized[0] ?? table.trim() };
}

export function quoteSnowflakeQualifiedTable(database: string, schema: string | undefined, table: string): string {
    return [database, schema, table]
        .filter((part): part is string => Boolean(part?.trim()))
        .map(quoteSnowflakeIdentifier)
        .join('.');
}

export async function pingSnowflake(connection: SnowflakeConnection, config: BaseConfig): Promise<HealthInfo & { version?: string }> {
    const started = Date.now();
    const result = await executeSnowflakeQuery<{ version?: string }>(connection, config, 'SELECT CURRENT_VERSION() AS "version"');

    return {
        ok: true,
        tookMs: Date.now() - started,
        version: result.rows[0]?.version,
    };
}

export async function executeSnowflakeQuery<Row>(
    connection: SnowflakeConnection,
    config: BaseConfig,
    sql: string,
    params?: DriverQueryParams,
    options?: {
        context?: ConnectionQueryContext;
        trackQuery?: (statement: snowflake.RowStatement) => void;
        untrackQuery?: () => void;
    },
): Promise<QueryResult<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sql, params);
    const runtime = extractRuntimeOptions(config);
    const started = Date.now();
    const queryTimeoutMs = options?.context?.statementTimeoutMs ?? runtime.requestTimeoutMs;

    return await new Promise<QueryResult<Row>>((resolve, reject) => {
        const statement = connection.execute({
            sqlText: enforceSelectLimit(compiledSql, DEFAULT_MAX_RESULT_ROWS),
            binds: values as snowflake.Binds,
            parameters: queryTimeoutMs ? { STATEMENT_TIMEOUT_IN_SECONDS: Math.max(1, Math.ceil(queryTimeoutMs / 1000)) } : undefined,
            complete: (err, stmt, rows) => {
                options?.untrackQuery?.();
                if (err) {
                    reject(err);
                    return;
                }

                const rowStatement = stmt as snowflake.RowStatement;
                const resultRows = (rows ?? []) as Row[];
                const updatedRows = rowStatement.getNumUpdatedRows?.();

                resolve({
                    rows: resultRows,
                    rowCount: typeof updatedRows === 'number' ? updatedRows : resultRows.length,
                    columns: normalizeColumns(rowStatement),
                    limited: isSelectLike(compiledSql) && resultRows.length >= DEFAULT_MAX_RESULT_ROWS,
                    limit: isSelectLike(compiledSql) ? DEFAULT_MAX_RESULT_ROWS : undefined,
                    tookMs: Date.now() - started,
                });
            },
        }) as snowflake.RowStatement;

        if (options?.trackQuery && options.context?.queryId) {
            options.trackQuery(statement);
        }
    });
}

export async function executeSnowflakeQueryRowStream<Row>(
    connection: SnowflakeConnection,
    config: BaseConfig,
    sql: string,
    params?: DriverQueryParams,
    options?: {
        context?: ConnectionQueryContext;
        trackQuery?: (statement: snowflake.RowStatement) => void;
        untrackQuery?: () => void;
    },
): Promise<DriverRowCursor<Row>> {
    const { sql: compiledSql, values } = normalizeParams(sql, params);
    const runtime = extractRuntimeOptions(config);
    const started = Date.now();
    const queryTimeoutMs = options?.context?.statementTimeoutMs ?? runtime.requestTimeoutMs;

    return await new Promise<DriverRowCursor<Row>>((resolve, reject) => {
        let stream: (AsyncIterable<Row> & { destroy?: (error?: Error) => void }) | null = null;
        const cleanup = onceAsync(() => options?.untrackQuery?.());
        let statementRef: snowflake.RowStatement | null = null;

        const statement = connection.execute({
            sqlText: compiledSql,
            binds: values as snowflake.Binds,
            streamResult: true,
            rowMode: 'array',
            parameters: queryTimeoutMs ? { STATEMENT_TIMEOUT_IN_SECONDS: Math.max(1, Math.ceil(queryTimeoutMs / 1000)) } : undefined,
            complete: (err, stmt) => {
                if (err) {
                    void cleanup();
                    reject(err);
                    return;
                }

                const rowStatement = stmt as snowflake.RowStatement;
                statementRef = rowStatement;
                const rowStream = rowStatement.streamRows() as AsyncIterable<Row> & { destroy?: (error?: Error) => void };
                stream = rowStream;

                resolve({
                    rows: asyncIterableWithCleanup<Row>(rowStream, cleanup),
                    rowCount: null,
                    columns: normalizeColumns(rowStatement),
                    limited: false,
                    tookMs: Date.now() - started,
                    statistics: {
                        snowflake: {
                            queryId: rowStatement.getQueryId?.(),
                            streamingMode: 'streamRows',
                        },
                    },
                    close: async () => {
                        stream?.destroy?.();
                        if (statementRef) {
                            await new Promise<void>(done => {
                                statementRef?.cancel(() => done());
                            }).catch(() => undefined);
                        }
                        await cleanup();
                    },
                });
            },
        }) as snowflake.RowStatement;

        statementRef = statement;
        if (options?.trackQuery && options.context?.queryId) {
            options.trackQuery(statement);
        }
    });
}

export async function executeSnowflakeCommand(
    connection: SnowflakeConnection,
    config: BaseConfig,
    sql: string,
    params?: DriverQueryParams,
    context?: ConnectionQueryContext,
): Promise<void> {
    await executeSnowflakeQuery(connection, config, sql, params, { context });
}
