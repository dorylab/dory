import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { ActionError } from '@dory/actions';
import { TableMutationConflictError, TableMutationPartialCommitError } from '@dory/drivers/table-mutations';
import type { TableUpdateBatch } from '@dory/drivers/types';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const { tableCommitUpdatesAction, validateAndCommitTableUpdates } = await import('@/lib/actions/server/domains/table/commit-updates');

const input = {
    connectionId: 'connection',
    database: 'app',
    table: 'users',
    rows: [
        {
            key: { tenant_id: 'acme', id: 7 },
            changes: [{ column: 'name', originalValue: 'Alice', nextValue: 'Alicia' }],
        },
    ],
};

const columns = [
    { columnName: 'tenant_id', columnType: 'TEXT', isPrimaryKey: true, nullable: false },
    { columnName: 'id', columnType: 'INTEGER', isPrimaryKey: true, nullable: false },
    { columnName: 'name', columnType: 'TEXT', isPrimaryKey: false, nullable: false },
];

function createInstance(
    overrides: {
        columns?: typeof columns;
        supported?: boolean;
        identityCount?: number;
        commit?: (batch: TableUpdateBatch) => Promise<{ updatedRows: number; updatedCells: number; atomicity: 'atomic' }>;
    } = {},
) {
    const batches: TableUpdateBatch[] = [];
    const commit =
        overrides.commit ??
        (async (batch: TableUpdateBatch) => {
            batches.push(batch);
            return { updatedRows: batch.rows.length, updatedCells: batch.rows.reduce((total, row) => total + row.changes.length, 0), atomicity: 'atomic' };
        });

    return {
        batches,
        instance: {
            capabilities: {
                tableMutations:
                    overrides.supported === false
                        ? undefined
                        : {
                              dialect: 'sqlite' as const,
                              atomicity: 'atomic' as const,
                              commitUpdates: commit,
                          },
            },
            describeTable: async () => overrides.columns ?? columns,
            queryWithContext: async () => ({ rows: [{ identityCount: overrides.identityCount ?? 1 }] }),
            commitTableUpdates: commit,
        },
    };
}

async function expectActionError(operation: () => Promise<unknown>, expected: { code: ActionError['code']; status: number; detailCode?: string; message?: RegExp }) {
    await assert.rejects(operation, error => {
        assert.ok(error instanceof ActionError);
        assert.equal(error.code, expected.code);
        assert.equal(error.status, expected.status);
        if (expected.detailCode) {
            assert.equal((error.details as { code?: string } | undefined)?.code, expected.detailCode);
        }
        if (expected.message) {
            assert.match(error.message, expected.message);
        }
        return true;
    });
}

test('table.commitUpdates validates its structured input', () => {
    assert.equal(tableCommitUpdatesAction.inputSchema.safeParse(input).success, true);
    assert.equal(tableCommitUpdatesAction.inputSchema.safeParse({ ...input, rows: [] }).success, false);
    assert.equal(
        tableCommitUpdatesAction.inputSchema.safeParse({
            ...input,
            rows: [{ key: { id: 7 }, changes: [{ column: 'name', originalValue: {}, nextValue: 'Alicia' }] }],
        }).success,
        false,
    );
});

test('table.commitUpdates rebuilds a validated composite-key batch', async () => {
    const { instance, batches } = createInstance();
    const result = await validateAndCommitTableUpdates(instance, input);

    assert.deepEqual(result, { updatedRows: 1, updatedCells: 1, atomicity: 'atomic' });
    assert.deepEqual(batches, [
        {
            database: 'app',
            table: 'users',
            identityColumns: ['tenant_id', 'id'],
            rows: input.rows,
        },
    ]);
});

test('table.commitUpdates supports a selected identity for keyless tables', async () => {
    const keylessColumns = columns.map(column => ({ ...column, isPrimaryKey: false }));
    const { instance, batches } = createInstance({ columns: keylessColumns });
    await validateAndCommitTableUpdates(instance, {
        ...input,
        identityColumns: ['tenant_id', 'id'],
    });
    assert.deepEqual(batches[0]?.identityColumns, ['tenant_id', 'id']);
});

test('table.commitUpdates rejects unsupported, missing identity, malformed, and identity-column mutations', async () => {
    await expectActionError(() => validateAndCommitTableUpdates(createInstance({ supported: false }).instance, input), {
        code: 'ACTION_EXECUTION_FAILED',
        status: 400,
        detailCode: 'TABLE_MUTATION_UNSUPPORTED',
    });

    await expectActionError(
        () =>
            validateAndCommitTableUpdates(
                createInstance({
                    columns: columns.map(column => ({ ...column, isPrimaryKey: false })),
                }).instance,
                input,
            ),
        {
            code: 'ACTION_INPUT_INVALID',
            status: 400,
            detailCode: 'TABLE_MUTATION_IDENTITY_REQUIRED',
        },
    );

    await expectActionError(
        () =>
            validateAndCommitTableUpdates(createInstance().instance, {
                ...input,
                rows: [{ key: { id: 7 }, changes: input.rows[0]!.changes }],
            }),
        {
            code: 'ACTION_INPUT_INVALID',
            status: 400,
            message: /complete row identity/,
        },
    );

    await expectActionError(
        () =>
            validateAndCommitTableUpdates(createInstance().instance, {
                ...input,
                rows: [
                    {
                        key: input.rows[0]!.key,
                        changes: [{ column: 'id', originalValue: 7, nextValue: 8 }],
                    },
                ],
            }),
        {
            code: 'ACTION_INPUT_INVALID',
            status: 400,
            message: /Row identity column "id" is read-only/,
        },
    );

    await expectActionError(
        () =>
            validateAndCommitTableUpdates(createInstance().instance, {
                ...input,
                rows: [
                    {
                        key: input.rows[0]!.key,
                        changes: [{ column: 'missing', originalValue: null, nextValue: 'value' }],
                    },
                ],
            }),
        {
            code: 'ACTION_INPUT_INVALID',
            status: 400,
            message: /does not exist/,
        },
    );
});

test('table.commitUpdates maps optimistic concurrency conflicts without losing row context', async () => {
    const { instance } = createInstance({
        commit: async () => {
            throw new TableMutationConflictError('Concurrent update detected.', 3);
        },
    });

    await assert.rejects(
        () => validateAndCommitTableUpdates(instance, input),
        error => {
            assert.ok(error instanceof ActionError);
            assert.equal(error.code, 'ACTION_EXECUTION_FAILED');
            assert.equal(error.status, 409);
            assert.deepEqual(error.details, {
                code: 'TABLE_MUTATION_CONFLICT',
                rowIndex: 3,
            });
            return true;
        },
    );
});

test('table.commitUpdates maps non-unique identities and partial ClickHouse commits', async () => {
    await expectActionError(() => validateAndCommitTableUpdates(createInstance({ identityCount: 2 }).instance, input), {
        code: 'ACTION_EXECUTION_FAILED',
        status: 409,
        detailCode: 'TABLE_MUTATION_IDENTITY_NOT_UNIQUE',
    });

    const { instance } = createInstance({
        commit: async () => {
            throw new TableMutationPartialCommitError([0], [1]);
        },
    });
    await assert.rejects(
        () => validateAndCommitTableUpdates(instance, input),
        error => {
            assert.ok(error instanceof ActionError);
            assert.deepEqual(error.details, {
                code: 'TABLE_MUTATION_PARTIAL_COMMIT',
                committedRowIndexes: [0],
                pendingRowIndexes: [1],
            });
            return true;
        },
    );
});
