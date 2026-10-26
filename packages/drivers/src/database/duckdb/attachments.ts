import { access } from 'node:fs/promises';
import path from 'node:path';
import { DuckDBInstance, StatementType, type DuckDBConnection } from '@duckdb/node-api';
import { buildReadSql, inspectSource } from '@dory/files';

export type AttachmentTable = {
    name: string;
    file: string;
    sheet?: string;
    columns: Array<{ name: string; type: string }>;
    rowCount: number;
    preview: Record<string, unknown>[];
};
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const identifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Only signed, build-provisioned extensions are loaded. Never INSTALL at runtime. */
async function loadExcel(connection: DuckDBConnection) {
    const candidates = [
        path.resolve(process.cwd(), 'public/resources/duckdb/excel.duckdb_extension'),
        path.resolve(process.cwd(), 'apps/web/public/resources/duckdb/excel.duckdb_extension'),
    ];
    let extension: string | undefined;
    for (const candidate of candidates) {
        if (
            await access(candidate).then(
                () => true,
                () => false,
            )
        ) {
            extension = candidate;
            break;
        }
    }
    if (!extension) throw new Error('The bundled DuckDB Excel extension is missing. Run the extension preparation step and rebuild this deployment.');
    await connection.run(`LOAD ${literal(extension)}`);
}

async function withConnection<T>(action: (connection: DuckDBConnection, signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const instance = await DuckDBInstance.create(':memory:', { memory_limit: '512MB', threads: '2', autoinstall_known_extensions: 'false', autoload_known_extensions: 'false' });
    const connection = await instance.connect();
    const timeout = AbortSignal.timeout(60_000);
    const executionSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const interrupt = () => connection.interrupt();
    executionSignal.addEventListener('abort', interrupt, { once: true });
    try {
        executionSignal.throwIfAborted();
        const result = await action(connection, executionSignal);
        executionSignal.throwIfAborted();
        return result;
    } finally {
        executionSignal.removeEventListener('abort', interrupt);
        connection.closeSync();
        instance.closeSync();
    }
}

export async function materializeAttachment(sourcePath: string, outputDirectory: string, tablePrefix: string, signal?: AbortSignal): Promise<AttachmentTable[]> {
    const relations = await inspectSource({ backend: 'serverPath', filePath: sourcePath });
    return withConnection(async (connection, executionSignal) => {
        if (relations.some(relation => relation.sourceType === 'excel')) await loadExcel(connection);
        const tables: AttachmentTable[] = [];
        for (const [index, relation] of relations.entries()) {
            executionSignal.throwIfAborted();
            const name = `${tablePrefix}_${relation.relationName}`;
            const file = `${index}.parquet`;
            const target = path.join(outputDirectory, file);
            await connection.run(`COPY (${buildReadSql(relation)}) TO ${literal(target)} (FORMAT PARQUET)`);
            const reader = `read_parquet(${literal(target)})`;
            const description = (await connection.runAndReadAll(`DESCRIBE SELECT * FROM ${reader}`)).getRowObjectsJson();
            const count = (await connection.runAndReadAll(`SELECT count(*) AS n FROM ${reader}`)).getRowObjectsJson()[0];
            const preview = (await connection.runAndReadAll(`SELECT * FROM ${reader} LIMIT 20`)).getRowObjectsJson();
            tables.push({
                name,
                file,
                ...(relation.sheetName ? { sheet: relation.sheetName } : {}),
                columns: description.map(column => ({ name: String(column.column_name), type: String(column.column_type) })),
                rowCount: Number(count.n),
                preview: boundedAttachmentRows(preview),
            });
        }
        return tables;
    }, signal);
}

export async function queryAttachmentTables(tables: Array<AttachmentTable & { directory: string }>, sql: string, signal?: AbortSignal) {
    return withConnection(async (connection, executionSignal) => {
        const paths = tables.map(table => path.join(table.directory, table.file));
        for (const [index, table] of tables.entries()) {
            await connection.run(`CREATE VIEW ${identifier(table.name)} AS SELECT * FROM read_parquet(${literal(paths[index])})`);
        }
        // Queries can only access the authorized immutable cache files, never arbitrary paths or URLs.
        await connection.run(`SET allowed_paths = [${paths.map(literal).join(',')}]`);
        await connection.run('SET enable_external_access = false');
        await connection.run('SET lock_configuration = true');
        executionSignal.throwIfAborted();
        const statements = await connection.extractStatements(sql);
        if (statements.count !== 1) throw new Error('Attachment queries must contain exactly one read-only SELECT statement.');
        const prepared = await statements.prepare(0);
        // Check the parsed statement, including WITH queries.
        if (prepared.statementType !== StatementType.SELECT) throw new Error('Attachment queries only support read-only SELECT statements.');
        const reader = await prepared.streamAndReadUntil(1001);
        const rows = reader.getRowObjectsJson();
        return {
            rows: rows.slice(0, 1000),
            columns: reader.columnNames().map((name, index) => ({ name, type: reader.columnType(index).toString() })),
            limited: rows.length > 1000,
            limit: 1000,
        };
    }, signal);
}

/** Cell values can be arbitrarily large; a row limit alone is not a safe model preview. */
export function boundedAttachmentRows(rows: Record<string, unknown>[], maxCharacters = 100_000) {
    const preview: Record<string, unknown>[] = [];
    let size = 0;
    for (const row of rows) {
        size += JSON.stringify(row).length;
        if (size > maxCharacters) break;
        preview.push(row);
    }
    return preview;
}
