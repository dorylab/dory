import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import type {
    LanguageModelV3,
    LanguageModelV3CallOptions,
    LanguageModelV3Content,
    LanguageModelV3GenerateResult,
    LanguageModelV3Prompt,
    LanguageModelV3StreamPart,
    LanguageModelV3StreamResult,
    LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { getDBService } from '@dory/database';
import { assertLocalAiAgentAvailable } from '@/lib/server/local-ai/detection';
import { createAndWaitForLocalAiBridgeJob, localAiBridgeSupportsDoryMcpTools, parseLocalAiBridgeTarget } from '@/lib/server/local-ai/bridge';
import { MCP_DESKTOP_GRANT_HEADER } from '@/lib/server/mcp/auth';
import type { LocalAiAgentProvider } from '@dory/ee/ai/provider-options';

export type LocalAgentProviderOptions = {
    providerKey: LocalAiAgentProvider;
    target?: string | null;
    organizationId?: string | null;
};

type LocalAgentCommandResult = {
    text: string;
    stdout: string;
    stderr: string;
};

export type CodexDoryMcpConfig = {
    endpoint: string;
    auth: { type: 'bearer-env'; envVar: string; token: string } | { type: 'desktop-grant-header'; envVar: string; grant: string };
    enabledTools: string[];
    toolTimeoutSec: number;
};

type LocalAgentDoryContext = {
    doryMcpAvailable: boolean;
    doryMcpConfig?: CodexDoryMcpConfig | null;
    bridgeMissingDoryMcpTools?: boolean;
    connectionId?: string | null;
    requestId?: string | null;
    chatId?: string | null;
};

const LOCAL_AGENT_TIMEOUT_MS = 120_000;
const LOCAL_AGENT_MAX_BUFFER = 2 * 1024 * 1024;
export const DORY_CODEX_MCP_TOKEN_ENV = 'DORY_MCP_TOKEN';
export const DORY_CODEX_MCP_DESKTOP_GRANT_ENV = 'DORY_MCP_DESKTOP_GRANT';
export const DORY_CODEX_MCP_ENDPOINT_HEADER = 'x-dory-local-agent-mcp-endpoint';
export const DORY_CODEX_CONNECTION_ID_HEADER = 'x-dory-local-agent-connection-id';
export const DORY_CODEX_REQUEST_ID_HEADER = 'x-dory-local-agent-request-id';
export const DORY_CODEX_CHAT_ID_HEADER = 'x-dory-local-agent-chat-id';
export const DORY_CODEX_MCP_ENABLED_TOOLS = [
    'dory_create_work',
    'dory_finish_work',
    'dory_read',
    'dory_write',
    'dory_list_connections',
    'dory_explore_schema',
    'dory_get_schema_graph',
    'dory_run_readonly_sql',
    'dory_workspace_tabs',
    'dory_saved_queries',
];
export const DORY_CODEX_MCP_TOOL_TIMEOUT_SEC = 90;
const DORY_CODEX_MCP_AUTO_APPROVED_TOOLS = ['dory_create_work', 'dory_finish_work'];

function toTomlString(value: string) {
    return JSON.stringify(value);
}

function toTomlStringArray(values: string[]) {
    return `[${values.map(toTomlString).join(', ')}]`;
}

function toTomlInlineStringMap(values: Record<string, string>) {
    return `{ ${Object.entries(values)
        .map(([key, value]) => `${toTomlString(key)} = ${toTomlString(value)}`)
        .join(', ')} }`;
}

export function buildCodexDoryMcpArgs(config: CodexDoryMcpConfig): string[] {
    const args = [
        '-c',
        `mcp_servers.dory.url=${toTomlString(config.endpoint)}`,
        '-c',
        'mcp_servers.dory.enabled=true',
        '-c',
        'mcp_servers.dory.required=true',
        '-c',
        'mcp_servers.dory.default_tools_approval_mode="approve"',
        ...DORY_CODEX_MCP_AUTO_APPROVED_TOOLS.flatMap(tool => ['-c', `mcp_servers.dory.tools.${tool}.approval_mode=${toTomlString('never_ask')}`]),
        '-c',
        `mcp_servers.dory.tool_timeout_sec=${config.toolTimeoutSec}`,
        '-c',
        `mcp_servers.dory.enabled_tools=${toTomlStringArray(config.enabledTools)}`,
    ];

    if (config.auth.type === 'bearer-env') {
        args.push('-c', `mcp_servers.dory.bearer_token_env_var=${toTomlString(config.auth.envVar)}`);
    } else {
        args.push('-c', `mcp_servers.dory.env_http_headers=${toTomlInlineStringMap({ [MCP_DESKTOP_GRANT_HEADER]: config.auth.envVar })}`);
    }

    return args;
}

export function buildCodexDoryMcpEnv(config: CodexDoryMcpConfig): Record<string, string> {
    if (config.auth.type === 'bearer-env') {
        return { [config.auth.envVar]: config.auth.token };
    }
    return { [config.auth.envVar]: config.auth.grant };
}

function getHeader(headers: Record<string, string | undefined> | undefined, name: string): string | null {
    const exact = headers?.[name];
    if (typeof exact === 'string' && exact.trim()) return exact.trim();

    const lowerName = name.toLowerCase();
    const entry = Object.entries(headers ?? {}).find(([key, value]) => key.toLowerCase() === lowerName && typeof value === 'string' && value.trim());
    return typeof entry?.[1] === 'string' ? entry[1].trim() : null;
}

function resolveLocalAgentDoryContext(
    providerKey: LocalAiAgentProvider,
    target: string | null | undefined,
    options: LanguageModelV3CallOptions,
    bridgeSupportsDoryMcpTools = false,
): LocalAgentDoryContext {
    const headers = options.headers;
    const connectionId = getHeader(headers, DORY_CODEX_CONNECTION_ID_HEADER);
    const requestId = getHeader(headers, DORY_CODEX_REQUEST_ID_HEADER);
    const chatId = getHeader(headers, DORY_CODEX_CHAT_ID_HEADER);

    if (providerKey !== 'codex-agent') {
        return {
            doryMcpAvailable: false,
            connectionId,
            requestId,
            chatId,
        };
    }

    if (shouldUseBridge(target)) {
        return {
            doryMcpAvailable: bridgeSupportsDoryMcpTools,
            bridgeMissingDoryMcpTools: !bridgeSupportsDoryMcpTools,
            connectionId,
            requestId,
            chatId,
        };
    }

    const endpoint = getHeader(headers, DORY_CODEX_MCP_ENDPOINT_HEADER);
    const grant = getHeader(headers, MCP_DESKTOP_GRANT_HEADER);
    if (!endpoint || !grant) {
        return {
            doryMcpAvailable: false,
            connectionId,
            requestId,
            chatId,
        };
    }

    return {
        doryMcpAvailable: true,
        doryMcpConfig: {
            endpoint,
            auth: {
                type: 'desktop-grant-header',
                envVar: DORY_CODEX_MCP_DESKTOP_GRANT_ENV,
                grant,
            },
            enabledTools: DORY_CODEX_MCP_ENABLED_TOOLS,
            toolTimeoutSec: DORY_CODEX_MCP_TOOL_TIMEOUT_SEC,
        },
        connectionId,
        requestId,
        chatId,
    };
}

function usageFromText(input: string, output: string): LanguageModelV3Usage {
    return {
        inputTokens: {
            total: Math.ceil(input.length / 4),
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
        },
        outputTokens: {
            total: Math.ceil(output.length / 4),
            text: Math.ceil(output.length / 4),
            reasoning: undefined,
        },
    };
}

function appendTextPart(parts: string[], label: string, text: string) {
    const trimmed = text.trim();
    if (trimmed) {
        parts.push(`${label}:\n${trimmed}`);
    }
}

function stringifyPart(part: unknown): string {
    if (!part || typeof part !== 'object') return '';
    const typed = part as { type?: string; text?: string; toolName?: string; output?: unknown; input?: unknown };
    if (typed.type === 'text' || typed.type === 'reasoning') return typed.text ?? '';
    if (typed.type === 'tool-call') return `[tool call: ${typed.toolName ?? 'unknown'}] ${JSON.stringify(typed.input ?? null)}`;
    if (typed.type === 'tool-result') return `[tool result: ${typed.toolName ?? 'unknown'}] ${JSON.stringify(typed.output ?? null)}`;
    if (typed.type === 'file') return '[file attachment omitted]';
    return '';
}

function promptToText(prompt: LanguageModelV3Prompt): string {
    const parts: string[] = [];

    for (const message of prompt) {
        if (message.role === 'system') {
            appendTextPart(parts, 'System', message.content);
            continue;
        }

        const content = message.content.map(stringifyPart).filter(Boolean).join('\n');
        appendTextPart(parts, message.role.charAt(0).toUpperCase() + message.role.slice(1), content);
    }

    return parts.join('\n\n');
}

function toolInstructions(options: LanguageModelV3CallOptions, context: LocalAgentDoryContext): string[] {
    if (context.doryMcpAvailable) {
        const contextLines = [
            context.connectionId ? `- Current Dory connectionId: ${context.connectionId}` : null,
            context.chatId ? `- Current Dory chat/session id: ${context.chatId}` : null,
            context.requestId ? `- Current Dory request id: ${context.requestId}` : null,
        ].filter(Boolean);

        return [
            'Dory MCP tools are available to Codex for this request.',
            'For database questions, call dory_create_work once first, then pass the returned work.workId to later Dory tool calls.',
            'For non-query Dory read operations, use dory_read with the actionId. For create, update, or delete operations such as connection.create, use dory_write with the actionId instead of expecting a separate tool for every action.',
            'When the user asks for query results, write read-only SQL and call dory_run_readonly_sql. Answer from the tool result; do not claim a query was run without tool output.',
            'If the schema is unclear, call dory_explore_schema before writing SQL.',
            ...(contextLines.length ? [`Dory request context:\n${contextLines.join('\n')}`] : []),
        ];
    }

    if (context.bridgeMissingDoryMcpTools) {
        return [
            'The connected Dory local AI bridge is online but does not advertise Dory MCP tool support.',
            'Do not claim that database tools or SQL queries have run.',
            'Tell the user to restart the Dory Codex Agent with an updated @getdory/cli package before database query execution can work.',
            'If useful, provide the SQL as a manual fallback only after clearly saying the query was not executed.',
        ];
    }

    if (!options.tools?.length) return [];

    const toolLines = options.tools.map(tool => {
        if (tool.type === 'function') {
            return `- ${tool.name}${tool.description ? `: ${tool.description}` : ''}`;
        }
        return `- ${tool.name}`;
    });

    return [
        'The host application supplied AI SDK tools for this request, but this local agent provider cannot call them directly yet.',
        'Do not emit tool calls or pretend that a tool has run.',
        'If the user asks for database work, provide the SQL, reasoning, or next manual step that Dory can show to the user.',
        `Available host tools for context only:\n${toolLines.join('\n')}`,
    ];
}

export function buildInstruction(options: LanguageModelV3CallOptions, context: LocalAgentDoryContext = { doryMcpAvailable: false }): string {
    const parts = [
        'You are acting as a local AI provider for Dory.',
        'Return only the final answer for the user request.',
        'Do not modify files, run commands, or perform external side effects.',
        ...toolInstructions(options, context),
    ];

    if (options.responseFormat?.type === 'json') {
        parts.push('Return valid JSON only. Do not wrap JSON in Markdown code fences.');
        if (options.responseFormat.schema) {
            parts.push(`JSON schema:\n${JSON.stringify(options.responseFormat.schema)}`);
        }
    }

    return `${parts.join('\n')}\n\n${promptToText(options.prompt)}`;
}

function runProcess(
    command: string,
    args: string[],
    input: string,
    options: {
        cwd: string;
        env?: Record<string, string>;
        signal?: AbortSignal;
    },
): Promise<{ stdout: string; stderr: string }> {
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
            finish(new Error('Local AI agent timed out.'));
        }, LOCAL_AGENT_TIMEOUT_MS);

        const onAbort = () => {
            child.kill('SIGTERM');
            finish(new Error('Local AI agent request was aborted.'));
        };

        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            options.signal?.removeEventListener('abort', onAbort);
            if (error) {
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        };

        options.signal?.addEventListener('abort', onAbort, { once: true });

        child.stdout.on('data', chunk => {
            stdout += String(chunk);
            if (stdout.length > LOCAL_AGENT_MAX_BUFFER) {
                child.kill('SIGTERM');
                finish(new Error('Local AI agent output exceeded the maximum size.'));
            }
        });
        child.stderr.on('data', chunk => {
            stderr += String(chunk);
            if (stderr.length > LOCAL_AGENT_MAX_BUFFER) {
                child.kill('SIGTERM');
                finish(new Error('Local AI agent error output exceeded the maximum size.'));
            }
        });
        child.on('error', error => finish(error));
        child.on('close', code => {
            if (code === 0) {
                finish();
                return;
            }

            finish(new Error(stderr.trim() || `Local AI agent exited with code ${code ?? 'unknown'}.`));
        });
        child.stdin.end(input);
    });
}

async function runCodexAgent(modelId: string, prompt: string, signal?: AbortSignal, doryMcpConfig?: CodexDoryMcpConfig | null): Promise<LocalAgentCommandResult> {
    const status = await assertLocalAiAgentAvailable('codex-agent');
    if (!('path' in status) || !status.path) {
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

    if (modelId && modelId !== 'default') {
        args.push('--model', modelId);
    }

    if (doryMcpConfig) {
        args.push(...buildCodexDoryMcpArgs(doryMcpConfig));
    }

    args.push('-');

    try {
        const result = await runProcess(status.path, args, prompt, {
            cwd,
            signal,
            env: doryMcpConfig ? buildCodexDoryMcpEnv(doryMcpConfig) : undefined,
        });
        const text = (await readFile(outputPath, 'utf8').catch(() => result.stdout)).trim();
        return { ...result, text };
    } finally {
        await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function runClaudeCodeAgent(modelId: string, prompt: string, signal?: AbortSignal): Promise<LocalAgentCommandResult> {
    const status = await assertLocalAiAgentAvailable('claude-code-agent');
    if (!('path' in status) || !status.path) {
        throw new Error('claude CLI was not found on this device.');
    }
    const cwd = await mkdtemp(join(tmpdir(), 'dory-claude-agent-'));
    const args = ['--print', '--output-format', 'text', '--input-format', 'text', '--no-session-persistence', '--bare', '--tools', ''];

    if (modelId && modelId !== 'default') {
        args.push('--model', modelId);
    }

    try {
        const result = await runProcess(status.path, args, prompt, { cwd, signal });
        return { ...result, text: result.stdout.trim() };
    } finally {
        await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function runLocalAgent(
    providerKey: LocalAiAgentProvider,
    modelId: string,
    options: LanguageModelV3CallOptions,
    context: LocalAgentDoryContext,
): Promise<LocalAgentCommandResult> {
    const prompt = buildInstruction(options, context);
    if (providerKey === 'codex-agent') {
        return runCodexAgent(modelId, prompt, options.abortSignal, context.doryMcpConfig);
    }

    return runClaudeCodeAgent(modelId, prompt, options.abortSignal);
}

async function runLocalAgentViaBridge(
    providerKey: LocalAiAgentProvider,
    modelId: string,
    target: string,
    organizationId: string | null | undefined,
    options: LanguageModelV3CallOptions,
    context: LocalAgentDoryContext,
): Promise<LocalAgentCommandResult> {
    const bridgeId = parseLocalAiBridgeTarget(target);
    if (!bridgeId || !organizationId) {
        throw new Error('Local AI bridge target is incomplete.');
    }

    const db = await getDBService();
    const bridge = await db.mcp.getLocalAiBridge(organizationId, bridgeId);
    const bridgeSupportsDoryMcpTools = localAiBridgeSupportsDoryMcpTools(bridge?.capabilities);
    context.doryMcpAvailable = bridgeSupportsDoryMcpTools;
    context.bridgeMissingDoryMcpTools = !bridgeSupportsDoryMcpTools;

    const prompt = buildInstruction(options, context);
    const result = await createAndWaitForLocalAiBridgeJob({
        db,
        organizationId,
        provider: providerKey,
        bridgeId,
        model: modelId,
        prompt,
        signal: options.abortSignal,
    });

    return result;
}

function shouldUseBridge(target?: string | null) {
    return Boolean(parseLocalAiBridgeTarget(target));
}

function toGenerateResult(commandResult: LocalAgentCommandResult, prompt: string): LanguageModelV3GenerateResult {
    const content: LanguageModelV3Content[] = [
        {
            type: 'text',
            text: commandResult.text,
        },
    ];

    return {
        content,
        finishReason: {
            unified: 'stop',
            raw: 'stop',
        },
        usage: usageFromText(prompt, commandResult.text),
        response: {
            body: {
                stdout: commandResult.stdout,
                stderr: commandResult.stderr,
            },
        },
        warnings: [],
    };
}

function toStreamResult(commandResult: LocalAgentCommandResult, prompt: string): LanguageModelV3StreamResult {
    const usage = usageFromText(prompt, commandResult.text);
    const stream = new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
            const textId = 'local-agent-text';
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: textId });
            if (commandResult.text) {
                controller.enqueue({ type: 'text-delta', id: textId, delta: commandResult.text });
            }
            controller.enqueue({ type: 'text-end', id: textId });
            controller.enqueue({
                type: 'finish',
                usage,
                finishReason: {
                    unified: 'stop',
                    raw: 'stop',
                },
            });
            controller.close();
        },
    });

    return { stream };
}

export function createLocalAgentProvider(options: LocalAgentProviderOptions) {
    return {
        chatModel: (modelName: string): LanguageModelV3 => {
            const modelId = modelName.trim() || 'default';
            return {
                specificationVersion: 'v3',
                provider: options.providerKey,
                modelId,
                supportedUrls: {},
                async doGenerate(callOptions) {
                    const context = resolveLocalAgentDoryContext(options.providerKey, options.target, callOptions);
                    const commandResult = shouldUseBridge(options.target)
                        ? await runLocalAgentViaBridge(options.providerKey, modelId, options.target!, options.organizationId, callOptions, context)
                        : await runLocalAgent(options.providerKey, modelId, callOptions, context);
                    const prompt = buildInstruction(callOptions, context);
                    return toGenerateResult(commandResult, prompt);
                },
                async doStream(callOptions) {
                    const context = resolveLocalAgentDoryContext(options.providerKey, options.target, callOptions);
                    const commandResult = shouldUseBridge(options.target)
                        ? await runLocalAgentViaBridge(options.providerKey, modelId, options.target!, options.organizationId, callOptions, context)
                        : await runLocalAgent(options.providerKey, modelId, callOptions, context);
                    const prompt = buildInstruction(callOptions, context);
                    return toStreamResult(commandResult, prompt);
                },
            };
        },
    };
}
