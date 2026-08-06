import { rowDataStream, type DataColumn, type DataOpenOptions, type DataStream } from '@dory/data-plane';

import type { BaseDriver } from './base/base-driver';
import { UnsupportedDriverCapabilityError } from './base/errors';
import type { DriverDataReader, DriverRowCursor } from '../types';
export type { DriverDataReader, DriverQueryDataRequest, DriverTableDataRequest, DriverTableDataStream } from '../types';

export function createDriverDataReader(driver: BaseDriver): DriverDataReader {
    return {
        async readQuery(request, options = {}) {
            const rowStream = await driver.openRowCursorWithContext(request.sql, {
                ...request.context,
                params: request.params,
            });
            return dataStreamFromDriverRows(rowStream, {
                ...options,
                source: 'driver-query',
                metadata: {
                    driverType: driver.config.type,
                    database: request.context?.database ?? driver.config.database ?? null,
                    statistics: rowStream.statistics,
                    limited: rowStream.limited ?? false,
                    limit: rowStream.limit ?? null,
                },
            });
        },
        async readTable(request, options = {}) {
            if (request.window?.kind === 'all') {
                const openRows = driver.capabilities.tableInfo?.openRows;
                if (!openRows) throw new UnsupportedDriverCapabilityError('dataReader.readTable.all', driver.config.type);
                const rowStream = await openRows(request.database, request.table, {
                    columns: request.columns ?? [],
                    sort: request.options?.sort,
                    filters: request.options?.filters,
                    search: request.options?.search,
                    searchColumns: request.options?.searchColumns,
                });
                const stream = await dataStreamFromDriverRows(rowStream, {
                    ...options,
                    source: 'driver-table-export',
                    metadata: {
                        driverType: driver.config.type,
                        database: request.database,
                        table: request.table,
                        columns: request.columns ?? [],
                        statistics: rowStream.statistics,
                        limited: false,
                    },
                });
                return {
                    stream,
                    totalRows: rowStream.rowCount ?? null,
                    unfilteredTotalRows: null,
                    limited: false,
                    offset: 0,
                    tookMs: rowStream.tookMs,
                    statistics: rowStream.statistics,
                };
            }
            const preview = driver.capabilities.tableInfo?.preview;
            if (!preview) throw new UnsupportedDriverCapabilityError('dataReader.readTable', driver.config.type);
            const pageWindow = request.window?.kind === 'page' ? request.window : null;
            const previewOptions = {
                ...request.options,
                limit: pageWindow?.limit ?? request.options?.limit,
                offset: pageWindow?.offset ?? request.options?.offset,
                countMode: pageWindow?.countMode ?? request.options?.countMode,
            };
            const result = await preview(request.database, request.table, previewOptions);
            const rows = Array.isArray(result.rows) ? result.rows : [];
            const stream = rowDataStream({
                ...options,
                columns: columnsForRows(result.columns, rows[0]),
                rows,
                rowCount: result.rowCount ?? rows.length,
                metadata: {
                    source: 'driver-table',
                    driverType: driver.config.type,
                    database: request.database,
                    table: request.table,
                    statistics: result.statistics,
                    limited: result.limited ?? true,
                    limit: result.limit ?? request.options?.limit ?? null,
                },
            });
            return {
                stream,
                totalRows: result.totalRows ?? null,
                unfilteredTotalRows: result.unfilteredTotalRows ?? result.totalRows ?? null,
                limited: result.limited ?? true,
                limit: result.limit ?? request.options?.limit,
                offset: previewOptions.offset ?? 0,
                tookMs: result.tookMs,
                statistics: result.statistics,
            };
        },
    };
}

export async function dataStreamFromDriverRows(
    rowStream: DriverRowCursor<unknown>,
    options: DataOpenOptions & {
        source: string;
        metadata?: Record<string, unknown>;
    },
): Promise<DataStream> {
    const prepared = await prepareRows(rowStream);
    return rowDataStream({
        ...options,
        columns: prepared.columns,
        rows: prepared.rows,
        rowCount: rowStream.rowCount,
        metadata: {
            source: options.source,
            ...options.metadata,
        },
        close: rowStream.close,
    });
}

async function prepareRows(rowStream: DriverRowCursor<unknown>) {
    if (rowStream.columns?.length) {
        return { columns: columnsForRows(rowStream.columns), rows: rowStream.rows };
    }

    const iterator = toAsyncIterator(rowStream.rows);
    const first = await iterator.next();
    const resolvedColumns = rowStream.columns?.length ? columnsForRows(rowStream.columns) : columnsForRows(undefined, first.done ? undefined : first.value);
    if (first.done) return { columns: resolvedColumns, rows: emptyRows() };
    return {
        columns: resolvedColumns,
        rows: (async function* () {
            yield first.value;
            for (;;) {
                const next = await iterator.next();
                if (next.done) return;
                yield next.value;
            }
        })(),
    };
}

function columnsForRows(columns?: Array<{ name: string; type?: string }>, firstRow?: unknown): DataColumn[] {
    if (columns?.length) return columns.map(column => ({ name: column.name, type: column.type, nullable: true }));
    if (Array.isArray(firstRow)) return firstRow.map((value, index) => ({ name: `column_${index + 1}`, type: inferDatabaseType(value), nullable: true }));
    if (firstRow && typeof firstRow === 'object') {
        return Object.entries(firstRow as Record<string, unknown>).map(([name, value]) => ({ name, type: inferDatabaseType(value), nullable: true }));
    }
    return firstRow === undefined ? [] : [{ name: 'value', type: inferDatabaseType(firstRow), nullable: true }];
}

function inferDatabaseType(value: unknown) {
    if (value == null) return 'VARCHAR';
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (typeof value === 'bigint') return value < 0 ? 'BIGINT' : 'UINT64';
    if (typeof value === 'number') return Number.isInteger(value) ? 'BIGINT' : 'DOUBLE';
    if (value instanceof Date) return 'TIMESTAMP';
    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) return 'BINARY';
    if (typeof value === 'object') return 'JSON';
    return 'VARCHAR';
}

function toAsyncIterator(rows: DriverRowCursor<unknown>['rows']): AsyncIterator<unknown> {
    if (Symbol.asyncIterator in Object(rows)) return (rows as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    const iterator = (rows as Iterable<unknown>)[Symbol.iterator]();
    return {
        next: async () => iterator.next(),
        return: async value => iterator.return?.(value) ?? { done: true, value },
    };
}

async function* emptyRows(): AsyncIterable<never> {}
