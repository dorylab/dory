import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSavedQueryMetadata } from '../../lib/ai/saved-query-metadata';

test('parses generated saved-query metadata', () => {
    assert.deepEqual(parseSavedQueryMetadata('{"description":"Counts active users."}'), {
        description: 'Counts active users.',
    });
});

test('rejects incomplete generated saved-query metadata', () => {
    assert.throws(() => parseSavedQueryMetadata('{"description":" "}'));
});
