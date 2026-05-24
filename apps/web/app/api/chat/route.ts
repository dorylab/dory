import 'server-only';
import { NextRequest } from 'next/server';
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, readUIMessageStream, type ModelMessage, type UIMessage, type UIMessageChunk } from 'ai';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { buildAiRouteForwardRequest, isLocalMissingAiEnvError, resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';

import { getSessionFromRequest } from '@/lib/auth/session';
import { getDBService } from '@dory/database';
import { buildSchemaContext, buildSchemaContextForTables, getDefaultSchemaSampleLimits } from '@/lib/ai/prompts';
import { fetchCloudUiMessageStream, type CloudStreamRequest } from '@/lib/ai/cloud-client';
import { buildCloudToolDeclarations } from '@/lib/ai/cloud-tools';
import { createSqlRunnerTool, isManualExecutionRequiredSqlResult } from './sql-runner';
import { createChartBuilderTool } from './chart-builder';
import { buildDialectSqlPrompt, MAX_HISTORY_MESSAGES, SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { buildUserLanguageInstruction, extractMessageText, normalizeMessage } from './utils';
import { newEntityId } from '@dory/shared/id';
import type { CopilotEnvelopeV1 } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/types/copilot-envelope';
import { toPromptContext } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/copilot-envelope';
import { getApiLocale } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '../utils/with-organization-handler';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import type { ConnectionType } from '@dory/shared/types/connections';

export const runtime = 'nodejs';

type ChatSchemaTableRef = {
    database?: string | null;
    schema?: string | null;
    name: string;
};

function normalizeSchemaTableRef(value: unknown): ChatSchemaTableRef | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return null;

    const database = typeof record.database === 'string' && record.database.trim() ? record.database.trim() : null;
    const schema = typeof record.schema === 'string' && record.schema.trim() ? record.schema.trim() : null;

    return { database, schema, name };
}

function collectSchemaContextTables(candidateTables?: ChatSchemaTableRef[] | null, copilotEnvelope?: CopilotEnvelopeV1 | null): ChatSchemaTableRef[] {
    const seen = new Set<string>();
    const tables: ChatSchemaTableRef[] = [];

    const addTable = (value: unknown) => {
        const table = normalizeSchemaTableRef(value);
        if (!table) return;

        const key = `${table.database ?? ''}:${table.schema ?? ''}:${table.name}`;
        if (seen.has(key)) return;

        seen.add(key);
        tables.push(table);
    };

    if (Array.isArray(candidateTables)) {
        for (const table of candidateTables) {
            addTable(table);
        }
    }

    if (copilotEnvelope?.surface === 'sql') {
        const inferredTables = copilotEnvelope.context.draft.inferred.tables;
        for (const table of inferredTables) {
            addTable({
                database: table.database ?? copilotEnvelope.context.draft.inferred.database ?? copilotEnvelope.context.baseline.database ?? null,
                schema: table.schema ?? copilotEnvelope.context.draft.inferred.schema ?? null,
                name: table.name,
            });
        }
    }

    return tables.slice(0, 12);
}

export const POST = withUserAndOrganizationHandler(async ({ req }) => {
    try {
        return await handleChatRequest(req);
    } catch (error) {
        if (isLocalMissingAiEnvError(error)) {
            return new Response('MISSING_AI_ENV', {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        console.error('[api/chat] error:', error);
        const message = error instanceof Error ? error.message : 'Internal error';
        return new Response(message, {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
});

async function handleChatRequest(req: NextRequest) {
    const locale = await getApiLocale();
    const {
        id: requestMessageId,
        messages: rawMessages,
        database,
        activeSchema,
        table,
        tableSchema,
        connectionId: connectionIdFromBody,
        connectionType,
        chatId: chatIdFromBody,
        tabId,
        model: requestedModel,
        webSearch,
        copilotEnvelope,
        candidateTables,
    }: {
        id: string;
        messages: UIMessage[];
        database?: string | null;
        activeSchema?: string | null;
        table?: string | null;
        tableSchema?: string | null;
        connectionId?: string | null;
        connectionType?: ConnectionType | null;
        chatId?: string | null;
        tabId?: string | null;
        model?: string | null;
        webSearch?: boolean;
        copilotEnvelope?: CopilotEnvelopeV1 | null;
        candidateTables?: ChatSchemaTableRef[] | null;
    } = await req.json();

    /* ------------------------------------------------------------------ */
    /* 1) normalize + history                                             */
    /* ------------------------------------------------------------------ */

    const uiMessages: UIMessage[] = Array.isArray(rawMessages) ? rawMessages.map(normalizeMessage) : [];
    const modelHistoryMessages = uiMessages.filter(message => (message as any)?.role !== 'tool');
    const historyMessagesForModel = modelHistoryMessages.length > MAX_HISTORY_MESSAGES ? modelHistoryMessages.slice(-MAX_HISTORY_MESSAGES) : modelHistoryMessages;
    const currentUserMessage = uiMessages.find(m => (m as any)?.id === requestMessageId && m.role === 'user') ?? [...uiMessages].reverse().find(m => m.role === 'user');
    const currentUserText = extractMessageText(currentUserMessage);

    /* ------------------------------------------------------------------ */
    /* 2) auth / context                                                   */
    /* ------------------------------------------------------------------ */

    const session = await getSessionFromRequest(req);
    const userId = session?.user?.id ?? null;
    const organizationId = resolveCurrentOrganizationId(session);
    const connectionId = connectionIdFromBody ?? req.headers.get('x-connection-id') ?? null;

    const db = userId ? await getDBService() : null;
    const execution = await resolveAiRouteExecution({
        req,
        db,
        organizationId,
        role: 'chat',
        requestedModel,
        includeModel: false,
    });
    const preset = execution.preset;
    const compiledSystem = compileSystemPrompt(preset.system);

    console.info('[chat] model resolution', {
        requestedModel: requestedModel ?? null,
        effectiveRequestedModel: execution.requestedModel,
        source: execution.source,
        providerKey: execution.providerKey,
        presetModel: preset.model,
        providerModelName: execution.modelName,
        transport: execution.transport,
    });

    let chatId: string | null = chatIdFromBody ?? null;
    let sessionTitle: string | null = null;

    const sessionMetadata =
        userId && (chatId || tabId)
            ? {
                  requestedModel: requestedModel ?? null,
                  providerModel: execution.modelName,
                  webSearch: Boolean(webSearch),
                  database: database ?? null,
                  activeSchema: activeSchema ?? null,
                  table: table ?? null,
                  connectionId: connectionId ?? null,
                  tabId: tabId ?? null,
                  copilotContext: copilotEnvelope ? toPromptContext(copilotEnvelope) : null,
              }
            : null;

    /* ------------------------------------------------------------------ */
    /* 3) create / get chat session                                        */
    /* ------------------------------------------------------------------ */

    if (db && userId && organizationId) {
        if (tabId) {
            const s = await db.chat.createOrGetCopilotSession({
                organizationId,
                userId,
                tabId,
                connectionId: connectionId ?? null,
                activeDatabase: database ?? null,
                activeSchema: activeSchema ?? null,
                title: null,
                settings: requestedModel ? { model: requestedModel } : null,
                metadata: sessionMetadata ?? null,
            });
            chatId = s.id;
            sessionTitle = s.title ?? null;
        } else {
            if (chatId) {
                const existed = await db.chat.readSession({
                    organizationId,
                    sessionId: chatId,
                    userId,
                });
                if (existed) {
                    await db.chat.updateSession({
                        organizationId,
                        sessionId: chatId,
                        userId,
                        patch: {
                            connectionId: connectionId ?? null,
                            activeDatabase: database ?? null,
                            activeSchema: activeSchema ?? null,
                            metadata: sessionMetadata ?? null,
                        },
                    });
                    sessionTitle = existed.title ?? null;
                } else {
                    const s = await db.chat.createGlobalSession({
                        id: chatId,
                        organizationId,
                        userId,
                        connectionId: connectionId ?? null,
                        activeDatabase: database ?? null,
                        activeSchema: activeSchema ?? null,
                        title: null,
                        settings: requestedModel ? { model: requestedModel } : null,
                        metadata: sessionMetadata ?? null,
                    });
                    chatId = s.id;
                    sessionTitle = s.title ?? null;
                }
            } else {
                const s = await db.chat.createGlobalSession({
                    organizationId,
                    userId,
                    connectionId: connectionId ?? null,
                    activeDatabase: database ?? null,
                    activeSchema: activeSchema ?? null,
                    title: null,
                    settings: requestedModel ? { model: requestedModel } : null,
                    metadata: sessionMetadata ?? null,
                });
                chatId = s.id;
                sessionTitle = s.title ?? null;
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* 4) tools + schema                                                   */
    /* ------------------------------------------------------------------ */

    const tools: Record<string, any> = {
        chartBuilder: createChartBuilderTool(locale),
    };

    let sqlToolEnabled = false;
    let schemaContext: string | null = null;

    if (db && userId && organizationId && connectionId) {
        const defaults = getDefaultSchemaSampleLimits();
        const schemaContextTables = collectSchemaContextTables(candidateTables, copilotEnvelope);

        schemaContext = schemaContextTables.length
            ? await buildSchemaContextForTables({
                  userId,
                  organizationId,
                  datasourceId: connectionId,
                  database,
                  schema: activeSchema,
                  tables: schemaContextTables,
                  columnSampleLimit: defaults.column,
              })
            : null;

        schemaContext ??= await buildSchemaContext({
            userId,
            organizationId,
            datasourceId: connectionId,
            database,
            schema: activeSchema,
            table,
            tableSampleLimit: defaults.table,
            columnSampleLimit: defaults.column,
        });

        tools.sqlRunner = createSqlRunnerTool({
            userId,
            organizationId,
            chatId: chatId ?? '',
            messageId: requestMessageId ?? undefined,
            datasourceId: connectionId,
            defaultDatabase: database,
            locale,
        });

        sqlToolEnabled = true;
    }

    /* ------------------------------------------------------------------ */
    /* 5) system prompt                                                    */
    /* ------------------------------------------------------------------ */

    const schemaSection = schemaContext
        ? `Schema Context\n${schemaContext}`
        : typeof tableSchema === 'string' && tableSchema.trim()
          ? `Database Context\n${tableSchema.trim()}`
          : '';

    const copilotContextSection = copilotEnvelope ? `Copilot Context\n${JSON.stringify(toPromptContext(copilotEnvelope), null, 2)}` : '';

    const sqlToolSection = sqlToolEnabled ? buildDialectSqlPrompt(connectionType ?? null) : '';

    const userLanguageSection = buildUserLanguageInstruction(currentUserText, locale);

    const systemPrompt = [compiledSystem, userLanguageSection, SYSTEM_PROMPT, sqlToolSection, copilotContextSection, schemaSection].filter(Boolean).join('\n\n');

    const modelMessages = await convertToModelMessages(historyMessagesForModel, { tools });

    const currentUserMessageId = typeof (currentUserMessage as any)?.id === 'string' && (currentUserMessage as any).id ? (currentUserMessage as any).id : requestMessageId || null;

    const existedMessageIds = new Set<string>();

    for (const m of uiMessages) {
        const id = typeof (m as any)?.id === 'string' && (m as any).id ? (m as any).id : null;
        if (!id) continue;

        if (currentUserMessageId && m.role === 'user' && id === currentUserMessageId) {
            continue;
        }

        existedMessageIds.add(id);
    }

    if (db && userId && organizationId && chatId && currentUserMessage && currentUserMessageId) {
        try {
            await db.chat.appendMessage({
                organizationId,
                sessionId: chatId,
                userId,
                message: {
                    id: currentUserMessageId,
                    organizationId,
                    sessionId: chatId,
                    userId,
                    connectionId: connectionId ?? null,
                    role: 'user',
                    parts: ((currentUserMessage as any).parts ?? []) as any,
                    metadata: (currentUserMessage as any).metadata ?? null,
                    createdAt: new Date(),
                },
            });

            existedMessageIds.add(currentUserMessageId);
        } catch (err) {
            console.error('[chat] persist user message failed', err);
        }
    }

    const streamForwarding = buildAiRouteForwardRequest(execution, req, '/api/ai/stream');
    const streamLogLabel = streamForwarding.transport === 'cloud' ? 'cloud' : 'local';
    const cloudTools = buildCloudToolDeclarations({
        includeSqlRunner: sqlToolEnabled,
        sqlRunnerDescription: tools.sqlRunner?.description,
        chartBuilderDescription: tools.chartBuilder?.description,
    });

    const maxSteps = 6;
    const baseCloudPayload: Omit<CloudStreamRequest, 'messages'> = {
        system: systemPrompt,
        tools: cloudTools,
        toolChoice: 'auto',
        temperature: preset.temperature,
        maxSteps: maxSteps,
        model: streamForwarding.forwardedModel,
    };
    const forwardedModel = baseCloudPayload.model ?? null;

    let initialCloudResponse: Awaited<ReturnType<typeof fetchCloudUiMessageStream>> | null = null;

    try {
        console.info(`[chat] ${streamLogLabel} request start`, {
            url: streamForwarding.url,
            model: forwardedModel,
            messageCount: modelMessages.length,
        });
        initialCloudResponse = await fetchCloudUiMessageStream({
            url: streamForwarding.url,
            payload: {
                ...baseCloudPayload,
                messages: modelMessages,
            },
            headers: streamForwarding.headers,
        });
        console.info(`[chat] ${streamLogLabel} response received`, {
            url: streamForwarding.url,
            status: initialCloudResponse.response.status,
            ok: initialCloudResponse.response.ok,
        });
    } catch (error) {
        console.error(`[chat] ${streamLogLabel} stream unavailable`, {
            url: streamForwarding.url,
            error,
        });
        return new Response('AI_SERVICE_UNAVAILABLE', {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    if (!initialCloudResponse.response.ok) {
        const status = initialCloudResponse.response.status || 502;
        if (status === 429) {
            return new Response('AI_QUOTA_EXCEEDED', {
                status: 429,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }
        return new Response('AI_SERVICE_UNAVAILABLE', {
            status,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    const stream = createUIMessageStream<UIMessage>({
        originalMessages: uiMessages,
        execute: async ({ writer }) => {
            let step = 0;
            let nextResponse = initialCloudResponse;
            let nextMessages = [...modelMessages];
            const executedToolCallIds = new Set<string>();

            while (step < maxSteps && nextResponse) {
                const { response, stream: cloudStream } = nextResponse;

                if (!response.ok) {
                    writer.write({
                        type: 'error',
                        errorText: 'AI_SERVICE_UNAVAILABLE',
                    } as UIMessageChunk);
                    return;
                }

                const [streamForClient, streamForProcessing] = cloudStream.tee();
                const [streamForMessages, streamForTools] = streamForProcessing.tee();

                writer.merge(streamForClient);

                const [assistantMessage, toolCalls] = await Promise.all([readFinalAssistantMessage(streamForMessages), collectToolCalls(streamForTools)]);

                const sqlFallback = !toolCalls.length && sqlToolEnabled && tools.sqlRunner?.execute ? extractReadOnlySqlFromAssistantMessage(assistantMessage) : null;

                if (assistantMessage && db && userId && organizationId && chatId && !sqlFallback) {
                    const messageId = typeof (assistantMessage as any)?.id === 'string' && (assistantMessage as any).id ? (assistantMessage as any).id : newEntityId();

                    if (!existedMessageIds.has(messageId)) {
                        try {
                            await db.chat.appendMessage({
                                organizationId,
                                sessionId: chatId,
                                userId,
                                message: {
                                    id: messageId,
                                    organizationId,
                                    sessionId: chatId,
                                    userId: null,
                                    connectionId: connectionId ?? null,
                                    role: assistantMessage.role as any,
                                    parts: ((assistantMessage as any).parts ?? []) as any,
                                    metadata: (assistantMessage as any).metadata ?? null,
                                    createdAt: new Date(),
                                },
                            });

                            existedMessageIds.add(messageId);
                        } catch (err) {
                            console.error('[chat] persist assistant messages failed', err);
                        }
                    }
                }

                if (!toolCalls.length && sqlToolEnabled && tools.sqlRunner?.execute) {
                    if (sqlFallback) {
                        const syntheticToolCall: CollectedToolCall = {
                            toolCallId: newEntityId(),
                            toolName: 'sqlRunner',
                            input: {
                                sql: sqlFallback,
                                database: database ?? undefined,
                            },
                        };

                        writer.write({
                            type: 'tool-input-available',
                            toolCallId: syntheticToolCall.toolCallId,
                            toolName: syntheticToolCall.toolName,
                            input: syntheticToolCall.input,
                        } as UIMessageChunk);

                        let toolOutput: unknown = null;
                        let toolErrorText: string | null = null;

                        try {
                            toolOutput = await tools.sqlRunner.execute(syntheticToolCall.input);
                        } catch (err) {
                            toolErrorText = err instanceof Error ? err.message : String(err);
                        }

                        if (toolErrorText) {
                            writer.write({
                                type: 'tool-output-error',
                                toolCallId: syntheticToolCall.toolCallId,
                                errorText: toolErrorText,
                            } as UIMessageChunk);
                        } else {
                            writer.write({
                                type: 'tool-output-available',
                                toolCallId: syntheticToolCall.toolCallId,
                                output: toolOutput,
                            } as UIMessageChunk);
                        }

                        const toolResultMessage = toolErrorText
                            ? ({
                                  role: 'tool',
                                  content: [
                                      {
                                          type: 'tool-result',
                                          toolCallId: syntheticToolCall.toolCallId,
                                          toolName: syntheticToolCall.toolName,
                                          output: {
                                              type: 'error-text',
                                              value: toolErrorText,
                                          },
                                      },
                                  ],
                              } as ModelMessage)
                            : buildToolResultModelMessage(syntheticToolCall, toolOutput);

                        nextMessages = [...nextMessages, buildToolCallModelMessage(syntheticToolCall), toolResultMessage];
                        step += 1;

                        if (db && userId && organizationId && chatId) {
                            const toolMessageId = newEntityId();
                            try {
                                const ok =
                                    toolOutput && typeof toolOutput === 'object' && 'ok' in (toolOutput as Record<string, unknown>)
                                        ? Boolean((toolOutput as Record<string, unknown>).ok)
                                        : toolErrorText === null;

                                await db.chat.appendMessage({
                                    organizationId,
                                    sessionId: chatId,
                                    userId,
                                    message: {
                                        id: toolMessageId,
                                        organizationId,
                                        sessionId: chatId,
                                        userId: null,
                                        connectionId: connectionId ?? null,
                                        role: 'tool',
                                        parts: [
                                            {
                                                type: 'tool_result',
                                                callId: syntheticToolCall.toolCallId,
                                                ok,
                                                result: toolErrorText === null ? toolOutput : undefined,
                                                error: toolErrorText ?? undefined,
                                            },
                                        ] as any,
                                        metadata: null,
                                        createdAt: new Date(),
                                    },
                                });

                                existedMessageIds.add(toolMessageId);
                            } catch (err) {
                                console.error('[chat] persist synthetic tool result failed', err);
                            }
                        }

                        if (toolOutput && isManualExecutionRequiredSqlResult(toolOutput)) {
                            return;
                        }

                        try {
                            nextResponse = await fetchCloudUiMessageStream({
                                url: streamForwarding.url,
                                payload: {
                                    ...baseCloudPayload,
                                    messages: nextMessages,
                                },
                                headers: streamForwarding.headers,
                            });
                        } catch (error) {
                            console.error(`[chat] ${streamLogLabel} stream unavailable`, error);
                            writer.write({
                                type: 'error',
                                errorText: 'AI_SERVICE_UNAVAILABLE',
                            } as UIMessageChunk);
                            return;
                        }

                        continue;
                    }
                }

                if (!toolCalls.length) {
                    return;
                }

                const toolResultMessages: ModelMessage[] = [];
                let shouldStopAfterToolResults = false;

                for (const toolCall of toolCalls) {
                    if (executedToolCallIds.has(toolCall.toolCallId)) {
                        continue;
                    }

                    executedToolCallIds.add(toolCall.toolCallId);
                    const executableToolCall = withChartBuilderFallbackData(toolCall, [...nextMessages, ...toolResultMessages]);
                    toolResultMessages.push(buildToolCallModelMessage(executableToolCall));

                    if (!tools[executableToolCall.toolName]?.execute) {
                        const errorText = `Tool not available: ${executableToolCall.toolName}`;
                        writer.write({
                            type: 'tool-output-error',
                            toolCallId: executableToolCall.toolCallId,
                            errorText,
                        } as UIMessageChunk);

                        toolResultMessages.push({
                            role: 'tool',
                            content: [
                                {
                                    type: 'tool-result',
                                    toolCallId: executableToolCall.toolCallId,
                                    toolName: executableToolCall.toolName,
                                    output: {
                                        type: 'error-text',
                                        value: errorText,
                                    },
                                },
                            ],
                        } as ModelMessage);
                        continue;
                    }

                    let toolOutput: unknown = null;
                    let toolErrorText: string | null = null;

                    try {
                        toolOutput = await tools[executableToolCall.toolName].execute(executableToolCall.input);
                    } catch (err) {
                        toolErrorText = err instanceof Error ? err.message : String(err);
                    }

                    if (toolErrorText) {
                        writer.write({
                            type: 'tool-output-error',
                            toolCallId: executableToolCall.toolCallId,
                            errorText: toolErrorText,
                        } as UIMessageChunk);

                        toolResultMessages.push({
                            role: 'tool',
                            content: [
                                {
                                    type: 'tool-result',
                                    toolCallId: executableToolCall.toolCallId,
                                    toolName: executableToolCall.toolName,
                                    output: {
                                        type: 'error-text',
                                        value: toolErrorText,
                                    },
                                },
                            ],
                        } as ModelMessage);
                    } else {
                        writer.write({
                            type: 'tool-output-available',
                            toolCallId: executableToolCall.toolCallId,
                            output: toolOutput,
                        } as UIMessageChunk);
                        toolResultMessages.push(buildToolResultModelMessage(executableToolCall, toolOutput));
                        if (isManualExecutionRequiredSqlResult(toolOutput)) {
                            shouldStopAfterToolResults = true;
                        }
                    }

                    if (db && userId && organizationId && chatId) {
                        const toolMessageId = newEntityId();
                        try {
                            const ok =
                                toolOutput && typeof toolOutput === 'object' && 'ok' in (toolOutput as Record<string, unknown>)
                                    ? Boolean((toolOutput as Record<string, unknown>).ok)
                                    : toolErrorText === null;

                            await db.chat.appendMessage({
                                organizationId,
                                sessionId: chatId,
                                userId,
                                message: {
                                    id: toolMessageId,
                                    organizationId,
                                    sessionId: chatId,
                                    userId: null,
                                    connectionId: connectionId ?? null,
                                    role: 'tool',
                                    parts: [
                                        {
                                            type: 'tool_result',
                                            callId: executableToolCall.toolCallId,
                                            ok,
                                            result: toolErrorText === null ? toolOutput : undefined,
                                            error: toolErrorText ?? undefined,
                                        },
                                    ] as any,
                                    metadata: null,
                                    createdAt: new Date(),
                                },
                            });

                            existedMessageIds.add(toolMessageId);
                        } catch (err) {
                            console.error('[chat] persist tool result failed', err);
                        }
                    }
                }

                nextMessages = [...nextMessages, ...toolResultMessages];
                step += 1;

                if (shouldStopAfterToolResults) {
                    return;
                }

                try {
                    nextResponse = await fetchCloudUiMessageStream({
                        url: streamForwarding.url,
                        payload: {
                            ...baseCloudPayload,
                            messages: nextMessages,
                        },
                        headers: streamForwarding.headers,
                    });
                } catch (error) {
                    console.error(`[chat] ${streamLogLabel} stream unavailable`, error);
                    writer.write({
                        type: 'error',
                        errorText: 'AI_SERVICE_UNAVAILABLE',
                    } as UIMessageChunk);
                    return;
                }
            }
        },
    });

    const response = createUIMessageStreamResponse({
        stream,
        headers: chatId ? { 'x-chat-id': chatId } : undefined,
    });

    return response;
}

type CollectedToolCall = {
    toolCallId: string;
    toolName: string;
    input: unknown;
};

async function collectToolCalls(stream: ReadableStream<UIMessageChunk>): Promise<CollectedToolCall[]> {
    const reader = stream.getReader();
    const toolCalls: CollectedToolCall[] = [];

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (value.type === 'tool-input-available' && !value.providerExecuted && typeof value.toolName === 'string') {
            toolCalls.push({
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                input: value.input,
            });
        }
    }

    return toolCalls;
}

async function readFinalAssistantMessage(stream: ReadableStream<UIMessageChunk>): Promise<UIMessage | null> {
    let lastMessage: UIMessage | null = null;
    const iterable = readUIMessageStream<UIMessage>({ stream });
    for await (const message of iterable) {
        lastMessage = message;
    }
    if (lastMessage?.role !== 'assistant') return null;
    return lastMessage;
}

function buildToolCallModelMessage(toolCall: CollectedToolCall): ModelMessage {
    return {
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
            },
        ],
    } as ModelMessage;
}

function buildToolResultModelMessage(toolCall: CollectedToolCall, output: unknown): ModelMessage {
    return {
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                output: {
                    type: 'json',
                    value: output,
                },
            },
        ],
    } as ModelMessage;
}

function withChartBuilderFallbackData(toolCall: CollectedToolCall, messages: ModelMessage[]): CollectedToolCall {
    if (toolCall.toolName !== 'chartBuilder') {
        return toolCall;
    }

    const input = toolCall.input && typeof toolCall.input === 'object' ? (toolCall.input as Record<string, unknown>) : {};
    const hasData = Array.isArray(input.data) && input.data.length > 0;
    if (hasData) {
        return toolCall;
    }

    const fallbackRows = findLatestSqlPreviewRows(messages);
    if (!fallbackRows.length) {
        return toolCall;
    }

    return {
        ...toolCall,
        input: {
            ...input,
            data: fallbackRows,
        },
    };
}

function findLatestSqlPreviewRows(messages: ModelMessage[]): Array<Record<string, unknown>> {
    for (const message of [...messages].reverse()) {
        const content = (message as any)?.content;
        if (!Array.isArray(content)) continue;

        for (const part of [...content].reverse()) {
            const value = extractToolResultValue(part);
            if (!value || typeof value !== 'object') continue;

            const result = value as Record<string, unknown>;
            if (result.type !== 'sql-result' || result.ok !== true || !Array.isArray(result.previewRows)) {
                continue;
            }

            return result.previewRows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
        }
    }

    return [];
}

function extractToolResultValue(part: unknown): unknown {
    if (!part || typeof part !== 'object') return null;

    const record = part as Record<string, any>;
    const output = record.output;
    if (output && typeof output === 'object' && output.type === 'json') {
        return output.value;
    }

    return record.result ?? record.value ?? null;
}

function extractReadOnlySqlFromAssistantMessage(message: UIMessage | null): string | null {
    if (!message || message.role !== 'assistant' || !Array.isArray(message.parts)) {
        return null;
    }

    const text = message.parts
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text)
        .join('\n')
        .trim();

    if (!text) {
        return null;
    }

    const fencedMatch = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? text;

    if (!candidate) {
        return null;
    }

    const normalized = candidate.replace(/^\s*sql\s*/i, '').trim();

    if (!looksLikeStandaloneSql(normalized)) {
        return null;
    }

    return normalized;
}

function looksLikeStandaloneSql(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!/^(select|show|describe|desc|explain|with|pragma)\b/i.test(trimmed)) return false;

    const lines = trimmed
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
    if (lines.length > 12) return false;

    return !/[。！？]/.test(trimmed) && !/^[-*]\s/m.test(trimmed);
}
