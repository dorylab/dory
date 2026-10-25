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
    resolveLocalAgentDoryContext,
    DORY_CODEX_WORK_ID_HEADER,
    DORY_CODEX_CHAT_ID_HEADER,
    DORY_CODEX_CONNECTION_ID_HEADER,
    DORY_CODEX_MCP_ENDPOINT_HEADER,
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
    assert.ok(joined.includes('mcp_servers.dory.tools.dory_create_work.approval_mode="approve"'));
    assert.ok(joined.includes('mcp_servers.dory.tools.dory_finish_work.approval_mode="approve"'));
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
    assert.ok(joined.includes('mcp_servers.dory.tools.dory_create_work.approval_mode="approve"'));
    assert.ok(joined.includes('mcp_servers.dory.tools.dory_finish_work.approval_mode="approve"'));
    assert.ok(joined.includes('"dory_read"'));
    assert.ok(joined.includes('"dory_write"'));
    assert.ok(joined.includes('"dory_run_readonly_sql"'));
    assert.equal(joined.includes(token), false);
    assert.deepEqual(buildCodexDoryMcpEnv(config), {
        [DORY_CODEX_MCP_TOKEN_ENV]: token,
    });
});

for (const target of [undefined, 'bridge:test-bridge']) {
    test(`local Codex passes the Chat Run through ${target ? 'Web bridge' : 'Desktop direct'} context`, () => {
        const options: Parameters<typeof buildInstruction>[0] = {
            prompt: [],
            headers: {
                [DORY_CODEX_WORK_ID_HEADER]: 'chat-work-1',
                [DORY_CODEX_CHAT_ID_HEADER]: 'chat-1',
                [DORY_CODEX_CONNECTION_ID_HEADER]: 'conn-1',
                [DORY_CODEX_MCP_ENDPOINT_HEADER]: 'http://localhost:3000/api/mcp',
                'x-dory-mcp-desktop-grant': 'test-grant',
            },
        };
        const context = resolveLocalAgentDoryContext('codex-agent', target, options, true);
        assert.equal(context.doryMcpAvailable, true);
        assert.equal(context.workId, 'chat-work-1');
        const prompt = buildInstruction(options, context);
        assert.match(prompt, /Current Dory workId: chat-work-1/);
        assert.match(prompt, /Always pass the current workId/);
        assert.match(prompt, /dory_finish_work/);
        assert.match(prompt, /Answer ordinary questions directly/);
        assert.match(prompt, /do not retry in this turn/);
        assert.doesNotMatch(prompt, /Always finish with findings/);
    });
}

test('Codex without an existing Run is instructed to reuse a stable external session', () => {
    const prompt = buildInstruction({ prompt: [] }, { doryMcpAvailable: true, chatId: 'external-chat' });
    assert.match(prompt, /stable externalSessionId/);
    assert.match(prompt, /retries and later turns/);
});

test('local Codex binds MCP execution to the existing chat turn', () => {
    const instruction = buildInstruction({ prompt: [] }, { doryMcpAvailable: true, connectionId: 'conn-1', workId: 'run-1', requestId: 'turn-2' });
    assert.match(instruction, /Reuse it; do not create another Run/);
    assert.match(instruction, /finalAnswer/);
    const args = buildCodexDoryMcpArgs({
        endpoint: 'https://dory.test/api/mcp',
        auth: { type: 'bearer-env', envVar: DORY_CODEX_MCP_TOKEN_ENV, token: 'secret' },
        enabledTools: DORY_CODEX_MCP_ENABLED_TOOLS,
        toolTimeoutSec: DORY_CODEX_MCP_TOOL_TIMEOUT_SEC,
        agentTurn: { workId: 'run-1', requestId: 'turn-2' },
    });
    assert.match(args.join('\n'), /http_headers=.*x-dory-agent-work-id.*run-1/);
    assert.match(args.join('\n'), /x-dory-agent-request-id.*turn-2/);
    assert.ok(DORY_CODEX_MCP_ENABLED_TOOLS.includes('dory_search_assets'));
    assert.ok(DORY_CODEX_MCP_ENABLED_TOOLS.includes('dory_read_asset'));
});

test('Desktop subprocess publishes public progress before exit and handles split Chinese output', async () => {
    const { mkdtemp, writeFile, chmod, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { runCodexAgent } = await import('@/lib/ai/model/providers/local-agent');
    const directory = await mkdtemp(join(tmpdir(), 'dory-progress-cli-'));
    const previousPath = process.env.PATH;
    const previousRuntime = process.env.DORY_RUNTIME;
    try {
        const executable = join(directory, 'codex');
        await writeFile(
            executable,
            `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('fixture'); process.exit(0); }
if (!process.argv.includes('--json')) process.exit(2);
const output = process.argv[process.argv.indexOf('--output-last-message') + 1];
const text = JSON.stringify({type:'item.completed',item:{id:'message-1',type:'agent_message',text:'开始分析'}})+'\\n';
const bytes = Buffer.from(text);
const split = bytes.indexOf(Buffer.from('开')) + 1;
process.stdout.write(bytes.subarray(0, split));
setTimeout(() => process.stdout.write(bytes.subarray(split)), 20);
setTimeout(() => { fs.writeFileSync(output, '结果为 42'); process.exit(0); }, 100);
`,
        );
        await chmod(executable, 0o755);
        process.env.PATH = `${directory}:${previousPath ?? ''}`;
        process.env.DORY_RUNTIME = 'desktop';
        const entries: Array<{ text?: string; phase?: string }> = [];
        let exited = false;
        const result = runCodexAgent('default', 'Analyze', undefined, undefined, entry => {
            if (entry.phase === 'commentary') assert.equal(exited, false);
            entries.push(entry);
        }).then(value => {
            exited = true;
            return value;
        });
        assert.equal((await result).text, '结果为 42');
        assert.equal(entries[0].text, '开始分析');
        assert.equal(entries.at(-1)?.phase, 'final');
        assert.equal(
            entries.some(entry => entry.text?.includes('�')),
            false,
        );
    } finally {
        if (previousPath === undefined) delete process.env.PATH;
        else process.env.PATH = previousPath;
        if (previousRuntime === undefined) delete process.env.DORY_RUNTIME;
        else process.env.DORY_RUNTIME = previousRuntime;
        await rm(directory, { recursive: true, force: true });
    }
});
