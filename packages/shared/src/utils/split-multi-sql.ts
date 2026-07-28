import {
    defaultSplitterOptions,
    mssqlSplitterOptions,
    mysqlSplitterOptions,
    oracleSplitterOptions,
    postgreSplitterOptions,
    splitQuery,
    sqliteSplitterOptions,
    type SplitterOptions,
} from 'dbgate-query-splitter';

export type SqlSplitterDialect = 'default' | 'clickhouse' | 'dollar-quoted' | 'mysql' | 'oracle' | 'sqlite' | 'sqlserver';

const DEFAULT_OPTIONS: SplitterOptions = {
    ...defaultSplitterOptions,
    stringsBegins: ["'", '"', '`'],
    stringsEnds: { "'": "'", '"': '"', '`': '`' },
    stringEscapes: { "'": "'", '"': '"', '`': '`' },
};

const CLICKHOUSE_OPTIONS: SplitterOptions = {
    ...DEFAULT_OPTIONS,
    stringEscapes: { "'": '\\', '"': '\\', '`': '\\' },
};

const SQLSERVER_OPTIONS: SplitterOptions = {
    ...mssqlSplitterOptions,
    allowSemicolon: true,
    keepSemicolonInCommands: false,
    skipSeparatorBeginEnd: true,
};

const ORACLE_OPTIONS: SplitterOptions = {
    ...oracleSplitterOptions,
    skipSeparatorBeginEnd: true,
};

const OPTIONS_BY_DIALECT: Record<SqlSplitterDialect, SplitterOptions> = {
    default: DEFAULT_OPTIONS,
    clickhouse: CLICKHOUSE_OPTIONS,
    'dollar-quoted': postgreSplitterOptions,
    mysql: mysqlSplitterOptions,
    oracle: ORACLE_OPTIONS,
    sqlite: sqliteSplitterOptions,
    sqlserver: SQLSERVER_OPTIONS,
};

export function splitMultiSQL(input: string, dialect: SqlSplitterDialect = 'default'): string[] {
    return splitQuery(input, OPTIONS_BY_DIALECT[dialect]).map(item => (typeof item === 'string' ? item : item.text));
}
