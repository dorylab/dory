import 'server-only';

import { createAgentUIStreamResponse, createIdGenerator, type UIMessage } from 'ai';

import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { resolveAiRouteExecution, isLocalMissingAiEnvError } from '@/lib/ai/execution/route-dispatch';
import { buildDoryAgentContext, type DoryAgentSchemaTableRef } from '@/lib/ai/agents/context';
import { resolveDoryAgentModel } from '@/lib/ai/agents/model';
import { buildDoryChatAgent } from '@/lib/ai/agents/chat-agent';
import { buildCloudflareAiGatewayHeaders, assertAiQuotaAllowed, isAiQuotaExceededError, resolveAiEntitlements, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';
import { createAiRequestId, recordAiUsage } from '@/lib/ai/gateway';
import { createSqlRunnerTool } from './tools/sql-runner';
import { createChartBuilderTool } from './tools/chart-builder';
import { createDoryChatTools } from './tools/dory-tools';
import { buildUserLanguageInstruction, extractMessageText, normalizeMessage } from './utils';
import { getSessionFromRequest } from '@/lib/auth/session';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getDBService } from '@dory/database';
import { newEntityId } from '@dory/shared/id';
import { MAX_HISTORY_MESSAGES } from '@/lib/ai/prompts';
import { getApiLocale } from '@/app/api/utils/i18n';
import { withUserAndOrganizationHandler } from '../utils/with-organization-handler';
import type { CopilotEnvelopeV1 } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/types/copilot-envelope';
import { toPromptContext } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/copilot-envelope';
import type { ConnectionType } from '@dory/shared/types/connections';

export const runtime = 'nodejs';

type ChatRequestBody = {
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
    candidateTables?: DoryAgentSchemaTableRef[] | null;
};

function mergeHeaders(headers: Record<string, string | undefined> | undefined, extraHeaders: Record<string, string> | null): Record<string, string | undefined> | undefined {
    if (!extraHeaders) return headers;
    return {
        ...(headers ?? {}),
        ...extraHeaders,
    };
}

export const POST = withUserAndOrganizationHandler(async ({ req }) => {
    try {
        return await handleChatRequest(req);
    } catch (error) {
        if (isAiQuotaExceededError(error)) {
            return toAiQuotaExceededResponse(error);
        }

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

async function handleChatRequest(req: Request) {
    const startedAt = Date.now();
    const requestId = createAiRequestId();
    const locale = await getApiLocale();
    const body = (await req.json()) as ChatRequestBody;
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
    } = body;

    const uiMessages: UIMessage[] = Array.isArray(rawMessages) ? rawMessages.map(normalizeMessage) : [];
    const modelHistoryMessages = uiMessages.filter(message => (message as any)?.role !== 'tool');
    const historyMessagesForAgent = modelHistoryMessages.length > MAX_HISTORY_MESSAGES ? modelHistoryMessages.slice(-MAX_HISTORY_MESSAGES) : modelHistoryMessages;
    const currentUserMessage =
        uiMessages.find(message => (message as any)?.id === requestMessageId && message.role === 'user') ?? [...uiMessages].reverse().find(message => message.role === 'user');
    const currentUserText = extractMessageText(currentUserMessage);

    const session = await getSessionFromRequest(req as any);
    const userId = session?.user?.id ?? null;
    const organizationId = resolveCurrentOrganizationId(session);
    const connectionId = connectionIdFromBody ?? req.headers.get('x-connection-id') ?? null;
    const db = userId ? await getDBService() : null;

    const execution = await resolveAiRouteExecution({
        req: req as any,
        db,
        organizationId,
        role: 'chat',
        requestedModel,
        includeModel: true,
    });
    const preset = execution.preset;
    const compiledSystem = compileSystemPrompt(preset.system);

    console.info('[chat] agent model resolution', {
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

    if (db && userId && organizationId) {
        if (tabId) {
            const sessionRecord = await db.chat.createOrGetCopilotSession({
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
            chatId = sessionRecord.id;
            sessionTitle = sessionRecord.title ?? null;
        } else if (chatId) {
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
                const sessionRecord = await db.chat.createGlobalSession({
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
                chatId = sessionRecord.id;
                sessionTitle = sessionRecord.title ?? null;
            }
        } else {
            const sessionRecord = await db.chat.createGlobalSession({
                organizationId,
                userId,
                connectionId: connectionId ?? null,
                activeDatabase: database ?? null,
                activeSchema: activeSchema ?? null,
                title: null,
                settings: requestedModel ? { model: requestedModel } : null,
                metadata: sessionMetadata ?? null,
            });
            chatId = sessionRecord.id;
            sessionTitle = sessionRecord.title ?? null;
        }
    }

    const tools: Record<string, any> = {
        chartBuilder: createChartBuilderTool(locale),
    };
    if (userId && organizationId) {
        Object.assign(
            tools,
            createDoryChatTools({
                userId,
                organizationId,
                currentConnectionId: connectionId,
                locale,
            }),
        );
    }
    const sqlToolEnabled = Boolean(db && userId && organizationId && connectionId);

    if (sqlToolEnabled) {
        tools.sqlRunner = createSqlRunnerTool({
            userId: userId!,
            organizationId: organizationId!,
            chatId: chatId ?? '',
            messageId: requestMessageId ?? undefined,
            datasourceId: connectionId!,
            defaultDatabase: database,
            locale,
        });
    }

    const agentContext = await buildDoryAgentContext({
        baseSystem: compiledSystem ?? '',
        userLanguageInstruction: buildUserLanguageInstruction(currentUserText, locale),
        userId,
        organizationId,
        connectionId,
        database,
        activeSchema,
        table,
        tableSchema,
        connectionType,
        sqlToolEnabled,
        candidateTables,
        copilotEnvelope,
        locale,
    });

    const currentUserMessageId = typeof (currentUserMessage as any)?.id === 'string' && (currentUserMessage as any).id ? (currentUserMessage as any).id : requestMessageId || null;
    const existedMessageIds = new Set<string>();

    for (const message of uiMessages) {
        const id = typeof (message as any)?.id === 'string' && (message as any).id ? (message as any).id : null;
        if (!id) continue;
        if (currentUserMessageId && message.role === 'user' && id === currentUserMessageId) continue;
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
        } catch (error) {
            console.error('[chat] persist user message failed', error);
        }
    }

    const entitlements = await resolveAiEntitlements({
        organizationId,
        userId,
        feature: 'chat_agent',
    });
    assertAiQuotaAllowed(entitlements.quota);

    const model = resolveDoryAgentModel({
        execution,
        req: req as any,
    });
    const gatewayHeaders = buildCloudflareAiGatewayHeaders(
        {
            organizationId,
            userId,
            userEmail: entitlements.userEmail,
            plan: entitlements.plan,
            feature: 'chat_agent',
        },
        execution.gateway,
    );
    const headers = mergeHeaders(undefined, gatewayHeaders);

    const agent = buildDoryChatAgent({
        model,
        tools,
        instructions: agentContext.instructions,
        temperature: preset.temperature,
        maxSteps: 8,
        headers,
        context: {
            organizationId,
            userId,
            userEmail: entitlements.userEmail,
            plan: entitlements.plan,
            feature: 'chat_agent',
            model: execution.modelName,
            requestId,
            connectionId,
            gateway: execution.gateway,
            provider: execution.providerKey,
        },
        requestId,
        startedAt,
        debugInput: {
            system: agentContext.instructions,
            messages: historyMessagesForAgent as any,
            prompt: null,
        },
    });

    return createAgentUIStreamResponse({
        agent,
        uiMessages: historyMessagesForAgent as any,
        originalMessages: historyMessagesForAgent as any,
        generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
        headers: chatId ? { 'x-chat-id': chatId } : undefined,
        onFinish: async event => {
            if (event.isAborted || !db || !userId || !organizationId || !chatId) return;

            const messageId = typeof (event.responseMessage as any)?.id === 'string' && (event.responseMessage as any).id ? (event.responseMessage as any).id : newEntityId();
            if (existedMessageIds.has(messageId)) return;

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
                        role: 'assistant',
                        parts: ((event.responseMessage as any).parts ?? []) as any,
                        metadata: {
                            ...(event.responseMessage.metadata && typeof event.responseMessage.metadata === 'object'
                                ? (event.responseMessage.metadata as Record<string, unknown>)
                                : {}),
                            finishReason: event.finishReason ?? null,
                            sessionTitle,
                        },
                        createdAt: new Date(),
                    },
                });
                existedMessageIds.add(messageId);
            } catch (error) {
                console.error('[chat] persist assistant message failed', error);
            }
        },
        onError: error => {
            void recordAiUsage({
                requestId,
                context: {
                    organizationId,
                    userId,
                    feature: 'chat_agent',
                    model: execution.modelName,
                    requestId,
                    connectionId,
                    gateway: execution.gateway,
                    provider: execution.providerKey,
                },
                input: {
                    system: agentContext.instructions,
                    messages: historyMessagesForAgent as any,
                    prompt: null,
                },
                latencyMs: Date.now() - startedAt,
                status: 'error',
                error,
            });

            return error instanceof Error ? error.message : 'AI_SERVICE_UNAVAILABLE';
        },
    });
}
