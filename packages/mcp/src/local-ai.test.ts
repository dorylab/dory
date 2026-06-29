import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
    buildCodexDoryMcpArgs,
    buildCodexDoryMcpEnv,
    DORY_CODEX_MCP_ENABLED_TOOLS,
    DORY_CODEX_MCP_TOKEN_ENV,
    DORY_CODEX_MCP_TOOL_TIMEOUT_SEC,
    startLocalAiBridge,
    type CodexDoryMcpConfig,
} from './local-ai.js';

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify({ code: 0, data }), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function createConfig(token = 'dory_mcp_secret_token'): CodexDoryMcpConfig {
    return {
        endpoint: 'https://dory.test/api/mcp',
        auth: {
            type: 'bearer-env',
            envVar: DORY_CODEX_MCP_TOKEN_ENV,
            token,
        },
        enabledTools: DORY_CODEX_MCP_ENABLED_TOOLS,
        toolTimeoutSec: DORY_CODEX_MCP_TOOL_TIMEOUT_SEC,
    };
}

test('Codex MCP args enable Dory tools without exposing bearer token', () => {
    const config = createConfig();
    const args = buildCodexDoryMcpArgs(config);
    const joined = args.join('\n');

    assert.ok(joined.includes('mcp_servers.dory.url="https://dory.test/api/mcp"'));
    assert.ok(joined.includes('mcp_servers.dory.required=true'));
    assert.ok(joined.includes('mcp_servers.dory.default_tools_approval_mode="approve"'));
    assert.ok(joined.includes('mcp_servers.dory.bearer_token_env_var="DORY_MCP_TOKEN"'));
    assert.ok(joined.includes('"dory_run_readonly_sql"'));
    assert.equal(joined.includes(config.auth.token), false);
    assert.deepEqual(buildCodexDoryMcpEnv(config), {
        [DORY_CODEX_MCP_TOKEN_ENV]: config.auth.token,
    });
});

test('local AI bridge runs claimed Codex jobs with Dory MCP config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dory-mcp-local-ai-test-'));
    const configPath = join(dir, 'mcp.json');
    await writeFile(
        configPath,
        JSON.stringify({
            version: 1,
            credentials: {
                'https://dory.test': {
                    endpoint: 'https://dory.test/api/mcp',
                    token: 'dory_mcp_secret_token',
                    tokenPrefix: 'dory_mcp_secret',
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            },
        }),
    );

    const requests: Array<{ url: string; body: any; authorization: string | null }> = [];
    const runCalls: Array<{ model: string; prompt: string; config: CodexDoryMcpConfig }> = [];
    const fetchFn = async (url: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        requests.push({
            url: String(url),
            body,
            authorization: new Headers(init?.headers).get('authorization'),
        });

        if (String(url).endsWith('/api/mcp/local-ai/bridges/register')) {
            return jsonResponse({ bridge: { id: 'bridge-1', provider: 'codex-agent', name: 'Test Bridge' } });
        }
        if (String(url).endsWith('/api/mcp/local-ai/jobs/claim')) {
            return jsonResponse({ job: { id: 'job-1', provider: 'codex-agent', model: 'default', prompt: 'query users' } });
        }
        if (String(url).endsWith('/api/mcp/local-ai/jobs/job-1/complete')) {
            return jsonResponse({ ok: true });
        }

        throw new Error(`Unexpected URL: ${url}`);
    };

    await startLocalAiBridge({
        url: 'https://dory.test',
        name: 'Test Bridge',
        configPath,
        fetchFn,
        maxJobs: 1,
        runCodexAgentFn: async (model, prompt, config) => {
            runCalls.push({ model, prompt, config });
            return {
                text: 'done',
                stdout: 'stdout',
                stderr: 'stderr',
            };
        },
    });

    assert.equal(runCalls.length, 1);
    assert.equal(runCalls[0].model, 'default');
    assert.equal(runCalls[0].prompt, 'query users');
    assert.equal(runCalls[0].config.endpoint, 'https://dory.test/api/mcp');
    assert.equal(runCalls[0].config.auth.token, 'dory_mcp_secret_token');
    assert.ok(runCalls[0].config.enabledTools.includes('dory_run_readonly_sql'));

    const register = requests.find(request => request.url.endsWith('/api/mcp/local-ai/bridges/register'));
    assert.ok(register);
    assert.equal(register.authorization, 'Bearer dory_mcp_secret_token');
    assert.equal(register.body.capabilities.doryMcpTools, true);
    assert.equal(register.body.capabilities.localAiBridgeProtocol, 2);

    const complete = requests.find(request => request.url.endsWith('/api/mcp/local-ai/jobs/job-1/complete'));
    assert.ok(complete);
    assert.equal(complete.authorization, 'Bearer dory_mcp_secret_token');
    assert.equal(complete.body.ok, true);
    assert.equal(complete.body.text, 'done');
});
