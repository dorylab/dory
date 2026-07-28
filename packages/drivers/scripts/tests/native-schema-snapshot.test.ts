import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { getClickHouseSchemaSnapshot } from '../../src/database/clickhouse/capabilities/schema-snapshot';
import type { ClickhouseDatasource } from '../../src/database/clickhouse/datasource';
import { getDuckDbSchemaSnapshot } from '../../src/database/duckdb/capabilities/schema-snapshot';
import { DuckDbDatasource } from '../../src/database/duckdb/datasource';
import { getSnowflakeSchemaSnapshot } from '../../src/database/snowflake/capabilities/schema-snapshot';
import type { SnowflakeDatasource } from '../../src/database/snowflake/datasource';
import { getSqlServerSchemaSnapshot } from '../../src/database/sqlserver/capabilities/schema-snapshot';
import type { SqlServerDatasource } from '../../src/database/sqlserver/datasource';

function fakeDatasource(resolver: (sql: string, context: unknown) => unknown[]) {
    const calls: Array<{ sql: string; context: unknown }> = [];
    return {
        calls,
        datasource: {
            queryWithContext: async (sql: string, context: unknown) => {
                calls.push({ sql, context });
                return { rows: resolver(sql, context) };
            },
        },
    };
}

{
    const fake = fakeDatasource(sql => {
        if (sql.includes('information_schema.columns')) {
            return [
                {
                    schemaName: 'main',
                    tableName: 'users',
                    columnName: 'id',
                    dataType: 'INTEGER',
                    nullable: 'NO',
                    ordinal: 1,
                    generated: 'NEVER',
                },
            ];
        }
        if (sql.includes('duckdb_indexes')) return [{ schemaName: 'main', tableName: 'users', indexName: 'users_id', expressions: "['id']", uniqueIndex: true }];
        if (sql.includes('duckdb_constraints')) return [{ schemaName: 'main', tableName: 'users', constraintName: 'users_pk', constraintType: 'PRIMARY KEY', columns: ['id'] }];
        return [{ schemaName: 'main', viewName: 'active_users', definition: 'select * from users' }];
    });
    const snapshot = await getDuckDbSchemaSnapshot(fake.datasource as unknown as DuckDbDatasource, { database: 'memory', schemas: ['main'] });
    assert.equal(fake.calls.length, 4);
    assert.equal(snapshot.tables[0]?.columns[0]?.dataType, 'INTEGER');
    assert.equal(snapshot.tables[0]?.indexes[0]?.unique, true);
    assert.equal(snapshot.coverage.constraints, 'complete');
}

{
    const fake = fakeDatasource(sql => {
        if (sql.includes('FROM sys.tables t') && sql.includes('JOIN sys.columns c')) {
            return [
                {
                    schemaName: 'dbo',
                    tableName: 'users',
                    columnName: 'id',
                    dataType: 'int',
                    nullable: false,
                    ordinal: 1,
                    identityColumn: true,
                    identitySeed: 1,
                    identityIncrement: 1,
                },
            ];
        }
        if (sql.includes('FROM sys.indexes')) return [];
        if (sql.includes('FROM sys.key_constraints'))
            return [{ schemaName: 'dbo', tableName: 'users', constraintName: 'users_pk', constraintType: 'PK', columnName: 'id', ordinal: 1 }];
        if (sql.includes('FROM sys.views')) return [];
        return [{ schemaName: 'dbo', tableName: 'users', estimatedRows: 10, totalBytes: 8192 }];
    });
    const snapshot = await getSqlServerSchemaSnapshot(fake.datasource as unknown as SqlServerDatasource, { database: 'app', schemas: ['dbo'] });
    assert.equal(fake.calls.length, 5);
    assert.equal(snapshot.tables[0]?.columns[0]?.attributes?.identity, true);
    assert.equal(snapshot.tables[0]?.statistics?.totalBytes, 8192);
}

{
    const fake = fakeDatasource(sql => {
        if (sql.includes('.COLUMNS')) {
            return [
                {
                    schemaName: 'PUBLIC',
                    tableName: 'ORDERS',
                    columnName: 'AMOUNT',
                    dataType: 'NUMBER(12,2)',
                    nullable: 'NO',
                    ordinal: 1,
                },
            ];
        }
        if (sql.includes('.TABLES')) return [{ schemaName: 'PUBLIC', tableName: 'ORDERS', clusteringKey: 'LINEAR(CUSTOMER_ID)', estimatedRows: 20, totalBytes: 1000 }];
        if (sql.includes('.TABLE_CONSTRAINTS')) return [];
        if (sql.includes('.VIEWS')) return [];
        return [];
    });
    const snapshot = await getSnowflakeSchemaSnapshot(fake.datasource as unknown as SnowflakeDatasource, { database: 'ANALYTICS', schemas: ['PUBLIC'] });
    assert.equal(fake.calls.length, 5);
    assert.equal(snapshot.coverage.indexes, 'not_applicable');
    assert.equal(snapshot.tables[0]?.attributes?.clustering_key, 'LINEAR(CUSTOMER_ID)');
}

{
    const fake = fakeDatasource(sql => {
        if (sql.includes('FROM system.columns')) {
            return [
                {
                    tableName: 'events',
                    columnName: 'payload',
                    dataType: 'Nullable(String)',
                    ordinal: 1,
                    codecExpression: 'ZSTD(1)',
                },
            ];
        }
        if (sql.includes('FROM system.tables')) {
            return [
                {
                    tableName: 'events',
                    engine: 'MergeTree',
                    sortingKey: 'created_at',
                    primaryKey: 'created_at',
                    partitionKey: 'toYYYYMM(created_at)',
                    createQuery: 'CREATE TABLE events (...) ENGINE = MergeTree ORDER BY created_at TTL created_at + INTERVAL 30 DAY',
                    estimatedRows: 100,
                    totalBytes: 2048,
                },
            ];
        }
        return [{ tableName: 'events', indexName: 'payload_idx', indexType: 'tokenbf_v1', expression: 'payload', granularity: 4 }];
    });
    const snapshot = await getClickHouseSchemaSnapshot(fake.datasource as unknown as ClickhouseDatasource, { database: 'analytics' });
    assert.equal(fake.calls.length, 3);
    assert.equal(snapshot.tables[0]?.columns[0]?.dataType, 'String');
    assert.equal(snapshot.tables[0]?.columns[0]?.nullable, true);
    assert.equal(snapshot.tables[0]?.attributes?.ttl, 'created_at + INTERVAL 30 DAY');
    assert.equal(snapshot.coverage.constraints, 'partial');
}

{
    const calls: string[] = [];
    const datasource = {
        queryWithContext: async (sql: string) => {
            calls.push(sql);
            if (sql.includes('duckdb_indexes')) throw new Error('permission denied');
            return { rows: [] };
        },
    };
    const snapshot = await getDuckDbSchemaSnapshot(datasource as unknown as DuckDbDatasource, { database: 'memory' });
    assert.equal(calls.length, 4);
    assert.equal(snapshot.coverage.indexes, 'unavailable');
    assert.ok(snapshot.warnings?.some(warning => warning.includes('index catalogs')));
}

{
    const datasource = {
        queryWithContext: async () => {
            throw new Error('connection lost');
        },
    };
    await assert.rejects(() => getDuckDbSchemaSnapshot(datasource as unknown as DuckDbDatasource, { database: 'memory' }), /catalogs are unavailable/);
}

{
    const databasePath = path.join(os.tmpdir(), `dory-schema-compare-${randomUUID()}.duckdb`);
    const datasource = new DuckDbDatasource({
        id: 'duckdb-schema-snapshot-smoke',
        type: 'duckdb',
        path: databasePath,
        options: { createIfMissing: true },
    });
    await datasource.init();
    try {
        await datasource.command(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                email VARCHAR NOT NULL UNIQUE,
                score DECIMAL(10, 2) DEFAULT 0,
                CONSTRAINT users_score_check CHECK (score >= 0)
            );
            CREATE INDEX users_email_idx ON users(email);
            CREATE VIEW active_users AS SELECT id, email FROM users WHERE score > 0;
        `);
        const database = (await datasource.listDatabases())[0]?.value;
        assert.ok(database);
        const snapshot = await datasource.getSchemaSnapshot({ database });
        assert.deepEqual(snapshot.coverage, {
            tables: 'complete',
            columns: 'complete',
            indexes: 'complete',
            constraints: 'complete',
            views: 'complete',
            statistics: 'unavailable',
        });
        assert.equal(snapshot.tables[0]?.columns.length, 3);
        assert.equal(snapshot.tables[0]?.indexes.length, 1);
        assert.equal(snapshot.tables[0]?.constraints.length, 3);
        assert.equal(snapshot.views[0]?.name, 'active_users');
    } finally {
        await datasource.close();
        if (fs.existsSync(databasePath)) fs.unlinkSync(databasePath);
    }
}

console.log('native schema snapshot tests passed');
