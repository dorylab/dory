import type { DriverType } from '@dory/drivers/types';
import { isPostgresFamilyConnectionType } from '@dory/drivers/types';
import { splitMultiSQL, type SqlSplitterDialect } from '@dory/shared/utils/split-multi-sql';

type LibpgQueryModule = typeof import('libpg-query');

let libpgQueryModulePromise: Promise<LibpgQueryModule> | null = null;

function loadLibpgQuery() {
    libpgQueryModulePromise ??= import('libpg-query');
    return libpgQueryModulePromise;
}

function getDbgateDialect(driverType: DriverType): SqlSplitterDialect {
    switch (driverType) {
        case 'mysql':
        case 'mariadb':
            return 'mysql';
        case 'sqlserver':
            return 'sqlserver';
        case 'oracle':
            return 'oracle';
        case 'sqlite':
        case 'cloudflare-d1':
            return 'sqlite';
        case 'duckdb':
        case 'snowflake':
            return 'dollar-quoted';
        case 'clickhouse':
            return 'clickhouse';
        default:
            return 'default';
    }
}

function appendStatement(statements: string[], sqlBytes: Buffer, start: number, end: number) {
    const statement = sqlBytes.subarray(start, end).toString('utf8').trim();
    if (statement) statements.push(statement);
}

async function splitPostgresStatements(sql: string): Promise<string[]> {
    if (!sql.trim()) return [];

    const { scan } = await loadLibpgQuery();
    const result = await scan(sql);
    const sqlBytes = Buffer.from(sql, 'utf8');
    const statements: string[] = [];
    let statementStart = 0;

    for (const token of result.tokens ?? []) {
        if (token.text !== ';') continue;
        appendStatement(statements, sqlBytes, statementStart, token.start);
        statementStart = token.end;
    }

    appendStatement(statements, sqlBytes, statementStart, sqlBytes.length);
    return statements;
}

export async function parsePostgresSql(sql: string) {
    const { parse } = await loadLibpgQuery();
    return parse(sql);
}

export async function splitSqlStatements(sql: string, driverType: DriverType): Promise<string[]> {
    if (isPostgresFamilyConnectionType(driverType)) {
        return splitPostgresStatements(sql);
    }
    return splitMultiSQL(sql, getDbgateDialect(driverType));
}
