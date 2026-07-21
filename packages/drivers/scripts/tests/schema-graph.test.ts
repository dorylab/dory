import assert from 'node:assert/strict';
import { buildSchemaGraphResult, SCHEMA_GRAPH_MAX_TABLES } from '../../src/core/schema-graph';
import type { SchemaGraphColumn } from '../../src/types';

function column(name: string, ordinal: number, options: Partial<SchemaGraphColumn> = {}): SchemaGraphColumn {
    return {
        name,
        dataType: 'uuid',
        ordinal,
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        ...options,
    };
}

const capabilities = {
    relationships: true,
    compositeForeignKeys: true,
    cardinality: true,
    referentialActions: true,
    constraintsEnforced: true,
};

const graph = buildSchemaGraphResult(
    { database: 'app', schemas: ['sales'], depth: 1, columnMode: 'keys' },
    [
        {
            database: 'app',
            schema: 'sales',
            name: 'orders',
            columns: [column('tenant_id', 1, { isPrimaryKey: true }), column('id', 2, { isPrimaryKey: true }), column('customer_id', 3), column('note', 4)],
        },
        {
            database: 'app',
            schema: 'crm',
            name: 'customers',
            columns: [column('tenant_id', 1, { isPrimaryKey: true }), column('id', 2, { isPrimaryKey: true }), column('name', 3)],
        },
    ],
    [
        {
            constraintName: 'orders_customer_fk',
            sourceSchema: 'sales',
            sourceTable: 'orders',
            sourceColumns: ['tenant_id', 'customer_id'],
            targetSchema: 'crm',
            targetTable: 'customers',
            targetColumns: ['tenant_id', 'id'],
            sourceUnique: false,
            sourceOptional: false,
            onUpdate: 'NO ACTION',
            onDelete: 'CASCADE',
        },
    ],
    capabilities,
);

assert.equal(graph.status, 'ready');
assert.equal(graph.tables.length, 2);
assert.equal(graph.tables.find(table => table.name === 'customers')?.scope, 'related');
assert.deepEqual(
    graph.tables.find(table => table.name === 'orders')?.columns.map(item => item.name),
    ['tenant_id', 'id', 'customer_id'],
);
assert.deepEqual(graph.relationships[0]?.sourceColumns, ['tenant_id', 'customer_id']);
assert.equal(graph.relationships[0]?.sourceOptional, false);

const neighborhoodTables = ['accounts', 'teams', 'memberships'].map(name => ({
    database: 'app',
    schema: 'public',
    name,
    columns: [column('id', 1, { isPrimaryKey: true }), column('parent_id', 2)],
}));
const neighborhoodRelationships = [
    {
        constraintName: 'accounts_parent_fk',
        sourceSchema: 'public',
        sourceTable: 'accounts',
        sourceColumns: ['parent_id'],
        targetSchema: 'public',
        targetTable: 'accounts',
        targetColumns: ['id'],
        sourceUnique: false,
        sourceOptional: true,
        onUpdate: null,
        onDelete: null,
    },
    {
        constraintName: 'memberships_account_fk',
        sourceSchema: 'public',
        sourceTable: 'memberships',
        sourceColumns: ['parent_id'],
        targetSchema: 'public',
        targetTable: 'accounts',
        targetColumns: ['id'],
        sourceUnique: false,
        sourceOptional: false,
        onUpdate: null,
        onDelete: null,
    },
    {
        constraintName: 'memberships_team_fk',
        sourceSchema: 'public',
        sourceTable: 'teams',
        sourceColumns: ['parent_id'],
        targetSchema: 'public',
        targetTable: 'memberships',
        targetColumns: ['id'],
        sourceUnique: true,
        sourceOptional: false,
        onUpdate: null,
        onDelete: null,
    },
];
const neighborhood = buildSchemaGraphResult(
    { database: 'app', focusTables: [{ schema: 'public', name: 'accounts' }], depth: 2 },
    neighborhoodTables,
    neighborhoodRelationships,
    capabilities,
);
assert.deepEqual(
    neighborhood.tables.map(table => [table.name, table.scope]),
    [
        ['accounts', 'selected'],
        ['memberships', 'related'],
        ['teams', 'related'],
    ],
);
assert.equal(neighborhood.relationships.find(relationship => relationship.constraintName === 'accounts_parent_fk')?.sourceOptional, true);
assert.deepEqual(
    neighborhood.relationships.map(relationship => relationship.id),
    [...neighborhood.relationships.map(relationship => relationship.id)].sort(),
);

const tooLarge = buildSchemaGraphResult(
    { database: 'app' },
    Array.from({ length: SCHEMA_GRAPH_MAX_TABLES + 1 }, (_, index) => ({
        database: 'app',
        schema: 'public',
        name: `table_${index}`,
        columns: [column('id', 1, { isPrimaryKey: true })],
    })),
    [],
    capabilities,
);
assert.equal(tooLarge.status, 'too_large');
assert.equal(tooLarge.tables.length, 0);
assert.equal(tooLarge.totalTables, SCHEMA_GRAPH_MAX_TABLES + 1);

console.log('schema graph tests passed');
