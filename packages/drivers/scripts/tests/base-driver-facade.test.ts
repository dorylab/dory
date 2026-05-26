import assert from 'node:assert/strict';
import { BaseDriver, UnsupportedDriverCapabilityError } from '../../src/core';
import type { ConnectionParameterDialect } from '../../src/core/registry/types';
import type { DriverConfig, DriverHealthInfo, DriverQueryResult } from '../../src/types';
import type { DriverQueryParams } from '../../src/core/base/params/types';

const TestDialect: ConnectionParameterDialect = {
    id: 'test',
    namedParameterPrefix: ':',
    positionalParameterPrefix: '?',
    supportsNamedParameters: true,
    supportsPositionalParameters: true,
};

class TestDriver extends BaseDriver {
    readonly dialect = TestDialect;

    protected async _init(): Promise<void> {}
    async close(): Promise<void> {}
    async ping(): Promise<DriverHealthInfo> {
        return { ok: true };
    }
    async query<Row = any>(_sql: string, _params?: DriverQueryParams): Promise<DriverQueryResult<Row>> {
        return { rows: [] };
    }
}

const config: DriverConfig = {
    id: 'test',
    type: 'postgres',
    host: 'localhost',
};

const unsupportedDriver = new TestDriver(config);
await assert.rejects(() => unsupportedDriver.listDatabases(), (error: unknown) => {
    assert.ok(error instanceof UnsupportedDriverCapabilityError);
    assert.equal(error.code, 'DRIVER_CAPABILITY_UNSUPPORTED');
    assert.equal(error.capability, 'getDatabases');
    return true;
});

const driver = new TestDriver(config);
driver.capabilities.metadata = {
    getDatabases: async () => [{ label: 'app', value: 'app' }],
    getTables: async () => [{ label: 'orders', value: 'orders', database: 'app', schema: 'public' }],
    getTableColumns: async () => [
        {
            columnName: 'id',
            columnType: 'uuid',
            isPrimaryKey: true,
        },
    ],
};
driver.capabilities.tableInfo = {
    properties: async () => ({ engine: 'heap', totalRows: 12 }),
    ddl: async () => 'CREATE TABLE orders (id uuid primary key)',
    stats: async () => ({
        partitionCount: 0,
        partitions: [],
        partCount: 0,
        activeMutations: [],
        rowCount: 12,
    }),
    indexes: async () => [{ name: 'orders_pkey', isPrimary: true }],
    preview: async () => ({ rows: [{ id: '1' }], rowCount: 1 }),
};

assert.deepEqual(await driver.listDatabases(), [{ label: 'app', value: 'app' }]);
assert.deepEqual(await driver.describeTable('app', 'orders'), [{ columnName: 'id', columnType: 'uuid', isPrimaryKey: true }]);

const profile = await driver.getTableProfile('app', 'orders');
assert.deepEqual(profile.capabilities, {
    columns: true,
    properties: true,
    stats: true,
    indexes: true,
    ddl: true,
});
assert.equal(profile.columns[0]?.columnName, 'id');
assert.equal(profile.properties?.totalRows, 12);
assert.equal(profile.indexes[0]?.name, 'orders_pkey');
assert.equal(profile.ddl, 'CREATE TABLE orders (id uuid primary key)');

assert.deepEqual(await driver.previewTable('app', 'orders', { limit: 1 }), { rows: [{ id: '1' }], rowCount: 1 });

console.log('base-driver facade tests passed');
