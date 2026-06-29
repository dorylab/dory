import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDoryCliForwardArgs } from './cli-forward.js';

test('forwards legacy local-ai bridge to Dory CLI Codex Agent', () => {
    assert.deepEqual(buildDoryCliForwardArgs(['local-ai', '--url', 'https://dory.test', '--name', 'Work Mac']), [
        'agent',
        'codex',
        '--url',
        'https://dory.test',
        '--name',
        'Work Mac',
    ]);
});

test('forwards legacy local-ai login to Dory CLI scoped login', () => {
    assert.deepEqual(buildDoryCliForwardArgs(['login', '--url', 'https://dory.test', '--local-ai']), ['mcp', 'login', '--url', 'https://dory.test', '--local-ai']);
});

test('forwards legacy server commands through Dory CLI mcp namespace', () => {
    assert.deepEqual(buildDoryCliForwardArgs(['serve', '--stdio']), ['mcp', 'serve', '--stdio']);
    assert.deepEqual(buildDoryCliForwardArgs(['token', 'list']), ['mcp', 'token', 'list']);
});
