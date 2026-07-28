import { z } from 'zod';
import { ActionError } from '@dory/actions';
import type { TableColumnInfo, TableMutationAPI, TableMutationValue, TableUpdateBatch, TableUpdateResult, TableUpdateRow } from '@dory/drivers/types';
import { TABLE_MUTATION_CONFLICT_CODE, TableMutationConflictError } from '@dory/drivers/table-mutations';

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
    changes: z.array(changeSchema).min(1).max(200),
});
const inputSchema = z.object({
    connectionId: z.string().min(1).optional(),
    identityId: z.string().min(1).optional(),
    database: z.string().min(1),
    table: z.string().min(1),
    rows: z.array(rowSchema).min(1).max(100),
});
const outputSchema = z.object({
    updatedRows: z.number().int().nonnegative(),
    updatedCells: z.number().int().nonnegative(),
});

type CommitUpdatesInput = z.infer<typeof inputSchema>;

type TableMutationConnection = {
    capabilities: {
        tableMutations?: TableMutationAPI;
    };
    describeTable: (database: string, table: string) => Promise<TableColumnInfo[]>;
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
    if (!instance.capabilities.tableMutations) {
        throw new ActionError('ACTION_EXECUTION_FAILED', 'This data source does not support table editing.', {
            status: 400,
            details: { code: 'TABLE_MUTATION_UNSUPPORTED' },
        });
    }

    const columns = await instance.describeTable(input.database, input.table);
    const columnsByName = new Map(columns.map(column => [column.columnName, column]));
    const primaryKeyColumns = columns.filter(column => toBoolean(column.isPrimaryKey)).map(column => column.columnName);
    if (!primaryKeyColumns.length) {
        invalidMutation('This table has no primary key and is read-only.', {
            code: 'TABLE_MUTATION_PRIMARY_KEY_REQUIRED',
        });
    }

    const rows: TableUpdateRow[] = input.rows.map((row, rowIndex) => {
        const keyColumns = Object.keys(row.key);
        if (keyColumns.length !== primaryKeyColumns.length || primaryKeyColumns.some(column => !Object.prototype.hasOwnProperty.call(row.key, column))) {
            invalidMutation(`Changed row ${rowIndex + 1} does not contain the complete primary key.`);
        }

        const seen = new Set<string>();
        for (const change of row.changes) {
            if (!columnsByName.has(change.column)) {
                invalidMutation(`Column "${change.column}" does not exist in this table.`);
            }
            if (primaryKeyColumns.includes(change.column)) {
                invalidMutation(`Primary key column "${change.column}" is read-only.`);
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

    try {
        return await instance.commitTableUpdates({
            database: input.database,
            table: input.table,
            primaryKeyColumns,
            rows,
        });
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
        allowInputFields: ['connectionId', 'identityId', 'database', 'table'],
        inputSummary: input => ({
            connectionId: input.connectionId ?? null,
            identityId: input.identityId ?? null,
            database: input.database,
            table: input.table,
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
