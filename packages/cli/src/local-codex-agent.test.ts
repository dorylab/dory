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
    startCodexAgentBridge,
    type CodexDoryMcpConfig,
} from './local-codex-agent.js';

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

test('Codex Agent bridge runs claimed jobs with Dory MCP config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dory-cli-codex-agent-test-'));
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

    await startCodexAgentBridge({
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

async function assertCodexAgentReauthorizes(firstRegisterStatus: number) {
    const dir = await mkdtemp(join(tmpdir(), `dory-cli-codex-agent-reauth-${firstRegisterStatus}-`));
    const configPath = join(dir, 'mcp.json');
    await writeFile(
        configPath,
        JSON.stringify({
            version: 1,
            credentials: {
                'https://dory.test': {
                    endpoint: 'https://dory.test/api/mcp',
                    token: 'old_token',
                    tokenPrefix: 'old_token',
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            },
        }),
    );

    let registerCount = 0;
    let pollCount = 0;
    const requestedScopes: string[][] = [];
    const fetchFn = async (url: string | URL, init?: RequestInit) => {
        const parsed = new URL(String(url));
        const body = JSON.parse(String(init?.body ?? '{}'));

        if (parsed.pathname === '/api/mcp/local-ai/bridges/register') {
            registerCount += 1;
            if (registerCount === 1) {
                return jsonResponse({ message: 'reauthorization required' }, firstRegisterStatus);
            }
            assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer new_token');
            return jsonResponse({ bridge: { id: 'bridge-reauth', provider: 'codex-agent', name: 'Test Bridge' } });
        }

        if (parsed.pathname === '/api/mcp/link/start') {
            requestedScopes.push(body.scopes);
            return jsonResponse({
                requestId: 'request-reauth',
                authorizeUrl: 'https://dory.test/mcp/authorize?requestId=request-reauth',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
            });
        }

        if (parsed.pathname === '/api/mcp/link/poll') {
            pollCount += 1;
            return jsonResponse({
                status: 'approved',
                token: 'new_token',
                record: { tokenPrefix: 'new_token' },
            });
        }

        if (parsed.pathname === '/api/mcp/local-ai/jobs/claim') {
            return jsonResponse({ job: { id: 'job-reauth', provider: 'codex-agent', model: 'default', prompt: 'hello' } });
        }

        if (parsed.pathname === '/api/mcp/local-ai/jobs/job-reauth/complete') {
            return jsonResponse({ ok: true });
        }

        throw new Error(`Unexpected URL: ${url}`);
    };

    await startCodexAgentBridge({
        url: 'https://dory.test',
        name: 'Test Bridge',
        configPath,
        fetchFn,
        openUrl: () => undefined,
        pollIntervalMs: 0,
        maxJobs: 1,
        runCodexAgentFn: async () => {
            return {
                text: 'done',
                stdout: '',
                stderr: '',
            };
        },
    });

    assert.equal(registerCount, 2);
    assert.equal(pollCount, 1);
    assert.ok(requestedScopes[0].includes('local_ai:run'));
}

test('Codex Agent bridge reauthorizes when existing token lacks local AI scope', async () => {
    await assertCodexAgentReauthorizes(403);
});

test('Codex Agent bridge reauthorizes when existing token is invalid or revoked', async () => {
    await assertCodexAgentReauthorizes(401);
});
