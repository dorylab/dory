import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSavedQueryMetadata } from '../../lib/ai/saved-query-metadata';

test('parses generated saved-query metadata', () => {
    assert.deepEqual(parseSavedQueryMetadata('{"description":"Counts active users.","useWhen":"Use when asked for the active user count."}'), {
        description: 'Counts active users.',
        useWhen: 'Use when asked for the active user count.',
    });
});

test('rejects incomplete generated saved-query metadata', () => {
    assert.throws(() => parseSavedQueryMetadata('{"description":"Counts active users."}'));
});
