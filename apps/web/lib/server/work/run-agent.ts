import 'server-only';

import { createAgentUIStreamResponse, createIdGenerator, type ToolSet, type UIMessage } from 'ai';

import { createChartBuilderTool } from '@/app/api/chat/tools/chart-builder';
import { createDoryChatTools } from '@/app/api/chat/tools/dory-tools';
import { buildUserLanguageInstruction } from '@/app/api/chat/utils';
import { getApiLocale } from '@/app/api/utils/i18n';
import { buildDoryAgentContext } from '@/lib/ai/agents/context';
import { buildDoryChatAgent } from '@/lib/ai/agents/chat-agent';
import { resolveDoryAgentModel } from '@/lib/ai/agents/model';
import { resolveAiRouteExecution, isLocalMissingAiEnvError } from '@/lib/ai/execution/route-dispatch';
import { createAiRequestId, recordAiUsage } from '@/lib/ai/gateway';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { assertAiQuotaAllowed, buildCloudflareAiGatewayHeaders, isAiQuotaExceededError, resolveAiEntitlements, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';
import type { DBService } from '@dory/database';
import type { WorkRunEventRole, WorkRunEventType } from '@dory/database/postgres/schemas';
import { applyWorkAgentProtocolResult, checkWorkAgentProtocol, checkWorkAgentProtocolComplete, createWorkAgentProtocolState, workAgentProtocolError } from './protocol';

type RunWorkAgentOptions = {
    req: Request;
    db: DBService;
    organizationId: string;
    userId: string;
    workId: string;
};

function mergeHeaders(headers: Record<string, string | undefined> | undefined, extraHeaders: Record<string, string> | null): Record<string, string | undefined> | undefined {
    if (!extraHeaders) return headers;
    return {
        ...(headers ?? {}),
        ...extraHeaders,
    };
}

function sanitizePayload(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) return null;

    try {
        const text = JSON.stringify(value, (_key, item) => {
            if (typeof item === 'bigint') return item.toString();
            if (typeof item === 'function') return '[Function]';
            if (item instanceof Error) return { name: item.name, message: item.message };
            return item;
        });
        if (!text) return null;
        const bounded = text.length > 12000 ? `${text.slice(0, 12000)}…` : text;
        const parsed = JSON.parse(bounded.endsWith('…') ? JSON.stringify({ truncated: true, preview: bounded }) : bounded);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };
    } catch {
        return { value: String(value) };
    }
}

function toMessageContent(value: unknown, fallback: string) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (!value || typeof value !== 'object') return fallback;

    const record = value as Record<string, any>;
    if (typeof record.title === 'string' && record.title.trim()) return record.title.trim();
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    if (record.ok === false && record.error?.message) return String(record.error.message);
    return fallback;
}

function toWorkToolEventContent(toolName: string, input: unknown, output: unknown, fallback: string) {
    if (toolName === 'work_updateConclusion') {
        const conclusion = typeof input === 'object' && input ? (input as Record<string, unknown>).conclusion : null;
        return typeof conclusion === 'string' && conclusion.trim() ? conclusion.trim() : fallback;
    }
    if (toolName === 'work_updateInvestigationSummary') {
        const summary = typeof input === 'object' && input ? (input as Record<string, unknown>).summary : null;
        return typeof summary === 'string' && summary.trim() ? summary.trim() : toMessageContent(output, fallback);
    }
    return toMessageContent(output, fallback);
}

function classifyWorkToolResult(toolName: string): { type: WorkRunEventType; content: string } {
    if (toolName === 'work_createInvestigation') {
        return { type: 'investigation_created', content: 'Investigation created' };
    }
    if (toolName === 'work_updateInvestigation' || toolName === 'work_updateInvestigationSummary') {
        return { type: 'investigation_updated', content: 'Investigation updated' };
    }
    if (toolName === 'work_updateConclusion') {
        return { type: 'conclusion_updated', content: 'Conclusion updated' };
    }
    return { type: 'tool_result', content: `${toolName} completed` };
}

function workRunTools(tools: Record<string, any>) {
    const blocked = new Set([
        'query_readOnlyExecute',
        'tab_create',
        'tab_save',
        'tab_list',
        'work_create',
        'work_get',
        'work_list',
        'work_updateGoal',
        'work_updateStatus',
        'work_updateInvestigation',
        'work_getRunEventResult',
    ]);
    return Object.fromEntries(Object.entries(tools).filter(([toolName]) => !blocked.has(toolName)));
}

function withWorkSqlContext(input: unknown, params: { toolName: string; workId: string; runId: string; currentInvestigationId: string | null }) {
    if (params.toolName !== 'work_runInvestigationSql') return input;
    const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return {
        ...record,
        workId: typeof record.workId === 'string' && record.workId ? record.workId : params.workId,
        investigationId:
            typeof record.investigationId === 'string' && record.investigationId ? record.investigationId : params.currentInvestigationId ?? undefined,
        runId: params.runId,
    };
}

function wrapToolsWithRunEvents(params: {
    tools: Record<string, any>;
    workId: string;
    runId: string;
    protocol: ReturnType<typeof createWorkAgentProtocolState>;
    appendEvent: (event: { type: WorkRunEventType; role: WorkRunEventRole; content?: string | null; payload?: Record<string, unknown> | null }) => Promise<void>;
}): ToolSet {
    const waitForInvestigation = async () => {
        if (params.protocol.currentInvestigationId) return;
        const deadline = Date.now() + 800;
        while (!params.protocol.currentInvestigationId && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    };

    return Object.fromEntries(
        Object.entries(params.tools).map(([toolName, definition]) => {
            if (!definition || typeof definition.execute !== 'function') {
                return [toolName, definition];
            }

            return [
                toolName,
                {
                    ...definition,
                    execute: async (input: unknown, options: unknown) => {
                        if (toolName === 'work_runInvestigationSql' && !params.protocol.currentInvestigationId) {
                            await waitForInvestigation();
                        }

                        const executionInput = withWorkSqlContext(input, {
                            toolName,
                            workId: params.workId,
                            runId: params.runId,
                            currentInvestigationId: params.protocol.currentInvestigationId,
                        });
                        const protocolDecision = checkWorkAgentProtocol(params.protocol, toolName, executionInput);
                        if (!protocolDecision.allowed) {
                            const output = workAgentProtocolError(protocolDecision.message);
                            await params.appendEvent({
                                type: 'tool_result',
                                role: 'system',
                                content: `Protocol reminder: ${protocolDecision.message}`,
                                payload: sanitizePayload({ toolName, input: executionInput, protocol: params.protocol }),
                            });
                            return output;
                        }

                        await params.appendEvent({
                            type: 'tool_call',
                            role: 'tool',
                            content: `${toolName} called`,
                            payload: sanitizePayload({ toolName, input: executionInput }),
                        });

                        try {
                            const output = await definition.execute(executionInput, options);
                            applyWorkAgentProtocolResult(params.protocol, toolName, output);
                            const classified = classifyWorkToolResult(toolName);
                            await params.appendEvent({
                                type: classified.type,
                                role: 'tool',
                                content: toWorkToolEventContent(toolName, executionInput, output, classified.content),
                                payload: sanitizePayload({ toolName, output }),
                            });
                            return output;
                        } catch (error) {
                            await params.appendEvent({
                                type: 'error',
                                role: 'tool',
                                content: error instanceof Error ? error.message : String(error ?? `${toolName} failed`),
                                payload: sanitizePayload({ toolName, error }),
                            });
                            throw error;
                        }
                    },
                },
            ];
        }),
    ) as ToolSet;
}

function buildWorkRunInstruction(workId: string) {
    return [
        'Work Run Context',
        `You are running a Dory Work. The current workId is ${workId}.`,
        'Follow this protocol exactly: create an investigation, run SQL for that investigation, update that investigation summary, then continue or update the conclusion.',
        'Call exactly one protocol tool at a time. Do not call work.runInvestigationSql in the same step as work.createInvestigation.',
        'You must create at least one investigation before running SQL.',
        'After every SQL run, you must update the current investigation summary before running another SQL query.',
        'The conclusion must be based on completed investigation summaries.',
        'Run SQL only through work.runInvestigationSql so the SQL workspace tab and result are preserved. Do not use any direct query or tab tools.',
        'Use work.updateInvestigationSummary after SQL results, and use work.updateConclusion only after at least one investigation summary is complete.',
        'Keep the final answer concise and focused on what was found, what changed, and what to do next.',
    ].join('\n');
}

function extractResponseText(message: unknown): string | null {
    const parts = (message as any)?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text.trim())
        .filter(Boolean)
        .join('\n\n')
        .trim();
    return text || null;
}

export async function runWorkAgent(options: RunWorkAgentOptions): Promise<Response> {
    const startedAt = Date.now();
    const requestId = createAiRequestId();
    const locale = await getApiLocale();
    const work = await options.db.works.getById({ organizationId: options.organizationId, id: options.workId });

    if (!work) {
        return Response.json({ error: 'Work not found.' }, { status: 404 });
    }

    const { run, existingRunningRun } = await options.db.works.createRun({
        workId: work.id,
        organizationId: options.organizationId,
        connectionId: work.connectionId,
        createdByUserId: options.userId,
    });

    if (existingRunningRun) {
        return Response.json(
            {
                error: 'Work already has a running run.',
                run: existingRunningRun,
            },
            {
                status: 409,
                headers: {
                    'x-work-run-id': existingRunningRun.id,
                },
            },
        );
    }

    const appendEvent = async (event: { type: WorkRunEventType; role: WorkRunEventRole; content?: string | null; payload?: Record<string, unknown> | null }) => {
        await options.db.works.appendRunEvent({
            runId: run.id,
            workId: work.id,
            organizationId: options.organizationId,
            type: event.type,
            role: event.role,
            content: event.content ?? null,
            payload: event.payload ?? null,
        });
    };

    await appendEvent({
        type: 'message',
        role: 'user',
        content: work.goal,
        payload: {
            workId: work.id,
            connectionId: work.connectionId,
        },
    });
    await appendEvent({
        type: 'message',
        role: 'system',
        content: 'Agent run started',
        payload: {
            runId: run.id,
        },
    });

    try {
        const execution = await resolveAiRouteExecution({
            req: options.req as any,
            db: options.db,
            organizationId: options.organizationId,
            role: 'chat',
            requestedModel: null,
            includeModel: true,
        });
        const preset = execution.preset;
        const compiledSystem = compileSystemPrompt(preset.system);
        const entitlements = await resolveAiEntitlements({
            organizationId: options.organizationId,
            userId: options.userId,
            feature: 'chat_agent',
        });
        assertAiQuotaAllowed(entitlements.quota);

        const tools: Record<string, any> = workRunTools({
            chartBuilder: createChartBuilderTool(locale),
            ...createDoryChatTools({
                userId: options.userId,
                organizationId: options.organizationId,
                currentConnectionId: work.connectionId,
                locale,
            }),
        });

        const protocol = createWorkAgentProtocolState();
        const wrappedTools = wrapToolsWithRunEvents({
            tools,
            workId: work.id,
            runId: run.id,
            protocol,
            appendEvent,
        });
        const agentContext = await buildDoryAgentContext({
            baseSystem: compiledSystem ?? '',
            userLanguageInstruction: buildUserLanguageInstruction(work.goal, locale),
            userId: options.userId,
            organizationId: options.organizationId,
            connectionId: work.connectionId,
            database: null,
            activeSchema: null,
            table: null,
            tableSchema: null,
            connectionType: null,
            sqlToolEnabled: true,
            candidateTables: null,
            copilotEnvelope: null,
            locale,
        });
        const agentInstructions = [agentContext.instructions, buildWorkRunInstruction(work.id)].filter(Boolean).join('\n\n');
        const model = resolveDoryAgentModel({
            execution,
            req: options.req as any,
        });
        const gatewayHeaders = buildCloudflareAiGatewayHeaders(
            {
                organizationId: options.organizationId,
                userId: options.userId,
                userEmail: entitlements.userEmail,
                plan: entitlements.plan,
                feature: 'chat_agent',
            },
            execution.gateway,
        );
        const headers = mergeHeaders(undefined, gatewayHeaders);
        const uiMessages: UIMessage[] = [
            {
                id: `work-run-${run.id}`,
                role: 'user',
                parts: [{ type: 'text', text: work.goal }],
            } as UIMessage,
        ];

        const agent = buildDoryChatAgent({
            model,
            tools: wrappedTools,
            instructions: agentInstructions,
            temperature: preset.temperature,
            maxSteps: 12,
            headers,
            context: {
                organizationId: options.organizationId,
                userId: options.userId,
                userEmail: entitlements.userEmail,
                plan: entitlements.plan,
                feature: 'chat_agent',
                model: execution.modelName,
                requestId,
                connectionId: work.connectionId,
                gateway: execution.gateway,
                provider: execution.providerKey,
            },
            requestId,
            startedAt,
            debugInput: {
                system: agentInstructions,
                messages: uiMessages as any,
                prompt: null,
            },
        });

        return await createAgentUIStreamResponse({
            agent,
            uiMessages: uiMessages as any,
            originalMessages: uiMessages as any,
            generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
            headers: {
                'x-work-run-id': run.id,
            },
            onFinish: async event => {
                if (event.isAborted) {
                    await appendEvent({
                        type: 'error',
                        role: 'system',
                        content: 'Agent run aborted',
                        payload: { finishReason: event.finishReason ?? null },
                    });
                    await options.db.works.failRun({
                        organizationId: options.organizationId,
                        workId: work.id,
                        id: run.id,
                        error: 'Agent run aborted.',
                    });
                    return;
                }

                const text = extractResponseText((event as any).responseMessage) ?? ((event as any).text ? String((event as any).text) : null);
                if (text) {
                    await appendEvent({
                        type: 'message',
                        role: 'agent',
                        content: String(text),
                        payload: sanitizePayload({
                            finishReason: event.finishReason ?? null,
                        }),
                    });
                }

                const completionDecision = checkWorkAgentProtocolComplete(protocol);
                if (!completionDecision.allowed) {
                    await appendEvent({
                        type: 'error',
                        role: 'system',
                        content: completionDecision.message,
                        payload: sanitizePayload({
                            finishReason: event.finishReason ?? null,
                            protocol,
                        }),
                    });
                    await options.db.works.failRun({
                        organizationId: options.organizationId,
                        workId: work.id,
                        id: run.id,
                        error: completionDecision.message,
                    });
                    return;
                }

                await appendEvent({
                    type: 'completed',
                    role: 'system',
                    content: 'Agent run completed',
                    payload: {
                        finishReason: event.finishReason ?? null,
                    },
                });
                await options.db.works.completeRun({
                    organizationId: options.organizationId,
                    workId: work.id,
                    id: run.id,
                });
            },
            onError: error => {
                const message = error instanceof Error ? error.message : String(error ?? 'AI_SERVICE_UNAVAILABLE');
                void appendEvent({
                    type: 'error',
                    role: 'system',
                    content: message,
                    payload: sanitizePayload({ error }),
                }).then(() =>
                    options.db.works.failRun({
                        organizationId: options.organizationId,
                        workId: work.id,
                        id: run.id,
                        error: message,
                    }),
                );

                void recordAiUsage({
                    requestId,
                    context: {
                        organizationId: options.organizationId,
                        userId: options.userId,
                        feature: 'chat_agent',
                        model: execution.modelName,
                        requestId,
                        connectionId: work.connectionId,
                        gateway: execution.gateway,
                        provider: execution.providerKey,
                    },
                    input: {
                        system: agentContext.instructions,
                        messages: uiMessages as any,
                        prompt: null,
                    },
                    latencyMs: Date.now() - startedAt,
                    status: 'error',
                    error,
                });

                return message;
            },
        });
    } catch (error) {
        if (isAiQuotaExceededError(error)) {
            await options.db.works.failRun({
                organizationId: options.organizationId,
                workId: work.id,
                id: run.id,
                error: error.message,
            });
            await appendEvent({
                type: 'error',
                role: 'system',
                content: error.message,
                payload: sanitizePayload({ error }),
            });
            return toAiQuotaExceededResponse(error);
        }

        const message = isLocalMissingAiEnvError(error) ? 'MISSING_AI_ENV' : error instanceof Error ? error.message : 'Internal error';
        await options.db.works.failRun({
            organizationId: options.organizationId,
            workId: work.id,
            id: run.id,
            error: message,
        });
        await appendEvent({
            type: 'error',
            role: 'system',
            content: message,
            payload: sanitizePayload({ error }),
        });

        return new Response(message, {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}
