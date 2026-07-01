import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const {
    buildCodexDoryMcpArgs,
    buildCodexDoryMcpEnv,
    buildInstruction,
    DORY_CODEX_MCP_DESKTOP_GRANT_ENV,
    DORY_CODEX_MCP_ENABLED_TOOLS,
    DORY_CODEX_MCP_TOKEN_ENV,
    DORY_CODEX_MCP_TOOL_TIMEOUT_SEC,
} = await import('../../lib/ai/model/providers/local-agent');

test('local Codex prompt uses Dory MCP tools instead of AI SDK tool fallback', () => {
    const callOptions: Parameters<typeof buildInstruction>[0] = {
        prompt: [],
        tools: [
            {
                type: 'function',
                name: 'sqlRunner',
                description: 'Run SQL',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
        ],
    };
    const context: Parameters<typeof buildInstruction>[1] = {
        doryMcpAvailable: true,
        connectionId: 'conn-1',
        requestId: 'req-1',
        chatId: 'chat-1',
    };
    const instruction = buildInstruction(callOptions, context);

    assert.equal(instruction.includes('cannot call them directly yet'), false);
    assert.equal(instruction.includes('Do not emit tool calls'), false);
    assert.ok(instruction.includes('Dory MCP tools are available'));
    assert.ok(instruction.includes('dory_create_work'));
    assert.ok(instruction.includes('dory_read'));
    assert.ok(instruction.includes('dory_write'));
    assert.ok(instruction.includes('dory_run_readonly_sql'));
    assert.ok(instruction.includes('conn-1'));
});

test('local Codex prompt warns when Web bridge is too old for Dory tools', () => {
    const instruction = buildInstruction(
        {
            prompt: [],
        },
        {
            doryMcpAvailable: false,
            bridgeMissingDoryMcpTools: true,
            connectionId: 'conn-1',
        },
    );

    assert.ok(instruction.includes('does not advertise Dory MCP tool support'));
    assert.ok(instruction.includes('restart the Dory Codex Agent'));
    assert.ok(instruction.includes('Do not claim that database tools or SQL queries have run'));
});

test('Codex MCP desktop grant config keeps grant out of args', () => {
    const grant = 'secret-desktop-grant';
    const config: Parameters<typeof buildCodexDoryMcpArgs>[0] = {
        endpoint: 'http://localhost:3000/api/mcp',
        auth: {
            type: 'desktop-grant-header',
            envVar: DORY_CODEX_MCP_DESKTOP_GRANT_ENV,
            grant,
        },
        enabledTools: DORY_CODEX_MCP_ENABLED_TOOLS,
        toolTimeoutSec: DORY_CODEX_MCP_TOOL_TIMEOUT_SEC,
    };
    const args = buildCodexDoryMcpArgs(config);
    const joined = args.join('\n');

    assert.ok(joined.includes('mcp_servers.dory.url="http://localhost:3000/api/mcp"'));
    assert.ok(joined.includes('mcp_servers.dory.default_tools_approval_mode="approve"'));
    assert.ok(joined.includes('mcp_servers.dory.tools.dory_create_work.approval_mode="never_ask"'));
    assert.ok(joined.includes('mcp_servers.dory.tools.dory_finish_work.approval_mode="never_ask"'));
    assert.ok(joined.includes('mcp_servers.dory.env_http_headers'));
    assert.ok(joined.includes('"x-dory-mcp-desktop-grant"'));
    assert.ok(joined.includes(DORY_CODEX_MCP_DESKTOP_GRANT_ENV));
    assert.equal(joined.includes(grant), false);
    assert.deepEqual(buildCodexDoryMcpEnv(config), {
        [DORY_CODEX_MCP_DESKTOP_GRANT_ENV]: grant,
    });
});

test('Codex MCP bearer config keeps token out of args', () => {
    const token = 'secret-bearer-token';
    const config: Parameters<typeof buildCodexDoryMcpArgs>[0] = {
        endpoint: 'https://dory.test/api/mcp',
        auth: {
            type: 'bearer-env',
            envVar: DORY_CODEX_MCP_TOKEN_ENV,
            token,
        },
        enabledTools: DORY_CODEX_MCP_ENABLED_TOOLS,
        toolTimeoutSec: DORY_CODEX_MCP_TOOL_TIMEOUT_SEC,
    };
    const args = buildCodexDoryMcpArgs(config);
    const joined = args.join('\n');

    assert.ok(joined.includes('mcp_servers.dory.bearer_token_env_var="DORY_MCP_TOKEN"'));
    assert.ok(joined.includes('mcp_servers.dory.tools.dory_create_work.approval_mode="never_ask"'));
    assert.ok(joined.includes('mcp_servers.dory.tools.dory_finish_work.approval_mode="never_ask"'));
    assert.ok(joined.includes('"dory_read"'));
    assert.ok(joined.includes('"dory_write"'));
    assert.ok(joined.includes('"dory_run_readonly_sql"'));
    assert.equal(joined.includes(token), false);
    assert.deepEqual(buildCodexDoryMcpEnv(config), {
        [DORY_CODEX_MCP_TOKEN_ENV]: token,
    });
});
