import 'server-only';
import { NextRequest } from 'next/server';
import {
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    readUIMessageStream,
    type ModelMessage,
    type UIMessage,
    type UIMessageChunk,
} from 'ai';
import { getModelPresetOnly } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { isMissingAiEnvError } from '@/lib/ai/errors';

import { getSessionFromRequest } from '@/lib/auth/session';
import { getDBService } from '@/lib/database';
import { buildSchemaContext, getDefaultSchemaSampleLimits } from '@/lib/ai/prompts';
import { fetchCloudUiMessageStream, type CloudStreamRequest } from '@/lib/ai/cloud-client';
import { buildCloudToolDeclarations } from '@/lib/ai/cloud-tools';
import { createSqlRunnerTool, isManualExecutionRequiredSqlResult } from './sql-runner';
import { createChartBuilderTool } from './chart-builder';
import { MAX_HISTORY_MESSAGES, SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { normalizeMessage } from './utils';
import { newEntityId } from '@/lib/id';
import type { CopilotEnvelopeV1 } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/types/copilot-envelope';
import { toPromptContext } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/copilot-envelope';
import { getApiLocale } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '../utils/with-organization-handler';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { USE_CLOUD_AI } from '@/app/config/app';
import { buildCloudForwardHeaders } from '@/app/api/utils/cloud-ai-proxy';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ req }) => {
    try {
        return await handleChatRequest(req);
    } catch (error) {
        if (isMissingAiEnvError(error) && !USE_CLOUD_AI) {
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
        table,
        tableSchema,
        connectionId: connectionIdFromBody,
        chatId: chatIdFromBody,
        tabId,
        model: requestedModel,
        webSearch,
        copilotEnvelope,
    }: {
        id: string;
        messages: UIMessage[];
        database?: string | null;
        table?: string | null;
        tableSchema?: string | null;
        connectionId?: string | null;
        chatId?: string | null;
        tabId?: string | null;
        model?: string | null;
        webSearch?: boolean;
        copilotEnvelope?: CopilotEnvelopeV1 | null;
    } = await req.json();

    /* ------------------------------------------------------------------ */
    /* 1) normalize + history                                             */
    /* ------------------------------------------------------------------ */

    const uiMessages: UIMessage[] = Array.isArray(rawMessages)
        ? rawMessages.map(normalizeMessage)
        : [];

    const historyMessagesForModel =
        uiMessages.length > MAX_HISTORY_MESSAGES
            ? uiMessages.slice(-MAX_HISTORY_MESSAGES)
            : uiMessages;

    /* ------------------------------------------------------------------ */
    /* 2) auth / context                                                   */
    /* ------------------------------------------------------------------ */

    const session = await getSessionFromRequest(req);
    const userId = session?.user?.id ?? null;
    const organizationId = resolveCurrentOrganizationId(session);
    const connectionId =
        connectionIdFromBody ?? req.headers.get('x-connection-id') ?? null;

    const preset = getModelPresetOnly('chat');
    const providerModelName = requestedModel || preset.model;
    const compiledSystem = compileSystemPrompt(preset.system);
    console.info('[chat] model resolution', {
        requestedModel: requestedModel ?? null,
        presetModel: preset.model,
        providerModelName,
        envProvider: process.env.DORY_AI_PROVIDER ?? null,
        envModel: process.env.DORY_AI_MODEL ?? null,
        useCloud: USE_CLOUD_AI,
    });

    const db = userId ? await getDBService() : null;

    let chatId: string | null = chatIdFromBody ?? null;
    let sessionTitle: string | null = null;

    const sessionMetadata =
        userId && (chatId || tabId)
            ? {
                requestedModel: requestedModel ?? null,
                providerModel: providerModelName,
                webSearch: Boolean(webSearch),
                database: database ?? null,
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
                activeSchema: null,
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
                    sessionTitle = existed.title ?? null;
                } else {
                    const s = await db.chat.createGlobalSession({
                        id: chatId,
                        organizationId,
                        userId,
                        connectionId: connectionId ?? null,
                        activeDatabase: database ?? null,
                        activeSchema: null,
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
                    activeSchema: null,
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
        schemaContext = await buildSchemaContext({
            userId,
            organizationId,
            datasourceId: connectionId,
            database,
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

    const copilotContextSection =
        copilotEnvelope
            ? `Copilot Context\n${JSON.stringify(toPromptContext(copilotEnvelope), null, 2)}`
            : '';

    const systemPrompt = [
        compiledSystem,
        SYSTEM_PROMPT,
        copilotContextSection,
        schemaSection,
    ]
        .filter(Boolean)
        .join('\n\n');

    const modelMessages = await convertToModelMessages(
        historyMessagesForModel,
        { tools },
    );

    const currentUserMessage =
        uiMessages.find(
            m => (m as any)?.id === requestMessageId && m.role === 'user',
        ) ??
        [...uiMessages].reverse().find(m => m.role === 'user');

    const currentUserMessageId =
        typeof (currentUserMessage as any)?.id === 'string' &&
            (currentUserMessage as any).id
            ? (currentUserMessage as any).id
            : requestMessageId || null;

    const existedMessageIds = new Set<string>();

    for (const m of uiMessages) {
        const id =
            typeof (m as any)?.id === 'string' && (m as any).id
                ? (m as any).id
                : null;
        if (!id) continue;

        if (
            currentUserMessageId &&
            m.role === 'user' &&
            id === currentUserMessageId
        ) {
            continue; 
        }

        existedMessageIds.add(id);
    }

    if (
        db &&
        userId &&
        organizationId &&
        chatId &&
        currentUserMessage &&
        currentUserMessageId
    ) {
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

    const useCloud = USE_CLOUD_AI;
    const cloudBaseUrl = resolveCloudBaseUrl(req);
    const cloudUrl = new URL('/api/ai/stream', cloudBaseUrl).toString();
    const cloudHeaders = buildCloudForwardHeaders(req, cloudBaseUrl);
    const cloudTools = buildCloudToolDeclarations({
        includeSqlRunner: sqlToolEnabled,
        sqlRunnerDescription: tools.sqlRunner?.description,
        chartBuilderDescription: tools.chartBuilder?.description,
    });

    const maxSteps = 4;
    const baseCloudPayload: Omit<CloudStreamRequest, 'messages'> = {
        system: systemPrompt,
        tools: cloudTools,
        toolChoice: 'auto',
        temperature: preset.temperature,
        maxSteps: 1,
        // Desktop runtime proxies to cloud. In that path, do not forward
        // client-selected local model names (e.g. gpt-4o); let cloud env resolve.
        model: useCloud ? null : providerModelName,
    };
    const forwardedModel = baseCloudPayload.model ?? null;

    let initialCloudResponse: Awaited<
        ReturnType<typeof fetchCloudUiMessageStream>
    > | null = null;

    try {
        console.info(useCloud ? '[chat] cloud request start' : '[chat] local request start', {
            url: cloudUrl,
            model: forwardedModel,
            messageCount: modelMessages.length,
        });
        initialCloudResponse = await fetchCloudUiMessageStream({
            url: cloudUrl,
            payload: {
                ...baseCloudPayload,
                messages: modelMessages,
            },
            headers: cloudHeaders,
        });
        console.info(useCloud ? '[chat] cloud response received' : '[chat] local response received', {
            url: cloudUrl,
            status: initialCloudResponse.response.status,
            ok: initialCloudResponse.response.ok,
        });
    } catch (error) {
        console.error(useCloud ? '[chat] cloud stream unavailable' : '[chat] local stream unavailable', {
            url: cloudUrl,
            error,
        });
        return new Response('AI_SERVICE_UNAVAILABLE', {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    if (!initialCloudResponse.response.ok) {
        const status = initialCloudResponse.response.status || 502;
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

                const [streamForClient, streamForProcessing] =
                    cloudStream.tee();
                const [streamForMessages, streamForTools] =
                    streamForProcessing.tee();

                writer.merge(streamForClient);

                const [assistantMessage, toolCalls] = await Promise.all([
                    readFinalAssistantMessage(streamForMessages),
                    collectToolCalls(streamForTools),
                ]);

                if (assistantMessage && db && userId && organizationId && chatId) {
                    const messageId =
                        typeof (assistantMessage as any)?.id === 'string' &&
                        (assistantMessage as any).id
                            ? (assistantMessage as any).id
                            : newEntityId();

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
                                    metadata:
                                        (assistantMessage as any).metadata ?? null,
                                    createdAt: new Date(),
                                },
                            });

                            existedMessageIds.add(messageId);
                        } catch (err) {
                            console.error('[chat] persist assistant messages failed', err);
                        }
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
                    toolResultMessages.push(
                        buildToolCallModelMessage(toolCall),
                    );

                    if (!tools[toolCall.toolName]?.execute) {
                        const errorText = `Tool not available: ${toolCall.toolName}`;
                        writer.write({
                            type: 'tool-output-error',
                            toolCallId: toolCall.toolCallId,
                            errorText,
                        } as UIMessageChunk);

                        toolResultMessages.push({
                            role: 'tool',
                            content: [
                                {
                                    type: 'tool-result',
                                    toolCallId: toolCall.toolCallId,
                                    toolName: toolCall.toolName,
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
                        toolOutput = await tools[toolCall.toolName].execute(
                            toolCall.input,
                        );
                    } catch (err) {
                        toolErrorText =
                            err instanceof Error ? err.message : String(err);
                    }

                    if (toolErrorText) {
                        writer.write({
                            type: 'tool-output-error',
                            toolCallId: toolCall.toolCallId,
                            errorText: toolErrorText,
                        } as UIMessageChunk);

                        toolResultMessages.push({
                            role: 'tool',
                            content: [
                                {
                                    type: 'tool-result',
                                    toolCallId: toolCall.toolCallId,
                                    toolName: toolCall.toolName,
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
                            toolCallId: toolCall.toolCallId,
                            output: toolOutput,
                        } as UIMessageChunk);
                        toolResultMessages.push(
                            buildToolResultModelMessage(toolCall, toolOutput),
                        );
                        if (isManualExecutionRequiredSqlResult(toolOutput)) {
                            shouldStopAfterToolResults = true;
                        }
                    }

                    if (db && userId && organizationId && chatId) {
                        const toolMessageId = newEntityId();
                        try {
                            const ok =
                                toolOutput &&
                                typeof toolOutput === 'object' &&
                                'ok' in (toolOutput as Record<string, unknown>)
                                    ? Boolean(
                                          (toolOutput as Record<string, unknown>)
                                              .ok,
                                      )
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
                                            callId: toolCall.toolCallId,
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
                        url: cloudUrl,
                        payload: {
                            ...baseCloudPayload,
                            messages: nextMessages,
                        },
                        headers: cloudHeaders,
                    });
                } catch (error) {
                    console.error('[chat] cloud stream unavailable', error);
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

async function collectToolCalls(
    stream: ReadableStream<UIMessageChunk>,
): Promise<CollectedToolCall[]> {
    const reader = stream.getReader();
    const toolCalls: CollectedToolCall[] = [];

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (
            value.type === 'tool-input-available' &&
            !value.providerExecuted &&
            typeof value.toolName === 'string'
        ) {
            toolCalls.push({
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                input: value.input,
            });
        }
    }

    return toolCalls;
}

async function readFinalAssistantMessage(
    stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessage | null> {
    let lastMessage: UIMessage | null = null;
    const iterable = readUIMessageStream<UIMessage>({ stream });
    for await (const message of iterable) {
        lastMessage = message;
    }
    if (lastMessage?.role !== 'assistant') return null;
    return lastMessage;
}

function buildToolCallModelMessage(
    toolCall: CollectedToolCall,
): ModelMessage {
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

function buildToolResultModelMessage(
    toolCall: CollectedToolCall,
    output: unknown,
): ModelMessage {
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

function resolveCloudBaseUrl(req: NextRequest): string {
    if (!USE_CLOUD_AI) {
        try {
            return new URL(req.url).origin;
        } catch {
            return 'http://localhost:3000';
        }
    }
    const cloudUrl = getCloudApiBaseUrl();
    if (cloudUrl) return cloudUrl;
    try {
        return new URL(req.url).origin;
    } catch {
        return 'http://localhost:3000';
    }
}
