import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { getSqliteSchemaGraph } from '../../src/database/sqlite/runtime';

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
db.exec(`
    CREATE TABLE tenants (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
    );
    CREATE TABLE users (
        tenant_id INTEGER NOT NULL,
        id INTEGER NOT NULL,
        manager_id INTEGER,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (tenant_id, manager_id) REFERENCES users(tenant_id, id)
    );
    CREATE TABLE tenant_settings (
        tenant_id INTEGER NOT NULL UNIQUE,
        theme TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
`);

const graph = getSqliteSchemaGraph(db, {
    database: 'main',
    focusTables: [{ name: 'users' }],
    depth: 2,
    columnMode: 'all',
});

assert.equal(graph.status, 'ready');
assert.equal(graph.capabilities.relationships, true);
assert.deepEqual(
    graph.tables.map(table => [table.name, table.scope]),
    [
        ['tenant_settings', 'related'],
        ['tenants', 'related'],
        ['users', 'selected'],
    ],
);
assert.equal(graph.relationships.length, 3);
assert.deepEqual(graph.relationships.find(relationship => relationship.sourceColumns.length === 2)?.sourceColumns, ['tenant_id', 'manager_id']);
assert.equal(graph.relationships.find(relationship => relationship.sourceColumns.includes('manager_id'))?.sourceOptional, true);
assert.equal(graph.relationships.find(relationship => relationship.sourceTableId.includes('tenant_settings'))?.sourceUnique, true);
assert.equal(graph.tables.find(table => table.name === 'users')?.columns.find(column => column.name === 'manager_id')?.isForeignKey, true);

db.close();
console.log('sqlite schema graph tests passed');
