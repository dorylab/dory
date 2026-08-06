import { z } from 'zod';
import { ActionError } from '@dory/actions';
import type { DriverQueryParams } from '@dory/drivers/core';
import type { QueryResult, TableColumnInfo, TableMutationAPI, TableMutationValue, TableUpdateBatch, TableUpdateResult, TableUpdateRow } from '@dory/drivers/types';
import {
    bindTableMutationParams,
    buildTableIdentityCountStatements,
    isEditableTableMutationColumnType,
    MAX_TABLE_UPDATE_CHANGES_PER_ROW,
    MAX_TABLE_UPDATE_ROWS,
    TABLE_MUTATION_CONFLICT_CODE,
    TABLE_MUTATION_IDENTITY_NOT_UNIQUE_CODE,
    TABLE_MUTATION_PARTIAL_COMMIT_CODE,
    TableMutationConflictError,
    TableMutationIdentityNotUniqueError,
    TableMutationPartialCommitError,
} from '@dory/drivers/table-mutations';

import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';

const mutationValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const changeSchema = z.object({
    column: z.string().min(1),
    originalValue: mutationValueSchema,
    nextValue: mutationValueSchema,
});
const rowSchema = z.object({
    key: z.record(z.string().min(1), mutationValueSchema),
    changes: z.array(changeSchema).min(1).max(MAX_TABLE_UPDATE_CHANGES_PER_ROW),
});
const inputSchema = z.object({
    connectionId: z.string().min(1).optional(),
    identityId: z.string().min(1).optional(),
    database: z.string().min(1),
    table: z.string().min(1),
    identityColumns: z.array(z.string().min(1)).min(1).max(50).optional(),
    rows: z.array(rowSchema).min(1).max(MAX_TABLE_UPDATE_ROWS),
});
const outputSchema = z.object({
    updatedRows: z.number().int().nonnegative(),
    updatedCells: z.number().int().nonnegative(),
    atomicity: z.enum(['atomic', 'best-effort']),
});

type CommitUpdatesInput = z.infer<typeof inputSchema>;

type TableMutationConnection = {
    config?: { options?: Record<string, unknown> };
    capabilities: {
        tableMutations?: TableMutationAPI;
    };
    describeTable: (database: string, table: string) => Promise<TableColumnInfo[]>;
    queryWithContext: <Row = Record<string, unknown>>(sql: string, context: { database: string; params?: DriverQueryParams }) => Promise<QueryResult<Row>>;
    commitTableUpdates: (input: TableUpdateBatch) => Promise<TableUpdateResult>;
};

function toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return ['true', 't', 'yes', 'y', '1'].includes(value.toLowerCase());
    return false;
}

function invalidMutation(message: string, details?: Record<string, unknown>): never {
    throw new ActionError('ACTION_INPUT_INVALID', message, {
        status: 400,
        details,
    });
}

export async function validateAndCommitTableUpdates(instance: TableMutationConnection, input: CommitUpdatesInput): Promise<TableUpdateResult> {
    const mutationAPI = instance.capabilities.tableMutations;
    if (!mutationAPI) {
        throw new ActionError('ACTION_EXECUTION_FAILED', 'This data source does not support table editing.', {
            status: 400,
            details: { code: 'TABLE_MUTATION_UNSUPPORTED' },
        });
    }

    const columns = await instance.describeTable(input.database, input.table);
    const columnsByName = new Map(columns.map(column => [column.columnName, column]));
    const primaryKeyColumns = columns.filter(column => toBoolean(column.isPrimaryKey)).map(column => column.columnName);
    const identityColumns = input.identityColumns ?? primaryKeyColumns;
    if (!identityColumns.length) {
        invalidMutation('Select one or more row identity columns before editing this table.', {
            code: 'TABLE_MUTATION_IDENTITY_REQUIRED',
        });
    }
    if (new Set(identityColumns).size !== identityColumns.length) {
        invalidMutation('Row identity columns cannot contain duplicates.');
    }
    for (const columnName of identityColumns) {
        const column = columnsByName.get(columnName);
        if (!column) invalidMutation(`Row identity column "${columnName}" does not exist in this table.`);
        if (!isEditableTableMutationColumnType(column.columnType)) {
            invalidMutation(`Column "${columnName}" cannot be used as a row identity because it is not a scalar type.`);
        }
    }
    if (primaryKeyColumns.some(column => !identityColumns.includes(column))) {
        invalidMutation('The row identity must include every primary key column.');
    }

    const seenRowIdentities = new Set<string>();
    const rows: TableUpdateRow[] = input.rows.map((row, rowIndex) => {
        const keyColumns = Object.keys(row.key);
        if (keyColumns.length !== identityColumns.length || identityColumns.some(column => !Object.prototype.hasOwnProperty.call(row.key, column))) {
            invalidMutation(`Changed row ${rowIndex + 1} does not contain the complete row identity.`);
        }
        const serializedIdentity = JSON.stringify(identityColumns.map(column => [column, row.key[column]]));
        if (seenRowIdentities.has(serializedIdentity)) {
            invalidMutation(`Changed row ${rowIndex + 1} repeats a row identity already present in this batch.`);
        }
        seenRowIdentities.add(serializedIdentity);

        const seen = new Set<string>();
        for (const change of row.changes) {
            const column = columnsByName.get(change.column);
            if (!column) {
                invalidMutation(`Column "${change.column}" does not exist in this table.`);
            }
            if (!isEditableTableMutationColumnType(column.columnType)) {
                invalidMutation(`Column "${change.column}" is not an editable scalar type.`);
            }
            if (identityColumns.includes(change.column)) {
                invalidMutation(`Row identity column "${change.column}" is read-only.`);
            }
            if (seen.has(change.column)) {
                invalidMutation(`Column "${change.column}" is changed more than once in row ${rowIndex + 1}.`);
            }
            seen.add(change.column);
        }

        return {
            key: row.key as Record<string, TableMutationValue>,
            changes: row.changes,
        };
    });

    const snowflakeSchema = typeof instance.config?.options?.schema === 'string' ? instance.config.options.schema.trim() : '';
    const mutationTable = mutationAPI.dialect === 'snowflake' && !input.table.includes('.') ? `${snowflakeSchema || 'PUBLIC'}.${input.table}` : input.table;
    const batch: TableUpdateBatch = {
        database: input.database,
        table: mutationTable,
        identityColumns,
        rows,
    };

    try {
        const identityChecks = mutationAPI.dialect === 'clickhouse' ? [] : buildTableIdentityCountStatements(mutationAPI.dialect, batch);
        for (const statement of identityChecks) {
            const result = await instance.queryWithContext<Record<string, unknown>>(statement.sql, {
                database: input.database,
                params: bindTableMutationParams(mutationAPI.dialect, statement.params),
            });
            const row = result.rows[0] ?? {};
            const count = Number(row.identityCount ?? row.IDENTITYCOUNT ?? Object.values(row)[0]);
            if (count !== 1) throw new TableMutationIdentityNotUniqueError(undefined, statement.rowIndex);
        }

        return await instance.commitTableUpdates(batch);
    } catch (error) {
        if (error instanceof TableMutationConflictError) {
            throw new ActionError('ACTION_EXECUTION_FAILED', error.message, {
                status: 409,
                details: {
                    code: TABLE_MUTATION_CONFLICT_CODE,
                    rowIndex: error.rowIndex,
                },
                cause: error,
            });
        }
        if (error instanceof TableMutationIdentityNotUniqueError) {
            throw new ActionError('ACTION_EXECUTION_FAILED', error.message, {
                status: 409,
                details: {
                    code: TABLE_MUTATION_IDENTITY_NOT_UNIQUE_CODE,
                    rowIndex: error.rowIndex,
                },
                cause: error,
            });
        }
        if (error instanceof TableMutationPartialCommitError) {
            throw new ActionError('ACTION_EXECUTION_FAILED', error.message, {
                status: 409,
                details: {
                    code: TABLE_MUTATION_PARTIAL_COMMIT_CODE,
                    committedRowIndexes: error.committedRowIndexes,
                    pendingRowIndexes: error.pendingRowIndexes,
                },
                cause: error,
            });
        }
        throw error;
    }
}

export const tableCommitUpdatesAction = defineWebAction({
    id: 'table.commitUpdates',
    domain: 'table',
    kind: 'command',
    risk: 'write',
    inputSchema,
    outputSchema,
    permissions: writeWorkspace,
    scopes: ['query:write'],
    actors: ['user'],
    requiresConfirmation: false,
    effects: ['table:update'],
    audit: {
        sourceByActor: {
            user: 'user_table_editor',
        },
        allowInputFields: ['connectionId', 'identityId', 'database', 'table', 'identityColumns'],
        inputSummary: input => ({
            connectionId: input.connectionId ?? null,
            identityId: input.identityId ?? null,
            database: input.database,
            table: input.table,
            identityColumns: input.identityColumns ?? null,
            rowCount: input.rows.length,
            cellCount: input.rows.reduce((total, row) => total + row.changes.length, 0),
        }),
        resource: (_ctx, input) => ({
            type: 'connection',
            id: input.connectionId ?? null,
            metadata: {
                database: input.database,
                table: input.table,
            },
        }),
        outputSummary: output => ({
            updatedRows: output.updatedRows,
            updatedCells: output.updatedCells,
            atomicity: output.atomicity,
        }),
    },
    handler: async (ctx, input) => {
        const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
        if (!connectionId) {
            invalidMutation('Missing connectionId.');
        }

        const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
        return validateAndCommitTableUpdates(entry.instance, input);
    },
});
