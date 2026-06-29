import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

import { postJson, type FetchLike } from './api.js';
import { login } from './auth.js';
import { getConfigPath, resolveCredential } from './config.js';

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
];
const LOCAL_AI_SCOPE = 'local_ai:run';
const LOCAL_AI_SCOPES = [...DEFAULT_MCP_SCOPES, LOCAL_AI_SCOPE];
const LOCAL_AI_TIMEOUT_MS = 120_000;
const LOCAL_AI_MAX_BUFFER = 2 * 1024 * 1024;

export type LocalAiProvider = 'codex-agent';

export type LocalAiOptions = {
    url?: string | null;
    provider?: string | null;
    name?: string | null;
    configPath?: string;
    fetchFn?: FetchLike;
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

function runProcess(command: string, args: string[], input: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: {
                ...process.env,
                NO_COLOR: '1',
            },
        });
        let stdout = '';
        let stderr = '';
        let settled = false;

        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            finish(new Error('Local AI agent timed out.'));
        }, LOCAL_AI_TIMEOUT_MS);

        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (error) reject(error);
            else resolve({ stdout, stderr });
        };

        child.stdout.on('data', chunk => {
            stdout += String(chunk);
            if (stdout.length > LOCAL_AI_MAX_BUFFER) {
                child.kill('SIGTERM');
                finish(new Error('Local AI agent output exceeded the maximum size.'));
            }
        });
        child.stderr.on('data', chunk => {
            stderr += String(chunk);
            if (stderr.length > LOCAL_AI_MAX_BUFFER) {
                child.kill('SIGTERM');
                finish(new Error('Local AI agent error output exceeded the maximum size.'));
            }
        });
        child.on('error', finish);
        child.on('close', code => {
            if (code === 0) finish();
            else finish(new Error(stderr.trim() || `Local AI agent exited with code ${code ?? 'unknown'}.`));
        });
        child.stdin.end(input);
    });
}

async function runCodexAgent(modelId: string, prompt: string): Promise<CommandResult> {
    const codex = await findExecutable('codex');
    if (!codex) {
        throw new Error('codex CLI was not found on this device.');
    }

    const cwd = await mkdtemp(join(tmpdir(), 'dory-mcp-codex-agent-'));
    const outputPath = join(cwd, 'last-message.txt');
    const args = [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--ignore-rules',
        '--sandbox',
        'read-only',
        '-c',
        'approval_policy="never"',
        '--output-last-message',
        outputPath,
    ];
    if (modelId && modelId !== 'default') args.push('--model', modelId);
    args.push('-');

    try {
        const result = await runProcess(codex, args, prompt, cwd);
        const text = (await readFile(outputPath, 'utf8').catch(() => result.stdout)).trim();
        return { ...result, text };
    } finally {
        await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function postAuthorized<T>(credential: Credential, path: string, body: unknown, fetchFn?: FetchLike) {
    return postJson<T>(new URL(path, credential.origin).toString(), body, fetchFn ?? fetch, {
        authorization: `Bearer ${credential.token}`,
    });
}

async function registerBridge(credential: Credential, provider: LocalAiProvider, name: string, fetchFn?: FetchLike) {
    return postAuthorized<RegisterResponse>(
        credential,
        '/api/mcp/local-ai/bridges/register',
        {
            provider,
            name,
            capabilities: {
                providers: [provider],
                pid: process.pid,
                platform: process.platform,
            },
        },
        fetchFn,
    );
}

async function resolveLocalAiCredential(options: LocalAiOptions): Promise<Credential> {
    const configPath = options.configPath ?? getConfigPath();
    const existing = await resolveCredential(options.url, process.env, configPath);
    if (existing) return existing;

    await login({
        url: options.url,
        clientName: options.name?.trim() || 'Dory Local AI',
        configPath,
        scopes: LOCAL_AI_SCOPES,
    });

    const credential = await resolveCredential(options.url, process.env, configPath);
    if (!credential) {
        throw new Error('Dory MCP authorization did not produce a credential.');
    }
    return credential;
}

async function ensureRegisteredBridge(options: LocalAiOptions, provider: LocalAiProvider, name: string): Promise<{ credential: Credential; bridgeId: string }> {
    let credential = await resolveLocalAiCredential(options);

    try {
        const registered = await registerBridge(credential, provider, name, options.fetchFn);
        return { credential, bridgeId: registered.bridge.id };
    } catch (error: any) {
        if (error?.status !== 403) throw error;
    }

    await login({
        url: options.url,
        clientName: name,
        configPath: options.configPath ?? getConfigPath(),
        scopes: LOCAL_AI_SCOPES,
    });
    credential = await resolveLocalAiCredential(options);
    const registered = await registerBridge(credential, provider, name, options.fetchFn);
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

export async function startLocalAiBridge(options: LocalAiOptions = {}) {
    const provider = (options.provider?.trim() || 'codex-agent') as LocalAiProvider;
    if (provider !== 'codex-agent') {
        throw new Error('Only codex-agent is supported by dory-mcp local-ai today.');
    }

    await findExecutable('codex').then(path => {
        if (!path) throw new Error('codex CLI was not found on this device.');
    });

    const name = options.name?.trim() || 'Dory Local AI';
    const { credential, bridgeId } = await ensureRegisteredBridge(options, provider, name);
    process.stderr.write(`Dory local AI bridge connected: ${name} (${bridgeId})\n`);

    let stopping = false;
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
            const result = await runCodexAgent(claimed.job.model, claimed.job.prompt);
            await completeJob(credential, bridgeId, claimed.job.id, result, options.fetchFn);
        } catch (error) {
            await completeJob(credential, bridgeId, claimed.job.id, error instanceof Error ? error : new Error(String(error)), options.fetchFn);
        }

        await sleep(50);
    }
}
