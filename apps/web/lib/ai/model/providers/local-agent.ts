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
import { createAndWaitForLocalAiBridgeJob, parseLocalAiBridgeTarget } from '@/lib/server/local-ai/bridge';
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

const LOCAL_AGENT_TIMEOUT_MS = 120_000;
const LOCAL_AGENT_MAX_BUFFER = 2 * 1024 * 1024;

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

function toolInstructions(options: LanguageModelV3CallOptions): string[] {
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

function buildInstruction(options: LanguageModelV3CallOptions): string {
    const parts = [
        'You are acting as a local AI provider for Dory.',
        'Return only the final answer for the user request.',
        'Do not modify files, run commands, or perform external side effects.',
        ...toolInstructions(options),
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

async function runCodexAgent(modelId: string, prompt: string, signal?: AbortSignal): Promise<LocalAgentCommandResult> {
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

    args.push('-');

    try {
        const result = await runProcess(status.path, args, prompt, { cwd, signal });
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

async function runLocalAgent(providerKey: LocalAiAgentProvider, modelId: string, options: LanguageModelV3CallOptions): Promise<LocalAgentCommandResult> {
    const prompt = buildInstruction(options);
    if (providerKey === 'codex-agent') {
        return runCodexAgent(modelId, prompt, options.abortSignal);
    }

    return runClaudeCodeAgent(modelId, prompt, options.abortSignal);
}

async function runLocalAgentViaBridge(providerKey: LocalAiAgentProvider, modelId: string, target: string, organizationId: string | null | undefined, options: LanguageModelV3CallOptions): Promise<LocalAgentCommandResult> {
    const bridgeId = parseLocalAiBridgeTarget(target);
    if (!bridgeId || !organizationId) {
        throw new Error('Local AI bridge target is incomplete.');
    }

    const prompt = buildInstruction(options);
    const result = await createAndWaitForLocalAiBridgeJob({
        db: await getDBService(),
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
                    const prompt = buildInstruction(callOptions);
                    const commandResult = shouldUseBridge(options.target)
                        ? await runLocalAgentViaBridge(options.providerKey, modelId, options.target!, options.organizationId, callOptions)
                        : await runLocalAgent(options.providerKey, modelId, callOptions);
                    return toGenerateResult(commandResult, prompt);
                },
                async doStream(callOptions) {
                    const prompt = buildInstruction(callOptions);
                    const commandResult = shouldUseBridge(options.target)
                        ? await runLocalAgentViaBridge(options.providerKey, modelId, options.target!, options.organizationId, callOptions)
                        : await runLocalAgent(options.providerKey, modelId, callOptions);
                    return toStreamResult(commandResult, prompt);
                },
            };
        },
    };
}
