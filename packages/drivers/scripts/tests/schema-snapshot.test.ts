import assert from 'node:assert/strict';

import { collectGenericSchemaSnapshot } from '../../src/core/schema-snapshot';
import type { ConnectionMetadataAPI, DriverConfig, SchemaGraphResult } from '../../src/types';

const graph: SchemaGraphResult = {
    status: 'ready',
    tables: [
        {
            id: 'public.users',
            database: 'app',
            schema: 'public',
            name: 'users',
            kind: 'table',
            scope: 'selected',
            columns: [
                {
                    name: 'id',
                    dataType: 'integer',
                    ordinal: 1,
                    nullable: false,
                    isPrimaryKey: true,
                    isForeignKey: false,
                },
            ],
        },
    ],
    relationships: [],
    totalTables: 1,
    totalRelationships: 0,
    limits: { maxTables: 200, maxRelationships: 1000 },
    capabilities: {
        relationships: true,
        compositeForeignKeys: true,
        cardinality: true,
        referentialActions: true,
        constraintsEnforced: true,
    },
};

for (const type of ['clickhouse', 'cloudflare-d1', 'duckdb', 'mariadb', 'mysql', 'neon', 'oracle', 'postgres', 'sqlite', 'snowflake', 'supabase', 'sqlserver'] as const) {
    const calls: string[] = [];
    const metadata: ConnectionMetadataAPI = {
        getDatabases: async () => [],
        getTables: async () => [],
        getSchemaGraph: async options => {
            calls.push(`graph:${options.schemas?.join(',')}`);
            return graph;
        },
        getTablesOnly: async () => {
            calls.push('tables');
            return [{ name: 'users', schema: 'public', totalRows: 10, totalBytes: 100 }];
        },
        getViews: async () => {
            calls.push('views');
            return [];
        },
        getMaterializedViews: async () => {
            calls.push('materialized_views');
            return [];
        },
    };
    const config: DriverConfig = { id: type, type, host: 'localhost', database: 'app' };
    const snapshot = await collectGenericSchemaSnapshot(config, metadata, {
        database: 'app',
        schemas: ['public'],
    });
    assert.equal(snapshot.tables.length, 1);
    assert.equal(snapshot.tables[0]?.statistics?.estimatedRows, 10);
    assert.equal(snapshot.schemas[0], 'public');
    assert.equal(calls.length, 4, `${type} used a fixed number of catalog calls`);
    assert.equal(snapshot.coverage.indexes, type === 'snowflake' ? 'not_applicable' : 'unavailable');
}

console.log('driver schema snapshot contract tests passed');
