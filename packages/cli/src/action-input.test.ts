import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { parseActionJsonInput, readActionInput } from './action-input.js';

test('parses empty action input as an empty object', () => {
    assert.deepEqual(parseActionJsonInput(''), {});
});

test('parses JSON action input', () => {
    assert.deepEqual(parseActionJsonInput('{"connectionId":"abc"}'), { connectionId: 'abc' });
});

test('rejects invalid JSON action input', () => {
    assert.throws(() => parseActionJsonInput('{'), /Invalid JSON/);
});

test('reads action input from file', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dory-action-input-'));
    try {
        const filePath = path.join(dir, 'input.json');
        writeFileSync(filePath, '{"tabType":"sql"}\n');
        assert.deepEqual(await readActionInput({ input: filePath }), { tabType: 'sql' });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
