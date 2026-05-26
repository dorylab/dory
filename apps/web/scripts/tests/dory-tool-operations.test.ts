import assert from 'node:assert/strict';

import {
    DEFAULT_DORY_SCHEMA_SEARCH_LIMIT,
    MAX_DORY_SCHEMA_SEARCH_LIMIT,
    clampDoryToolLimit,
    matchSchemaSearch,
    type SchemaSearchItem,
} from '@/lib/ai/tools/dory-tool-utils';
import { searchSchemaOperation } from '@/lib/ai/tools/dory-tool-operations';

assert.equal(clampDoryToolLimit(undefined, DEFAULT_DORY_SCHEMA_SEARCH_LIMIT, MAX_DORY_SCHEMA_SEARCH_LIMIT), DEFAULT_DORY_SCHEMA_SEARCH_LIMIT);
assert.equal(clampDoryToolLimit(0, DEFAULT_DORY_SCHEMA_SEARCH_LIMIT, MAX_DORY_SCHEMA_SEARCH_LIMIT), 1);
assert.equal(clampDoryToolLimit(1000, DEFAULT_DORY_SCHEMA_SEARCH_LIMIT, MAX_DORY_SCHEMA_SEARCH_LIMIT), MAX_DORY_SCHEMA_SEARCH_LIMIT);

const table: SchemaSearchItem = {
    kind: 'table',
    database: 'app',
    name: 'orders',
    comment: 'customer order facts',
};
const column: SchemaSearchItem = {
    kind: 'column',
    database: 'app',
    table: 'orders',
    name: 'customer_id',
    type: 'uuid',
};

assert.equal(matchSchemaSearch(table, 'order'), true);
assert.equal(matchSchemaSearch(table, 'missing'), false);
assert.equal(matchSchemaSearch(column, 'uuid'), true);
assert.equal(matchSchemaSearch(column, 'customer'), true);

await assert.rejects(
    () =>
        searchSchemaOperation(
            {
                organizationId: 'org',
                userId: 'user',
                currentConnectionId: 'current-connection',
                restrictToCurrentConnection: true,
            },
            {
                connectionId: 'other-connection',
                query: 'orders',
            },
        ),
    /current chat connection/,
);

console.log('dory tool operations tests passed');
