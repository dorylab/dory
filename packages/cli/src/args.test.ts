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

test('parses standalone remote HTTP MCP serve options', () => {
    assert.deepEqual(parseArgs(['mcp', 'serve', '--http', '--host', '0.0.0.0', '--port', '3318', '--allow-remote', '--token', 'dory_mcp_token', '--data', 'standalone']), {
        command: 'mcp-serve',
        options: {
            transport: 'http',
            host: '0.0.0.0',
            port: 3318,
            data: 'standalone',
            userDataDir: undefined,
            pglitePath: undefined,
            databaseUrl: undefined,
            origin: undefined,
            token: 'dory_mcp_token',
            allowRemote: true,
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

test('rejects local Codex Agent commands', () => {
    assert.deepEqual(parseArgs(['agent', 'codex', '--url', 'https://dory.test', '--name', 'Work Mac', '--config', '/tmp/dory-mcp.json']), {
        command: 'help',
    });
    assert.deepEqual(parseArgs(['agent', 'codex', 'install', '--url', 'https://dory.test']), {
        command: 'help',
    });
    assert.deepEqual(parseArgs(['agent', 'codex', 'run', '--url', 'https://dory.test']), {
        command: 'help',
    });
    assert.deepEqual(parseArgs(['agent', 'codex', 'status']), {
        command: 'help',
    });
    assert.deepEqual(parseArgs(['agent', 'codex', 'restart']), {
        command: 'help',
    });
    assert.deepEqual(parseArgs(['agent', 'codex', 'stop']), {
        command: 'help',
    });
    assert.deepEqual(parseArgs(['agent', 'codex', 'uninstall']), {
        command: 'help',
    });
});

test('parses local runtime commands', () => {
    assert.deepEqual(parseArgs(['runtime', 'run', '--data', 'standalone', '--config', '/tmp/runtime.json', '--codex-agent', '--url', 'https://dory.test', '--codex-config', '/tmp/mcp.json']), {
        command: 'runtime',
        options: {
            action: 'run',
            serviceConfigPath: '/tmp/runtime.json',
            codexAgent: true,
            url: 'https://dory.test',
            name: undefined,
            codexConfigPath: '/tmp/mcp.json',
            mcpHttp: false,
            host: '127.0.0.1',
            port: undefined,
            origin: undefined,
            token: undefined,
            allowRemote: false,
            data: 'standalone',
            userDataDir: undefined,
            pglitePath: undefined,
            databaseUrl: undefined,
        },
    });
    assert.deepEqual(parseArgs(['runtime', 'status']).command, 'runtime');
    assert.deepEqual(parseArgs(['runtime', 'restart']).command, 'runtime');
    assert.deepEqual(parseArgs(['runtime', 'stop']).command, 'runtime');
    assert.deepEqual(parseArgs(['runtime', 'uninstall']).command, 'runtime');
});

test('parses local runtime install capabilities', () => {
    assert.deepEqual(parseArgs(['runtime', 'install', '--codex-agent', '--url', 'https://dory.test', '--name', 'Work Mac', '--mcp-http', '--host', '0.0.0.0', '--port', '3318', '--allow-remote', '--token', 'dory_mcp_token']), {
        command: 'runtime',
        options: {
            action: 'install',
            serviceConfigPath: undefined,
            codexAgent: true,
            url: 'https://dory.test',
            name: 'Work Mac',
            codexConfigPath: undefined,
            mcpHttp: true,
            host: '0.0.0.0',
            port: 3318,
            origin: undefined,
            token: 'dory_mcp_token',
            allowRemote: true,
            data: undefined,
            userDataDir: undefined,
            pglitePath: undefined,
            databaseUrl: undefined,
        },
    });
});

test('parses MCP token create scopes', () => {
    assert.deepEqual(parseArgs(['mcp', 'token', 'create', '--name', 'writer', '--scope', 'connections:read,connections:write', '--scope', 'schema:read', '--data', 'standalone']), {
        command: 'mcp-token',
        action: 'create',
        id: undefined,
        name: 'writer',
        scopes: ['connections:read', 'connections:write', 'schema:read'],
        data: 'standalone',
        userDataDir: undefined,
        pglitePath: undefined,
        databaseUrl: undefined,
    });
});

test('rejects MCP service command', () => {
    assert.deepEqual(parseArgs(['mcp', 'service', 'install']), {
        command: 'help',
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
