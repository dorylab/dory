import assert from 'node:assert/strict';

import {
    DEFAULT_DORY_SCHEMA_SEARCH_LIMIT,
    MAX_DORY_SCHEMA_SEARCH_LIMIT,
    clampDoryToolLimit,
    matchSchemaSearch,
    searchSchemaItems,
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
assert.equal(matchSchemaSearch(column, 'customer uuid'), true);

const hnStoriesTable: SchemaSearchItem = {
    kind: 'table',
    database: 'default',
    name: 'hn_stories',
    comment: 'Hacker News posts',
};
const scoreColumn: SchemaSearchItem = {
    kind: 'column',
    database: 'default',
    table: 'hn_stories',
    name: 'score',
    type: 'integer',
};
const commentsColumn: SchemaSearchItem = {
    kind: 'column',
    database: 'default',
    table: 'hn_stories',
    name: 'comment_count',
    type: 'integer',
    comment: 'number of comments',
};
const weakCommentTable: SchemaSearchItem = {
    kind: 'table',
    database: 'default',
    name: 'activity_log',
    comment: 'contains score information imported from hacker news',
};

const multiTokenResults = searchSchemaItems([weakCommentTable, hnStoriesTable, scoreColumn, commentsColumn], 'hacknews hacker news hn posts stories score comments', 10);
assert.ok(multiTokenResults.includes(hnStoriesTable));
assert.ok(multiTokenResults.includes(scoreColumn));
assert.ok(multiTokenResults.includes(commentsColumn));

const scoreResults = searchSchemaItems([weakCommentTable, scoreColumn], 'score', 10);
assert.equal(scoreResults[0], scoreColumn);

const unrelatedResults = searchSchemaItems([hnStoriesTable, scoreColumn, commentsColumn], 'invoice revenue', 10);
assert.equal(unrelatedResults.length, 0);

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
