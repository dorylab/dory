import assert from 'node:assert/strict';

import { compareSchemaSnapshots, finalizeSchemaSnapshot, schemaChangesToResultRows, type SchemaSnapshot, type SchemaSnapshotCoverage } from '../../src/index';

const fullCoverage: SchemaSnapshotCoverage = {
    tables: 'complete',
    columns: 'complete',
    indexes: 'complete',
    constraints: 'complete',
    views: 'complete',
    statistics: 'complete',
};

function snapshot(overrides: Partial<Omit<SchemaSnapshot, 'version' | 'contentHash'>> = {}) {
    return finalizeSchemaSnapshot({
        family: 'postgres',
        engine: 'postgres',
        database: 'app',
        schemas: ['public'],
        capturedAt: '2026-07-23T00:00:00.000Z',
        coverage: fullCoverage,
        tables: [],
        views: [],
        ...overrides,
    });
}

const current = snapshot({
    tables: [
        {
            schema: 'public',
            name: 'users',
            statistics: { estimatedRows: 23_000_000, totalBytes: 1000, source: 'catalog_estimate' },
            attributes: {},
            columns: [
                { name: 'id', dataType: 'integer', nullable: false, ordinal: 1 },
                { name: 'email', dataType: 'varchar(100)', nullable: false, ordinal: 2 },
                { name: 'legacy', dataType: 'text', nullable: true, ordinal: 3 },
            ],
            indexes: [{ name: 'idx_users_email', columns: ['email'], unique: false, scans: 82 }],
            constraints: [{ name: 'users_pkey', kind: 'primary_key', columns: ['id'] }],
        },
    ],
    views: [{ schema: 'public', name: 'active_users', kind: 'view', definition: 'SELECT * FROM users WHERE active = true;' }],
});

const desired = snapshot({
    tables: [
        {
            schema: 'public',
            name: 'users',
            statistics: { estimatedRows: 10, totalBytes: 100, source: 'catalog_estimate' },
            attributes: {},
            columns: [
                { name: 'id', dataType: 'int', nullable: false, ordinal: 1 },
                { name: 'email', dataType: 'varchar(255)', nullable: true, ordinal: 2 },
                { name: 'status', dataType: 'text', nullable: false, ordinal: 3 },
            ],
            indexes: [{ name: 'idx_users_email_v2', columns: ['email'], unique: false, scans: null }],
            constraints: [{ name: 'pk_users', kind: 'primary_key', columns: ['id'] }],
        },
    ],
    views: [{ schema: 'public', name: 'active_users', kind: 'view', definition: 'SELECT id FROM users WHERE active = true' }],
});

const comparison = compareSchemaSnapshots(current, desired);
assert.deepEqual(comparison, compareSchemaSnapshots(current, desired));
assert.equal(comparison.summary.readiness, 'unsafe');
assert.equal(comparison.summary.breakingChanges, 2);
assert.ok(comparison.changes.some(change => change.objectPath === 'public.users.email' && change.attribute === 'data_type' && change.risk.level === 'low'));
assert.ok(comparison.changes.some(change => change.objectPath === 'public.users.email' && change.attribute === 'nullable' && change.risk.level === 'medium'));
assert.ok(comparison.changes.some(change => change.objectPath === 'public.users.legacy' && change.changeType === 'removed' && change.risk.breaking));
assert.ok(comparison.changes.some(change => change.objectPath === 'public.users.status' && change.risk.code === 'required_column_without_default'));
assert.ok(comparison.changes.some(change => change.objectType === 'index' && change.changeType === 'renamed'));
assert.ok(comparison.changes.some(change => change.objectType === 'constraint' && change.changeType === 'renamed'));
assert.ok(comparison.changes.some(change => change.objectType === 'view' && change.changeType === 'modified'));

const rows = schemaChangesToResultRows(comparison.changes);
assert.equal(rows.length, comparison.summary.totalChanges);
assert.ok(rows.every(row => row.changeCount === 1));
assert.ok(rows.some(row => row.estimatedRows === 23_000_000));
assert.ok(compareSchemaSnapshots(desired, current).changes.some(change => change.objectPath === 'public.users.status' && change.changeType === 'removed'));

const partialDesired = snapshot({
    coverage: { ...fullCoverage, indexes: 'unavailable' },
    tables: current.tables,
    views: current.views,
});
const partial = compareSchemaSnapshots(current, partialDesired);
assert.equal(partial.summary.readiness, 'unknown');
assert.equal(
    partial.changes.some(change => change.objectType === 'index' && change.changeType === 'removed'),
    false,
);
assert.ok(partial.warnings.some(warning => warning.includes('indexes coverage is unavailable')));

const notApplicable = compareSchemaSnapshots(
    snapshot({ coverage: { ...fullCoverage, indexes: 'not_applicable' } }),
    snapshot({ coverage: { ...fullCoverage, indexes: 'not_applicable' } }),
);
assert.equal(notApplicable.coverage.indexes, 'not_applicable');
assert.equal(notApplicable.summary.readiness, 'compatible');

const objectLifecycle = compareSchemaSnapshots(
    snapshot({
        tables: [
            {
                schema: 'public',
                name: 'removed_table',
                columns: [],
                indexes: [],
                constraints: [],
            },
            {
                schema: 'public',
                name: 'inventory',
                columns: [{ name: 'sku', dataType: 'text', nullable: false, defaultExpression: "'old'", ordinal: 1 }],
                indexes: [
                    { name: 'idx_inventory_modified', columns: ['sku'], unique: false },
                    { name: 'idx_inventory_removed', columns: ['sku'], unique: false },
                ],
                constraints: [
                    { name: 'inventory_sku_key', kind: 'unique', columns: ['sku'] },
                    { name: 'inventory_check_removed', kind: 'check', columns: [], expression: 'length(sku) > 0' },
                ],
            },
        ],
        views: [
            { schema: 'public', name: 'removed_view', kind: 'view', definition: 'select 1' },
            { schema: 'public', name: 'inventory_rollup', kind: 'materialized_view', definition: 'select sku from inventory' },
        ],
    }),
    snapshot({
        tables: [
            {
                schema: 'public',
                name: 'added_table',
                columns: [],
                indexes: [],
                constraints: [],
            },
            {
                schema: 'public',
                name: 'inventory',
                columns: [{ name: 'sku', dataType: 'text', nullable: false, defaultExpression: "'new'", ordinal: 1 }],
                indexes: [
                    { name: 'idx_inventory_modified', columns: ['sku'], unique: true },
                    { name: 'idx_inventory_added', columns: ['sku'], unique: false, predicate: 'sku is not null' },
                ],
                constraints: [
                    { name: 'inventory_sku_key', kind: 'unique', columns: ['sku', 'warehouse_id'] },
                    { name: 'inventory_check_added', kind: 'check', columns: [], expression: 'length(sku) > 1' },
                ],
            },
        ],
        views: [
            { schema: 'public', name: 'added_view', kind: 'view', definition: 'select 2' },
            { schema: 'public', name: 'inventory_rollup', kind: 'materialized_view', definition: 'select sku, count(*) from inventory group by sku' },
        ],
    }),
);
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'table' && change.objectPath === 'public.removed_table' && change.changeType === 'removed'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'table' && change.objectPath === 'public.added_table' && change.changeType === 'added'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'column' && change.attribute === 'default' && change.risk.level === 'medium'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'index' && change.changeType === 'modified' && change.risk.level === 'medium'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'index' && change.changeType === 'removed'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'index' && change.changeType === 'added'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'constraint' && change.changeType === 'modified' && change.risk.breaking));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'constraint' && change.changeType === 'removed'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'constraint' && change.changeType === 'added'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'view' && change.changeType === 'removed'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'view' && change.changeType === 'added'));
assert.ok(objectLifecycle.changes.some(change => change.objectType === 'materialized_view' && change.changeType === 'modified'));

const numericCurrent = snapshot({
    tables: [
        {
            schema: 'public',
            name: 'metrics',
            attributes: {},
            columns: [{ name: 'amount', dataType: 'numeric(10,2)', nullable: false, ordinal: 1 }],
            indexes: [],
            constraints: [],
        },
    ],
});
const numericWider = snapshot({
    tables: [
        {
            schema: 'public',
            name: 'metrics',
            attributes: {},
            columns: [{ name: 'amount', dataType: 'decimal(14,4)', nullable: false, ordinal: 1 }],
            indexes: [],
            constraints: [],
        },
    ],
});
const numericNarrower = snapshot({
    tables: [
        {
            schema: 'public',
            name: 'metrics',
            attributes: {},
            columns: [{ name: 'amount', dataType: 'numeric(8,2)', nullable: false, ordinal: 1 }],
            indexes: [],
            constraints: [],
        },
    ],
});
assert.equal(compareSchemaSnapshots(numericCurrent, numericWider).changes[0]?.risk.code, 'column_type_widened');
assert.equal(compareSchemaSnapshots(numericCurrent, numericNarrower).changes[0]?.risk.code, 'column_type_narrowed');

assert.deepEqual(compareSchemaSnapshots(current, current).changes, []);
assert.equal(compareSchemaSnapshots(current, current).summary.readiness, 'compatible');

assert.throws(
    () =>
        compareSchemaSnapshots(
            current,
            snapshot({
                family: 'mysql',
            }),
        ),
    /same dialect family/,
);

console.log('schema comparison core tests passed');
