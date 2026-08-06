import assert from 'node:assert/strict';
import test from 'node:test';

import { getImportErrorMessage } from '../../src/error-message';

test('import errors use a nested aggregate message when the wrapper message is blank', () => {
    const nested = new Error("Invalid object name 'sales.orders'.");
    const aggregate = new AggregateError([nested]);
    const wrapper = new Error('');
    Object.assign(wrapper, { originalError: aggregate });

    assert.equal(getImportErrorMessage(wrapper), "Invalid object name 'sales.orders'.");
});

test('import errors inspect preceding errors and avoid circular references', () => {
    const wrapper = new Error('');
    Object.assign(wrapper, { cause: wrapper, precedingErrors: [new Error('Bulk insert failed')] });

    assert.equal(getImportErrorMessage(wrapper), 'Bulk insert failed');
});

test('import errors return a stable fallback when no message exists', () => {
    assert.equal(getImportErrorMessage({ code: 'EREQUEST' }), 'The import failed without an error message');
});
