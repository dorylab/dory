import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

import { postJson, type FetchLike } from './bridge-api.js';
import { login } from './bridge-auth.js';
import { getBridgeConfigPath, resolveCredential } from './bridge-config.js';

const DEFAULT_MCP_SCOPES = [
    'connections:read',
    'query:read',
    'analysis:run',
    'schema:read',
    'tabs:read',
    'tabs:write',
    'saved_queries:read',
    'saved_queries:write',
    'monitoring:read',
    'local_ai:run',
];
export const LOCAL_AI_SCOPES = [...DEFAULT_MCP_SCOPES];
const LOCAL_AGENT_TIMEOUT_MS = 120_000;
const LOCAL_AGENT_MAX_BUFFER = 2 * 1024 * 1024;

export type CodexAgentOptions = {
    url?: string | null;
    name?: string | null;
    configPath?: string;
    fetchFn?: FetchLike;
    openUrl?: (url: string) => Promise<void> | void;
    pollIntervalMs?: number;
    runCodexAgentFn?: RunCodexAgent;
    maxJobs?: number;
};

type Credential = NonNullable<Awaited<ReturnType<typeof resolveCredential>>>;

type RegisterResponse = {
    bridge: {
        id: string;
        provider: string;
        name: string;
    };
};

type ClaimResponse = {
    job: null | {
        id: string;
        provider: string;
        model: string;
        prompt: string;
    };
};

type CommandResult = {
    text: string;
    stdout: string;
    stderr: string;
};

export type CodexDoryMcpConfig = {
    endpoint: string;
    auth: { type: 'bearer-env'; envVar: string; token: string };
    enabledTools: string[];
    toolTimeoutSec: number;
};

type RunCodexAgent = (modelId: string, prompt: string, config: CodexDoryMcpConfig) => Promise<CommandResult>;

export const DORY_CODEX_MCP_TOKEN_ENV = 'DORY_MCP_TOKEN';
export const DORY_CODEX_MCP_ENABLED_TOOLS = [
    'dory_create_work',
    'dory_finish_work',
    'dory_list_connections',
    'dory_explore_schema',
    'dory_run_readonly_sql',
    'dory_workspace_tabs',
    'dory_saved_queries',
];
export const DORY_CODEX_MCP_TOOL_TIMEOUT_SEC = 90;

function toTomlString(value: string) {
    return JSON.stringify(value);
}

function toTomlStringArray(values: string[]) {
    return `[${values.map(toTomlString).join(', ')}]`;
}

export function buildCodexDoryMcpArgs(config: CodexDoryMcpConfig): string[] {
    return [
        '-c',
        `mcp_servers.dory.url=${toTomlString(config.endpoint)}`,
        '-c',
        'mcp_servers.dory.enabled=true',
        '-c',
        'mcp_servers.dory.required=true',
        '-c',
        'mcp_servers.dory.default_tools_approval_mode="approve"',
        '-c',
        `mcp_servers.dory.tool_timeout_sec=${config.toolTimeoutSec}`,
        '-c',
        `mcp_servers.dory.enabled_tools=${toTomlStringArray(config.enabledTools)}`,
        '-c',
        `mcp_servers.dory.bearer_token_env_var=${toTomlString(config.auth.envVar)}`,
    ];
}

export function buildCodexDoryMcpEnv(config: CodexDoryMcpConfig): Record<string, string> {
    return {
        [config.auth.envVar]: config.auth.token,
    };
}

function candidatePaths(command: string): string[] {
    const paths = new Set<string>();
    for (const entry of (process.env.PATH ?? '').split(delimiter)) {
        if (entry.trim()) paths.add(join(entry, command));
    }
    paths.add(join(homedir(), '.local/bin', command));
    paths.add(join(homedir(), '.codex/bin', command));
    paths.add(join('/opt/homebrew/bin', command));
    paths.add(join('/usr/local/bin', command));
    paths.add(join('/usr/bin', command));
    return [...paths];
}

async function findExecutable(command: string): Promise<string | null> {
    for (const path of candidatePaths(command)) {
        try {
            await access(path, constants.X_OK);
            return path;
        } catch {
            // Try the next candidate.
        }
    }
    return null;
}

function runProcess(command: string, args: string[], input: string, options: { cwd: string; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: {
                ...process.env,
                ...(options.env ?? {}),
                NO_COLOR: '1',
            },
        });
        let stdout = '';
        let stderr = '';
        let settled = false;

        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            finish(new Error('Local Codex agent timed out.'));
        }, LOCAL_AGENT_TIMEOUT_MS);

        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (error) reject(error);
            else resolve({ stdout, stderr });
        };

        child.stdout.on('data', chunk => {
            stdout += String(chunk);
            if (stdout.length > LOCAL_AGENT_MAX_BUFFER) {
                child.kill('SIGTERM');
                finish(new Error('Local Codex agent output exceeded the maximum size.'));
            }
        });
        child.stderr.on('data', chunk => {
            stderr += String(chunk);
            if (stderr.length > LOCAL_AGENT_MAX_BUFFER) {
                child.kill('SIGTERM');
                finish(new Error('Local Codex agent error output exceeded the maximum size.'));
            }
        });
        child.on('error', finish);
        child.on('close', code => {
            if (code === 0) finish();
            else finish(new Error(stderr.trim() || `Local Codex agent exited with code ${code ?? 'unknown'}.`));
        });
        child.stdin.end(input);
    });
}

export async function runCodexAgent(modelId: string, prompt: string, doryMcpConfig: CodexDoryMcpConfig): Promise<CommandResult> {
    const codex = await findExecutable('codex');
    if (!codex) {
        throw new Error('codex CLI was not found on this device.');
    }

    const cwd = await mkdtemp(join(tmpdir(), 'dory-codex-agent-'));
    const outputPath = join(cwd, 'last-message.txt');
    const args = [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--ignore-user-config',
        '--ignore-rules',
        '--sandbox',
        'read-only',
        '-c',
        'approval_policy="never"',
        '--output-last-message',
        outputPath,
    ];
    if (modelId && modelId !== 'default') args.push('--model', modelId);
    args.push(...buildCodexDoryMcpArgs(doryMcpConfig));
    args.push('-');

    try {
        const result = await runProcess(codex, args, prompt, {
            cwd,
            env: buildCodexDoryMcpEnv(doryMcpConfig),
        });
        const text = (await readFile(outputPath, 'utf8').catch(() => result.stdout)).trim();
        return { ...result, text };
    } finally {
        await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
}

export async function prepareCodexAgentBridge(options: CodexAgentOptions = {}) {
    if (!options.runCodexAgentFn) {
        await findExecutable('codex').then(path => {
            if (!path) throw new Error('codex CLI was not found on this device.');
        });
    }

    const name = options.name?.trim() || 'Dory Codex Agent';
    return ensureRegisteredBridge(options, name);
}

async function postAuthorized<T>(credential: Credential, path: string, body: unknown, fetchFn?: FetchLike) {
    return postJson<T>(new URL(path, credential.origin).toString(), body, fetchFn ?? fetch, {
        authorization: `Bearer ${credential.token}`,
    });
}

async function registerBridge(credential: Credential, name: string, fetchFn?: FetchLike) {
    return postAuthorized<RegisterResponse>(
        credential,
        '/api/mcp/local-ai/bridges/register',
        {
            provider: 'codex-agent',
            name,
            capabilities: {
                providers: ['codex-agent'],
                doryMcpTools: true,
                localAiBridgeProtocol: 2,
                pid: process.pid,
                platform: process.platform,
            },
        },
        fetchFn,
    );
}

async function resolveCodexAgentCredential(options: CodexAgentOptions): Promise<Credential> {
    const configPath = options.configPath ?? getBridgeConfigPath();
    const existing = await resolveCredential(options.url, process.env, configPath);
    if (existing) return existing;

    await login({
        url: options.url,
        clientName: options.name?.trim() || 'Dory Codex Agent',
        configPath,
        scopes: LOCAL_AI_SCOPES,
        fetchFn: options.fetchFn,
        openUrl: options.openUrl,
        pollIntervalMs: options.pollIntervalMs,
    });

    const credential = await resolveCredential(options.url, process.env, configPath);
    if (!credential) {
        throw new Error('Dory MCP authorization did not produce a credential.');
    }
    return credential;
}

async function ensureRegisteredBridge(options: CodexAgentOptions, name: string): Promise<{ credential: Credential; bridgeId: string }> {
    let credential = await resolveCodexAgentCredential(options);

    try {
        const registered = await registerBridge(credential, name, options.fetchFn);
        return { credential, bridgeId: registered.bridge.id };
    } catch (error: any) {
        if (error?.status !== 401 && error?.status !== 403) throw error;
    }

    await login({
        url: options.url,
        clientName: name,
        configPath: options.configPath ?? getBridgeConfigPath(),
        scopes: LOCAL_AI_SCOPES,
        fetchFn: options.fetchFn,
        openUrl: options.openUrl,
        pollIntervalMs: options.pollIntervalMs,
    });
    credential = await resolveCodexAgentCredential(options);
    const registered = await registerBridge(credential, name, options.fetchFn);
    return { credential, bridgeId: registered.bridge.id };
}

async function completeJob(credential: Credential, bridgeId: string, jobId: string, result: CommandResult | Error, fetchFn?: FetchLike) {
    if (result instanceof Error) {
        await postAuthorized(
            credential,
            `/api/mcp/local-ai/jobs/${encodeURIComponent(jobId)}/complete`,
            {
                ok: false,
                bridgeId,
                errorMessage: result.message,
            },
            fetchFn,
        );
        return;
    }

    await postAuthorized(
        credential,
        `/api/mcp/local-ai/jobs/${encodeURIComponent(jobId)}/complete`,
        {
            ok: true,
            bridgeId,
            text: result.text,
            stdout: result.stdout,
            stderr: result.stderr,
        },
        fetchFn,
    );
}

export async function startCodexAgentBridge(options: CodexAgentOptions = {}) {
    const name = options.name?.trim() || 'Dory Codex Agent';
    const { credential, bridgeId } = await prepareCodexAgentBridge(options);
    const runCodex = options.runCodexAgentFn ?? runCodexAgent;
    const doryMcpConfig: CodexDoryMcpConfig = {
        endpoint: credential.endpoint,
        auth: {
            type: 'bearer-env',
            envVar: DORY_CODEX_MCP_TOKEN_ENV,
            token: credential.token,
        },
        enabledTools: DORY_CODEX_MCP_ENABLED_TOOLS,
        toolTimeoutSec: DORY_CODEX_MCP_TOOL_TIMEOUT_SEC,
    };
    process.stderr.write(`Dory Codex Agent connected: ${name} (${bridgeId})\n`);

    let stopping = false;
    let completedJobs = 0;
    const stop = () => {
        stopping = true;
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    while (!stopping) {
        const claimed = await postAuthorized<ClaimResponse>(
            credential,
            '/api/mcp/local-ai/jobs/claim',
            {
                bridgeId,
                waitMs: 20_000,
            },
            options.fetchFn,
        );

        if (!claimed.job) {
            continue;
        }

        try {
            const result = await runCodex(claimed.job.model, claimed.job.prompt, doryMcpConfig);
            await completeJob(credential, bridgeId, claimed.job.id, result, options.fetchFn);
        } catch (error) {
            await completeJob(credential, bridgeId, claimed.job.id, error instanceof Error ? error : new Error(String(error)), options.fetchFn);
        }

        completedJobs += 1;
        if (options.maxJobs && completedJobs >= options.maxJobs) {
            break;
        }

        await sleep(50);
    }
}
