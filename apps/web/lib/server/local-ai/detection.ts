import 'server-only';

import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isLocalAiAgentProvider, type LocalAiAgentProvider } from '@dory/ee/ai/provider-options';
import { getRuntimeForServer } from '@dory/shared/runtime';
import type { DBService } from '@dory/database';
import { assertLocalAiBridgeAvailable, listLocalAiBridgeSummaries, parseLocalAiBridgeTarget, type LocalAiBridgeSummary } from './bridge';

const execFileAsync = promisify(execFile);
const DETECTION_TIMEOUT_MS = 2500;
const SERVICE_TIMEOUT_MS = 1200;

export type LocalAiAgentId = 'codex-agent' | 'claude-code-agent';
export type LocalAiModelServiceId = 'ollama' | 'lmstudio';

export type LocalAiAgentStatus = {
    id: LocalAiAgentId;
    available: boolean;
    command: string;
    path: string | null;
    version: string | null;
    error: string | null;
};

export type LocalAiModelServiceStatus = {
    id: LocalAiModelServiceId;
    available: boolean;
    label: string;
    baseUrl: string;
    error: string | null;
};

export type LocalAiStatus = {
    runtime: string | null;
    available: boolean;
    agents: LocalAiAgentStatus[];
    modelServices: LocalAiModelServiceStatus[];
    bridges?: LocalAiBridgeSummary[];
};

const AGENT_COMMANDS: Record<LocalAiAgentId, string> = {
    'codex-agent': 'codex',
    'claude-code-agent': 'claude',
};

const MODEL_SERVICE_TARGETS: Array<Omit<LocalAiModelServiceStatus, 'available' | 'error'>> = [
    {
        id: 'ollama',
        label: 'Ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
    },
    {
        id: 'lmstudio',
        label: 'LM Studio',
        baseUrl: 'http://127.0.0.1:1234/v1',
    },
];

function candidatePaths(command: string): string[] {
    const paths = new Set<string>();
    for (const entry of (process.env.PATH ?? '').split(delimiter)) {
        if (entry.trim()) {
            paths.add(join(entry, command));
        }
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

function normalizeVersion(value: string): string | null {
    const line = value
        .split(/\r?\n/)
        .map(part => part.trim())
        .find(Boolean);
    return line ?? null;
}

async function getVersion(path: string): Promise<string | null> {
    try {
        const result = await execFileAsync(path, ['--version'], {
            timeout: DETECTION_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 64 * 1024,
        });
        return normalizeVersion(result.stdout || result.stderr);
    } catch {
        return null;
    }
}

async function detectAgent(id: LocalAiAgentId): Promise<LocalAiAgentStatus> {
    const command = AGENT_COMMANDS[id];
    const path = await findExecutable(command);

    if (!path) {
        return {
            id,
            available: false,
            command,
            path: null,
            version: null,
            error: 'CLI not found',
        };
    }

    return {
        id,
        available: true,
        command,
        path,
        version: await getVersion(path),
        error: null,
    };
}

async function detectModelService(target: Omit<LocalAiModelServiceStatus, 'available' | 'error'>): Promise<LocalAiModelServiceStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS);

    try {
        const response = await fetch(`${target.baseUrl.replace(/\/+$/, '')}/models`, {
            signal: controller.signal,
            cache: 'no-store',
        });

        return {
            ...target,
            available: response.ok,
            error: response.ok ? null : `HTTP ${response.status}`,
        };
    } catch (error) {
        return {
            ...target,
            available: false,
            error: error instanceof Error ? error.message : 'Service unavailable',
        };
    } finally {
        clearTimeout(timeout);
    }
}

export async function getLocalAiStatus(options: { db?: DBService; organizationId?: string } = {}): Promise<LocalAiStatus> {
    const runtime = getRuntimeForServer();
    if (runtime !== 'desktop') {
        const bridges = options.db && options.organizationId ? await listLocalAiBridgeSummaries(options.db, options.organizationId) : [];
        return {
            runtime,
            available: bridges.some(bridge => bridge.online),
            agents: [
                {
                    id: 'codex-agent',
                    available: bridges.some(bridge => bridge.provider === 'codex-agent' && bridge.online),
                    command: 'codex',
                    path: null,
                    version: null,
                    error: null,
                },
                {
                    id: 'claude-code-agent',
                    available: bridges.some(bridge => bridge.provider === 'claude-code-agent' && bridge.online),
                    command: 'claude',
                    path: null,
                    version: null,
                    error: null,
                },
            ],
            modelServices: [],
            bridges,
        };
    }

    const [agents, modelServices] = await Promise.all([
        Promise.all((Object.keys(AGENT_COMMANDS) as LocalAiAgentId[]).map(detectAgent)),
        Promise.all(MODEL_SERVICE_TARGETS.map(detectModelService)),
    ]);

    return {
        runtime,
        available: true,
        agents,
        modelServices,
        bridges: [],
    };
}

export async function assertLocalAiAgentAvailable(provider: LocalAiAgentProvider, options: { db?: DBService; organizationId?: string; target?: string | null } = {}): Promise<LocalAiAgentStatus | LocalAiBridgeSummary> {
    if (!isLocalAiAgentProvider(provider)) {
        throw new Error('Unsupported local AI agent provider.');
    }

    if (getRuntimeForServer() !== 'desktop') {
        const bridgeId = parseLocalAiBridgeTarget(options.target);
        if (!options.db || !options.organizationId || !bridgeId) {
            throw new Error('Local AI bridge is required in the Web runtime.');
        }

        const bridge = await assertLocalAiBridgeAvailable(options.db, options.organizationId, provider, bridgeId);
        return {
            id: bridge.id,
            provider: bridge.provider as LocalAiAgentProvider,
            name: bridge.name,
            online: true,
            lastSeenAt: bridge.lastSeenAt ? bridge.lastSeenAt.toISOString() : null,
            createdAt: bridge.createdAt ? bridge.createdAt.toISOString() : null,
        };
    }

    const status = await detectAgent(provider);
    if (!status.available || !status.path) {
        throw new Error(`${status.command} CLI was not found on this device.`);
    }

    return status;
}
