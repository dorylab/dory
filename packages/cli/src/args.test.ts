import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from './args.js';

test('parses doctor command', () => {
    assert.deepEqual(parseArgs(['doctor', '--data', 'standalone']), {
        command: 'doctor',
        data: 'standalone',
        userDataDir: undefined,
        pglitePath: undefined,
        databaseUrl: undefined,
    });
});

test('parses standalone stdio MCP serve data options', () => {
    assert.deepEqual(parseArgs(['mcp', 'serve', '--stdio', '--data', 'desktop', '--user-data-dir', '/tmp/dory']), {
        command: 'mcp-serve',
        options: {
            transport: 'stdio',
            host: '127.0.0.1',
            port: 3318,
            data: 'desktop',
            userDataDir: '/tmp/dory',
            pglitePath: undefined,
            databaseUrl: undefined,
            origin: undefined,
            token: undefined,
            allowRemote: false,
        },
    });
});

test('parses action run with JSON input', () => {
    assert.deepEqual(parseArgs(['action', 'connection.list', '--projection', 'mcp', '--json', '{}', '--data', 'standalone']), {
        command: 'action-run',
        options: {
            actionId: 'connection.list',
            json: '{}',
            input: undefined,
            projection: 'mcp',
            yes: false,
            data: 'standalone',
            userDataDir: undefined,
            pglitePath: undefined,
            databaseUrl: undefined,
        },
    });
});

test('parses action describe', () => {
    assert.deepEqual(parseArgs(['action', 'describe', 'tab.create', '--data', 'desktop']), {
        command: 'action-describe',
        actionId: 'tab.create',
        data: 'desktop',
        userDataDir: undefined,
        pglitePath: undefined,
        databaseUrl: undefined,
    });
});

test('connection command is no longer supported', () => {
    assert.deepEqual(parseArgs(['connection', 'list', '--data', 'standalone']), {
        command: 'help',
    });
});

test('parses action write confirmation', () => {
    assert.deepEqual(parseArgs(['action', 'tab.create', '--yes', '--input', 'tab.json', '--data', 'standalone']), {
        command: 'action-run',
        options: {
            actionId: 'tab.create',
            json: undefined,
            input: 'tab.json',
            projection: undefined,
            yes: true,
            data: 'standalone',
            userDataDir: undefined,
            pglitePath: undefined,
            databaseUrl: undefined,
        },
    });
});

test('parses action list', () => {
    assert.deepEqual(parseArgs(['action', 'list', '--data', 'standalone']), {
        command: 'action-list',
        data: 'standalone',
        userDataDir: undefined,
        pglitePath: undefined,
        databaseUrl: undefined,
    });
});

test('parses legacy profile as data alias', () => {
    assert.deepEqual(parseArgs(['action', 'list', '--profile', 'headless']), {
        command: 'action-list',
        data: 'standalone',
        userDataDir: undefined,
        pglitePath: undefined,
        databaseUrl: undefined,
    });
});

test('parses self-hosted data mode', () => {
    assert.deepEqual(parseArgs(['action', 'list', '--data', 'self-hosted', '--database-url', 'postgresql://postgres:postgres@localhost/postgres']), {
        command: 'action-list',
        data: 'self-hosted',
        userDataDir: undefined,
        pglitePath: undefined,
        databaseUrl: 'postgresql://postgres:postgres@localhost/postgres',
    });
});

test('parses local Codex Agent command', () => {
    assert.deepEqual(parseArgs(['agent', 'codex', '--url', 'https://dory.test', '--name', 'Work Mac', '--config', '/tmp/dory-mcp.json']), {
        command: 'agent-codex',
        options: {
            url: 'https://dory.test',
            name: 'Work Mac',
            configPath: '/tmp/dory-mcp.json',
        },
    });
});

test('parses local AI bridge login scope flag', () => {
    assert.deepEqual(parseArgs(['mcp', 'login', '--url', 'https://dory.test', '--local-ai']), {
        command: 'mcp-login',
        url: 'https://dory.test',
        clientName: undefined,
        configPath: undefined,
        localAi: true,
    });
});
