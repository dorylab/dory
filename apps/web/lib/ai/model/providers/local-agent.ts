import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
    LanguageModelV4,
    LanguageModelV4CallOptions,
    LanguageModelV4Content,
    LanguageModelV4GenerateResult,
    LanguageModelV4Prompt,
    LanguageModelV4StreamPart,
    LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { getDBService } from '@dory/database';
import type { LocalAiAgentProvider } from '@dory/ee/ai/provider-options';
import type { ChatProgressEntry } from '@dory/shared/types/chat-progress';
import { createLocalAgentProgressParser } from '@dory/shared/utils/local-agent-progress';

import { createAndWaitForLocalAiBridgeJob, localAiBridgeSupportsDoryMcpTools, parseLocalAiBridgeTarget } from '@/lib/server/local-ai/bridge';
import { assertLocalAiAgentAvailable } from '@/lib/server/local-ai/detection';
import { MCP_DESKTOP_GRANT_HEADER } from '@/lib/server/mcp/auth';

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
    agentTurn?: { workId: string; requestId: string };
};

type LocalAgentDoryContext = {
    doryMcpAvailable: boolean;
    doryMcpConfig?: CodexDoryMcpConfig | null;
    bridgeMissingDoryMcpTools?: boolean;
    connectionId?: string | null;
    requestId?: string | null;
    chatId?: string | null;
    workId?: string | null;
};

const LOCAL_AGENT_TIMEOUT_MS = 120_000;
const LOCAL_AGENT_MAX_BUFFER = 2 * 1024 * 1024;
export const DORY_CODEX_MCP_TOKEN_ENV = 'DORY_MCP_TOKEN';
export const DORY_CODEX_MCP_DESKTOP_GRANT_ENV = 'DORY_MCP_DESKTOP_GRANT';
export const DORY_CODEX_MCP_ENDPOINT_HEADER = 'x-dory-local-agent-mcp-endpoint';
export const DORY_CODEX_CONNECTION_ID_HEADER = 'x-dory-local-agent-connection-id';
export const DORY_CODEX_REQUEST_ID_HEADER = 'x-dory-local-agent-request-id';
export const DORY_CODEX_CHAT_ID_HEADER = 'x-dory-local-agent-chat-id';
export const DORY_CODEX_WORK_ID_HEADER = 'x-dory-local-agent-work-id';
export const DORY_CODEX_MCP_ENABLED_TOOLS = [
    'dory_create_work',
    'dory_finish_work',
    'dory_get_report',
    'dory_publish_report',
    'dory_publish_progress',
    'dory_read',
    'dory_write',
    'dory_search_assets',
    'dory_read_asset',
    'dory_read_attachment',
    'dory_search_attachment',
    'dory_list_connections',
    'dory_explore_schema',
    'dory_get_schema_graph',
    'dory_run_readonly_sql',
    'dory_workspace_tabs',
    'dory_saved_queries',
];
export const DORY_CODEX_MCP_TOOL_TIMEOUT_SEC = 90;
const DORY_CODEX_MCP_AUTO_APPROVED_TOOLS = ['dory_create_work', 'dory_finish_work', 'dory_publish_progress'];

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
        ...DORY_CODEX_MCP_AUTO_APPROVED_TOOLS.flatMap(tool => ['-c', `mcp_servers.dory.tools.${tool}.approval_mode=${toTomlString('approve')}`]),
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

    if (config.agentTurn)
        args.push(
            '-c',
            `mcp_servers.dory.http_headers=${toTomlInlineStringMap({ 'x-dory-agent-work-id': config.agentTurn.workId, 'x-dory-agent-request-id': config.agentTurn.requestId })}`,
        );
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

export function resolveLocalAgentDoryContext(
    providerKey: LocalAiAgentProvider,
    target: string | null | undefined,
    options: LanguageModelV4CallOptions,
    bridgeSupportsDoryMcpTools = false,
): LocalAgentDoryContext {
    const headers = options.headers;
    const connectionId = getHeader(headers, DORY_CODEX_CONNECTION_ID_HEADER);
    const requestId = getHeader(headers, DORY_CODEX_REQUEST_ID_HEADER);
    const chatId = getHeader(headers, DORY_CODEX_CHAT_ID_HEADER);
    const workId = getHeader(headers, DORY_CODEX_WORK_ID_HEADER);

    if (providerKey !== 'codex-agent') {
        return {
            doryMcpAvailable: false,
            connectionId,
            requestId,
            chatId,
            workId,
        };
    }

    if (shouldUseBridge(target)) {
        return {
            doryMcpAvailable: bridgeSupportsDoryMcpTools,
            bridgeMissingDoryMcpTools: !bridgeSupportsDoryMcpTools,
            connectionId,
            requestId,
            chatId,
            workId,
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
            workId,
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
            agentTurn: workId && requestId ? { workId, requestId } : undefined,
        },
        connectionId,
        requestId,
        chatId,
        workId,
    };
}

function usageFromText(input: string, output: string): LanguageModelV4Usage {
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
    if (typed.type === 'reasoning-file') return '[reasoning file]';
    return '';
}

function promptToText(prompt: LanguageModelV4Prompt): string {
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

function toolInstructions(options: LanguageModelV4CallOptions, context: LocalAgentDoryContext): string[] {
    if (context.doryMcpAvailable) {
        const contextLines = [
            context.connectionId ? `- Current Dory connectionId: ${context.connectionId}` : null,
            context.workId ? `- Existing Dory Agent Run workId: ${context.workId}. Reuse it; do not create another Run. Pass workId and requestId on every tool call.` : null,
            context.chatId ? `- Current Dory chat/session id: ${context.chatId}` : null,
            context.workId ? `- Current Dory workId: ${context.workId}` : null,
            context.requestId ? `- Current Dory request id: ${context.requestId}` : null,
        ].filter(Boolean);

        return [
            'Dory MCP tools are available to Codex for this request.',
            context.workId
                ? 'The host already created the Run. Search Knowledge only when the task needs an unestablished business definition or the user explicitly asks for it, and read relevant candidates with dory_read_asset before using them. Reuse sufficient verified context for report edits and other follow-ups. Use the existing Run for SQL. Answer ordinary questions directly without dory_finish_work. Call dory_finish_work only when the user explicitly requests saved conclusions or a report. Reports need no extra Findings. If a conclusion save fails, do not retry in this turn: answer with the available analysis and explain that saving failed. After a successful explicit save, repeat finalAnswer verbatim as your reply. Use the requestId above. Do not call the host-only finishAnalysis tool. Always pass the current workId.'
                : 'For database questions, call dory_create_work once first with the current connectionId, original userQuestion and a stable externalSessionId for this conversation. Reuse that externalSessionId for retries and later turns. Read and apply its semanticContext before planning SQL, then pass the returned work.workId to later Dory tools and dory_finish_work.',
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

export function buildInstruction(options: LanguageModelV4CallOptions, context: LocalAgentDoryContext = { doryMcpAvailable: false }): string {
    const parts = [
        'You are acting as a local AI provider for Dory.',
        context.chatId
            ? 'Provide concise public progress updates between tool groups, then a separate final answer. Do not disclose private reasoning.'
            : 'Return only the final answer for the user request.',
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
        onStdout?: (chunk: string) => void;
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

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => {
            stdout += String(chunk);
            try {
                options.onStdout?.(String(chunk));
            } catch (error) {
                child.kill('SIGTERM');
                finish(error instanceof Error ? error : new Error(String(error)));
            }
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

export async function runCodexAgent(
    modelId: string,
    prompt: string,
    signal?: AbortSignal,
    doryMcpConfig?: CodexDoryMcpConfig | null,
    onProgress?: (entry: ChatProgressEntry) => void,
): Promise<LocalAgentCommandResult> {
    const status = await assertLocalAiAgentAvailable('codex-agent');
    if (!('path' in status) || !status.path) {
        throw new Error('codex CLI was not found on this device.');
    }
    const cwd = await mkdtemp(join(tmpdir(), 'dory-codex-agent-'));
    const outputPath = join(cwd, 'last-message.txt');
    const parser = onProgress ? createLocalAgentProgressParser(onProgress) : undefined;
    const args = [
        'exec',
        ...(parser ? ['--json'] : []),
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
            onStdout: parser?.push,
            env: doryMcpConfig ? buildCodexDoryMcpEnv(doryMcpConfig) : undefined,
        });
        const text = (await readFile(outputPath, 'utf8').catch(() => (parser ? '' : result.stdout))).trim();
        parser?.finish(text);
        return { ...result, text };
    } finally {
        await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function runClaudeCodeAgent(modelId: string, prompt: string, signal?: AbortSignal, onProgress?: (entry: ChatProgressEntry) => void): Promise<LocalAgentCommandResult> {
    const status = await assertLocalAiAgentAvailable('claude-code-agent');
    if (!('path' in status) || !status.path) {
        throw new Error('claude CLI was not found on this device.');
    }
    const cwd = await mkdtemp(join(tmpdir(), 'dory-claude-agent-'));
    const parser = onProgress ? createLocalAgentProgressParser(onProgress) : undefined;
    const args = [
        '--print',
        '--output-format',
        parser ? 'stream-json' : 'text',
        ...(parser ? ['--verbose'] : []),
        '--input-format',
        'text',
        '--no-session-persistence',
        '--bare',
        '--tools',
        '',
    ];

    if (modelId && modelId !== 'default') {
        args.push('--model', modelId);
    }

    try {
        const result = await runProcess(status.path, args, prompt, { cwd, signal, onStdout: parser?.push });
        const terminal = parser
            ? (result.stdout
                  .split('\n')
                  .flatMap(line => {
                      try {
                          const event = JSON.parse(line);
                          return event.type === 'result' && typeof event.result === 'string' ? [event.result] : [];
                      } catch {
                          return [];
                      }
                  })
                  .at(-1) ?? '')
            : result.stdout.trim();
        parser?.finish(terminal);
        return { ...result, text: terminal };
    } finally {
        await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function runLocalAgent(
    providerKey: LocalAiAgentProvider,
    modelId: string,
    options: LanguageModelV4CallOptions,
    context: LocalAgentDoryContext,
    onProgress?: (entry: ChatProgressEntry) => void,
): Promise<LocalAgentCommandResult> {
    const prompt = buildInstruction(options, context);
    if (providerKey === 'codex-agent') {
        return runCodexAgent(modelId, prompt, options.abortSignal, context.doryMcpConfig, onProgress);
    }

    return runClaudeCodeAgent(modelId, prompt, options.abortSignal, onProgress);
}

async function runLocalAgentViaBridge(
    providerKey: LocalAiAgentProvider,
    modelId: string,
    target: string,
    organizationId: string | null | undefined,
    options: LanguageModelV4CallOptions,
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
    const ownedRun = context.workId ? await db.works.getById({ organizationId, workId: context.workId, userId: bridge?.userId ?? '' }) : null;
    if (
        (ownedRun?.metadata?.chatTurn as { progressCheckpoints?: boolean } | undefined)?.progressCheckpoints &&
        (bridge?.capabilities as { chatCheckpoints?: number } | undefined)?.chatCheckpoints !== 1
    )
        throw new Error('This local Bridge does not support analysis progress checkpoints. Update and restart the Dory CLI Bridge, or select another model.');
    const result = await createAndWaitForLocalAiBridgeJob({
        agentTurn: ownedRun && context.requestId ? { workId: ownedRun.workId, requestId: context.requestId, userId: ownedRun.userId } : undefined,
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

function toGenerateResult(commandResult: LocalAgentCommandResult, prompt: string): LanguageModelV4GenerateResult {
    const content: LanguageModelV4Content[] = [
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

export function createLocalAgentProvider(options: LocalAgentProviderOptions) {
    return {
        chatModel: (modelName: string): LanguageModelV4 => {
            const modelId = modelName.trim() || 'default';
            return {
                specificationVersion: 'v4',
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
                    const prompt = buildInstruction(callOptions, context);
                    const stream = new ReadableStream<LanguageModelV4StreamPart>({
                        async start(controller) {
                            controller.enqueue({ type: 'stream-start', warnings: [] });
                            const userId = getHeader(callOptions.headers, 'x-dory-local-agent-user-id');
                            const organizationId = options.organizationId ?? getHeader(callOptions.headers, 'x-dory-local-agent-organization-id');
                            let pending = new Map<string, ChatProgressEntry>();
                            let writes = Promise.resolve();
                            let timer: ReturnType<typeof setTimeout> | undefined;
                            let progressError: unknown;
                            const flush = () => {
                                if (timer) clearTimeout(timer);
                                timer = undefined;
                                if (!pending.size || !userId || !organizationId || !context.workId || !context.requestId) return;
                                const entries = [...pending.values()];
                                pending = new Map();
                                writes = writes
                                    .then(async () => {
                                        const db = await getDBService();
                                        await db.works.appendChatProgress({ organizationId, userId, workId: context.workId!, requestId: context.requestId!, entries });
                                    })
                                    .catch(error => {
                                        progressError = error;
                                    });
                            };
                            const onProgress = (entry: ChatProgressEntry) => {
                                pending.set(entry.id, entry);
                                if (!timer) timer = setTimeout(flush, 100);
                            };
                            try {
                                const result = shouldUseBridge(options.target)
                                    ? await runLocalAgentViaBridge(options.providerKey, modelId, options.target!, options.organizationId, callOptions, context)
                                    : await runLocalAgent(options.providerKey, modelId, callOptions, context, context.chatId ? onProgress : undefined);
                                flush();
                                await writes;
                                if (progressError) throw progressError;
                                controller.enqueue({ type: 'text-start', id: 'local-agent-final' });
                                controller.enqueue({ type: 'text-delta', id: 'local-agent-final', delta: result.text });
                                controller.enqueue({ type: 'text-end', id: 'local-agent-final' });
                                controller.enqueue({ type: 'finish', usage: usageFromText(prompt, result.text), finishReason: { unified: 'stop', raw: 'stop' } });
                                controller.close();
                            } catch (error) {
                                flush();
                                await writes;
                                controller.error(error);
                            } finally {
                                if (timer) clearTimeout(timer);
                            }
                        },
                    });
                    return { stream };
                },
            };
        },
    };
}
