import type { AnalysisScope } from '@dory/shared/types/work-document';

import { formatChatToolError } from '@/lib/ai/agents/work-tool-input';
import { createWorkDocumentTools } from '@/lib/server/work-document-tools';
import { validateAnalysisScope } from '@/lib/server/work-documents';

import 'server-only';

import { getDBService } from '@dory/database';
import { isLocalAiAgentProvider } from '@dory/ee/ai/provider-options';
import type { Locale } from '@dory/i18n/routing';
import { newEntityId } from '@dory/shared/id';
import { isDesktopRuntime } from '@dory/shared/runtime';
import type { ConnectionType } from '@dory/shared/types/connections';
import { consumeStream, createAgentUIStream, createUIMessageStreamResponse, type UIMessage } from 'ai';

import { getChatResponseText, prepareChatHistory } from '@/lib/agent-runs/chat-response';
import { buildDoryChatAgent } from '@/lib/ai/agents/chat-agent';
import { buildDoryAgentContext, type DoryAgentSchemaTableRef } from '@/lib/ai/agents/context';
import { resolveDoryAgentModel } from '@/lib/ai/agents/model';
import { resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';
import { createAiRequestId, recordAiUsage } from '@/lib/ai/gateway';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import {
    DORY_CODEX_CHAT_ID_HEADER,
    DORY_CODEX_CONNECTION_ID_HEADER,
    DORY_CODEX_MCP_ENDPOINT_HEADER,
    DORY_CODEX_REQUEST_ID_HEADER,
    DORY_CODEX_WORK_ID_HEADER,
} from '@/lib/ai/model/providers/local-agent';
import { MAX_HISTORY_MESSAGES } from '@/lib/ai/prompts';
import { assertAiQuotaAllowed, buildCloudflareAiGatewayHeaders, resolveAiEntitlements } from '@/lib/ai/usage-quota';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { createChatAgentRunLifecycle } from '@/lib/server/chat-agent-run';
import { createChatAnalysis } from '@/lib/server/chat-analysis';
import { alignChatAnswerStream } from '@/lib/server/chat-answer-stream';
import { issueMcpDesktopGrant, MCP_DESKTOP_GRANT_HEADER } from '@/lib/server/mcp/auth';
import { createExternalRequestUrl } from '@/lib/server/request-origin';
import { recordSemanticModelUsage } from '@/lib/server/semantic-model-context';
import { toPromptContext } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/copilot-envelope';
import type { CopilotEnvelopeV1 } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/types/copilot-envelope';
import { createChartBuilderTool } from '@/app/api/chat/tools/chart-builder';
import { buildUserLanguageInstruction, extractMessageText, normalizeMessage } from '@/app/api/chat/utils';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

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
    analysisScope?: AnalysisScope;
    documentId?: string | null;
};

function mergeHeaders(headers: Record<string, string | undefined> | undefined, extraHeaders: Record<string, string> | null): Record<string, string | undefined> | undefined {
    if (!extraHeaders) return headers;
    return {
        ...(headers ?? {}),
        ...extraHeaders,
    };
}

function buildCurrentTurnExecutionInstruction(sqlToolEnabled: boolean, locale: Locale): string | null {
    if (!sqlToolEnabled) return null;
    return translateApi('Api.Chat.Prompt.ExecutionIntent.Policy', undefined, locale);
}

function buildLocalCodexHeaders(options: {
    req: Request;
    providerKey?: string | null;
    transport?: string | null;
    organizationId?: string | null;
    userId?: string | null;
    connectionId?: string | null;
    requestId: string;
    chatId?: string | null;
    workId?: string | null;
}): Record<string, string> | null {
    if (options.providerKey !== 'codex-agent' || options.transport !== 'local') return null;

    const headers: Record<string, string> = {
        [DORY_CODEX_MCP_ENDPOINT_HEADER]: createExternalRequestUrl(options.req, '/api/mcp'),
        [DORY_CODEX_REQUEST_ID_HEADER]: options.requestId,
    };

    if (options.connectionId) {
        headers[DORY_CODEX_CONNECTION_ID_HEADER] = options.connectionId;
    }
    if (options.workId) headers[DORY_CODEX_WORK_ID_HEADER] = options.workId;
    if (options.chatId) {
        headers[DORY_CODEX_CHAT_ID_HEADER] = options.chatId;
    }

    if (isDesktopRuntime() && options.userId && options.organizationId) {
        try {
            const { grant } = issueMcpDesktopGrant({
                userId: options.userId,
                organizationId: options.organizationId,
            });
            headers[MCP_DESKTOP_GRANT_HEADER] = grant;
        } catch (error) {
            console.error('[chat] failed to issue local Codex MCP desktop grant', error);
        }
    }

    return headers;
}

export async function handleChatRequest(req: Request) {
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
    const modelHistoryMessages = prepareChatHistory(uiMessages.filter(message => message.role === 'user' || message.role === 'assistant'));
    const historyMessagesForAgent = modelHistoryMessages.length > MAX_HISTORY_MESSAGES ? modelHistoryMessages.slice(-MAX_HISTORY_MESSAGES) : modelHistoryMessages;
    const currentUserMessage =
        uiMessages.find(message => (message as any)?.id === requestMessageId && message.role === 'user') ?? [...uiMessages].reverse().find(message => message.role === 'user');
    const currentUserText = extractMessageText(currentUserMessage);

    const session = await getSessionFromRequest(req as any);
    const userId = session?.user?.id ?? null;
    const organizationId = resolveCurrentOrganizationId(session);
    let connectionId = connectionIdFromBody ?? req.headers.get('x-connection-id') ?? null;
    const db = userId ? await getDBService() : null;

    const analysisScope = body.analysisScope && db && userId && organizationId ? await validateAnalysisScope(db, { userId, organizationId }, body.analysisScope) : undefined;
    if (body.analysisScope && !analysisScope) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    // Organization-level sessions use an explicit set of connections, not an ambient connection.
    if (analysisScope) connectionId = null;
    if (body.documentId && db && userId && organizationId) await db.workDocuments.get({ userId, organizationId, documentId: body.documentId });

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
                  analysisScope: analysisScope ?? null,
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
            const existingCopilot = await db.chat.findCopilotSessionByTab({ organizationId, userId, tabId });
            if (existingCopilot?.connectionId && connectionId && existingCopilot.connectionId !== connectionId) {
                return Response.json({ error: translateApi('Api.Chat.ConnectionChanged', undefined, locale) }, { status: 409 });
            }
            connectionId ??= existingCopilot?.connectionId ?? null;
            if (sessionMetadata) sessionMetadata.connectionId = connectionId;
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
                if (existed.connectionId && connectionId && existed.connectionId !== connectionId) {
                    return Response.json({ error: translateApi('Api.Chat.ConnectionChanged', undefined, locale) }, { status: 409 });
                }
                if (!analysisScope) connectionId ??= existed.connectionId;
                if (sessionMetadata) sessionMetadata.connectionId = connectionId;
                await db.chat.updateSession({
                    organizationId,
                    sessionId: chatId,
                    userId,
                    patch: {
                        connectionId: analysisScope ? existed.connectionId : (connectionId ?? null),
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

    const chatRun =
        db && userId && organizationId && chatId
            ? createChatAgentRunLifecycle({
                  works: db.works,
                  userId,
                  organizationId,
                  chatId,
                  connectionId,
                  requestId,
                  title: sessionTitle ?? currentUserText.slice(0, 64),
                  signal: req.signal,
                  requireSummary: true,
                  analysisScope,
                  reportCreationKey: `${chatId}:${currentUserMessage?.id ?? requestMessageId}`,
              })
            : null;

    try {
        const analysis =
            db && userId && organizationId && chatId && chatRun
                ? createChatAnalysis({
                      db,
                      userId,
                      organizationId,
                      chatId,
                      requestId,
                      connectionId,
                      analysisScope,
                      database,
                      locale,
                      requestOrigin: new URL(req.url).origin,
                      signal: req.signal,
                      resolveWork: () => chatRun.resolve(),
                      beforeComplete: async () => {
                          await reports?.assertReady();
                      },
                  })
                : null;
        const reports =
            db && userId && organizationId && chatId && chatRun
                ? createWorkDocumentTools({
                      db,
                      userId,
                      organizationId,
                      chatId,
                      creationKey: `${chatId}:${currentUserMessage?.id ?? requestMessageId}`,
                      requestId,
                      scope: analysisScope ?? { connectionIds: connectionId ? [connectionId] : [] },
                      documentId: body.documentId,
                      runId: async () => (await chatRun.resolve()).workId,
                  })
                : null;
        const tools = { ...(analysis?.tools ?? { chartBuilder: createChartBuilderTool(locale) }), ...(!isLocalAiAgentProvider(execution.providerKey) ? reports?.tools : {}) };
        const sqlToolEnabled = Boolean(analysis && (connectionId || analysisScope?.connectionIds.length));
        const work = await chatRun?.resolve();
        const knowledgeDiscovery = await analysis?.prepareKnowledge(currentUserText);

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
            question: currentUserText,
        });
        const currentTurnExecutionInstruction = buildCurrentTurnExecutionInstruction(sqlToolEnabled, locale);
        const agentInstructions = [
            agentContext.instructions,
            reports ? await reports.instructions(isLocalAiAgentProvider(execution.providerKey)) : null,
            analysisScope
                ? `Analysis scope: ${JSON.stringify(analysisScope)}. Explore schema for EACH selected connection before querying. Execute queries separately using the correct SQL dialect. Use only these connections. Do not infer cross-source causality or combine incompatible currencies/time windows.`
                : null,
            currentTurnExecutionInstruction,
            knowledgeDiscovery,
            analysis
                ? 'Complete analysis with finishAnalysis: include status:"completed" (or "error" for incomplete work), structured findings and finalAnswer in the user language. finalAnswer is the exact answer shown in chat. Only cite actual returned Artifact IDs. Do not stop after charts. Use findings: [] for setup checks. If business definitions conflict, ask for clarification in finalAnswer instead of guessing.'
                : null,
        ]
            .filter(Boolean)
            .join('\n\n')
            .replaceAll(
                isLocalAiAgentProvider(execution.providerKey) ? 'finishAnalysis' : 'dory_finish_work',
                isLocalAiAgentProvider(execution.providerKey) ? 'dory_finish_work' : 'finishAnalysis',
            );

        const currentUserMessageId =
            typeof (currentUserMessage as any)?.id === 'string' && (currentUserMessage as any).id ? (currentUserMessage as any).id : requestMessageId || null;
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
        const localCodexHeaders = buildLocalCodexHeaders({
            req,
            providerKey: execution.providerKey,
            transport: execution.transport,
            organizationId,
            userId,
            connectionId,
            requestId,
            chatId,
            workId: work?.workId,
        });
        const headers = mergeHeaders(mergeHeaders(undefined, gatewayHeaders), localCodexHeaders);

        const agent = buildDoryChatAgent({
            model,
            tools,
            instructions: agentInstructions,
            temperature: preset.temperature,
            maxSteps: analysisScope || body.documentId ? 24 : 16,
            structuredCompletion: Boolean(analysis && !isLocalAiAgentProvider(execution.providerKey)),
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
                instructions: agentInstructions,
                messages: historyMessagesForAgent as any,
                prompt: null,
            },
        });

        if (chatRun && db && userId && organizationId && connectionId && agentContext.semanticModelsUsed.length) {
            try {
                const work = await chatRun.resolve();
                await recordSemanticModelUsage(db, { organizationId, userId, workId: work.workId, connectionId, requestId, models: agentContext.semanticModelsUsed });
            } catch (error) {
                console.error('[chat] failed to record semantic model context', error);
            }
        }

        const stream = await createAgentUIStream({
            agent,
            abortSignal: req.signal,
            uiMessages: historyMessagesForAgent as any,
            originalMessages: historyMessagesForAgent as any,
            generateMessageId: () => `msg_${requestId}`,
            messageMetadata: () => ({ agentRunId: work?.workId ?? null, requestId }),
            onEnd: async event => {
                if (!db || !userId || !organizationId || !chatId) return;

                const messageId = typeof (event.responseMessage as any)?.id === 'string' && (event.responseMessage as any).id ? (event.responseMessage as any).id : newEntityId();
                if (existedMessageIds.has(messageId)) return;

                try {
                    await db.chat.appendMessage({
                        organizationId,
                        sessionId: chatId,
                        userId,
                        updateExistingAssistant: execution.providerKey !== 'codex-agent',
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
                                agentRunId: work?.workId ?? null,
                                requestId,
                                summarySaved: Boolean(analysis?.getFinalAnswer()),
                            },
                            createdAt: new Date(),
                        },
                    });
                    existedMessageIds.add(messageId);
                } catch (error) {
                    console.error('[chat] persist assistant message failed', error);
                    await chatRun?.fail();
                } finally {
                    await chatRun?.finish(event).catch(error => console.error('[chat] failed to finish Agent Run', error));
                }
            },
            onError: error => {
                // This callback also formats recoverable tool/input errors. Finalize
                // only in onEnd, after the agent has had a chance to recover.
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
                        instructions: agentContext.instructions,
                        messages: historyMessagesForAgent as any,
                        prompt: null,
                    },
                    latencyMs: Date.now() - startedAt,
                    status: 'error',
                    error,
                });

                return formatChatToolError(error);
            },
        });
        const alignedStream =
            execution.providerKey === 'codex-agent' && db && userId && organizationId && work
                ? stream.pipeThrough(
                      alignChatAnswerStream(async () => {
                          const responses = await db.works.listChatResponses({ organizationId, userId, workId: work.workId });
                          const saved = responses.find(response => response.id === `msg_${requestId}` && response.metadata?.summarySaved === true);
                          return saved ? getChatResponseText(saved.parts) : null;
                      }),
                  )
                : stream;
        return createUIMessageStreamResponse({
            stream: alignedStream,
            headers: chatId ? { 'x-chat-id': chatId } : undefined,
            consumeSseStream: ({ stream }) => consumeStream({ stream }),
        });
    } catch (error) {
        try {
            await chatRun?.fail();
        } catch (finishError) {
            console.error('[chat] failed to finish Agent Run after setup error', finishError);
        }
        throw error;
    }
}
