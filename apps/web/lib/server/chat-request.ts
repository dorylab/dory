import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { AnalysisScope } from '@dory/shared/types/work-document';

import { formatChatToolError } from '@/lib/ai/agents/work-tool-input';
import { getChatResumeRequest, summarizeChatCompletion } from '@/lib/ai/chat-response-state';
import { AttachmentError } from '@/lib/chat-context/attachments';
import { chatContextSchema, type ChatContext } from '@/lib/chat-context/types';
import { bindChatAttachments, prepareStoredAttachments } from '@/lib/server/chat-attachments';
import { resolveChatContext } from '@/lib/server/chat-context';
import { createWorkDocumentTools } from '@/lib/server/work-document-tools';
import { validateAnalysisScope } from '@/lib/server/work-documents';

import { CHAT_CHECKPOINT_INSTRUCTIONS, runChatStageAction } from './chat-checkpoints';
import { chatContinuity } from './chat-continuity';

import 'server-only';

import { after } from 'next/server';
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
import { buildChatCompletionMetadata } from '@/lib/ai/chat-response-state';
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
import {
    isReportEditRequest,
    isReportPublishRequest,
    requestedChartType,
    requestedReportVisualTypes,
    requestsReportChart,
    resolveReportWorkflow,
} from '@/lib/chat-context/output-intent';
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

import { generateAgentWorkTitle } from './agent-work-title';

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
    resumeMessageId?: string;
    references?: ChatContext['references'];
    mentionSpans?: ChatContext['mentionSpans'];
    outputIntent?: ChatContext['outputIntent'];
    sourceMessageId?: string;
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
    if (!isLocalAiAgentProvider(options.providerKey) || options.transport !== 'local') return null;

    const headers: Record<string, string> = {
        [DORY_CODEX_MCP_ENDPOINT_HEADER]: createExternalRequestUrl(options.req, '/api/mcp'),
        [DORY_CODEX_REQUEST_ID_HEADER]: options.requestId,
    };

    if (options.connectionId) {
        headers[DORY_CODEX_CONNECTION_ID_HEADER] = options.connectionId;
    }
    if (options.userId) headers['x-dory-local-agent-user-id'] = options.userId;
    if (options.organizationId) headers['x-dory-local-agent-organization-id'] = options.organizationId;
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
    const progressCheckpoints = !tabId && !copilotEnvelope;

    const uiMessages: UIMessage[] = Array.isArray(rawMessages) ? rawMessages.map(normalizeMessage) : [];
    const modelHistoryMessages = prepareChatHistory(uiMessages.filter(message => message.role === 'user' || message.role === 'assistant'));
    let historyMessagesForAgent = modelHistoryMessages.length > MAX_HISTORY_MESSAGES ? modelHistoryMessages.slice(-MAX_HISTORY_MESSAGES) : modelHistoryMessages;
    const currentUserMessage =
        uiMessages.find(message => (message as any)?.id === requestMessageId && message.role === 'user') ?? [...uiMessages].reverse().find(message => message.role === 'user');
    let currentUserText = extractMessageText(currentUserMessage);

    const session = await getSessionFromRequest(req as any);
    const userId = session?.user?.id ?? null;
    const organizationId = resolveCurrentOrganizationId(session);
    let connectionId = connectionIdFromBody ?? req.headers.get('x-connection-id') ?? null;
    const db = userId ? await getDBService() : null;

    let resumeUserMessageId: string | undefined;
    if (body.resumeMessageId && db && userId && organizationId && chatIdFromBody) {
        const history = await db.chat.listMessages({ userId, organizationId, sessionId: chatIdFromBody });
        const prior = history.find(message => message.id === body.resumeMessageId && message.role === 'assistant');
        const metadata = prior?.metadata as { userMessageId?: string; completion?: import('@dory/shared/types/chat-completion').ChatCompletion } | undefined;
        if (!metadata?.completion?.canContinue) throw new DatabaseError('This response cannot be resumed.', 400);
        const original = getChatResumeRequest(history, body.resumeMessageId);
        if (!original) throw new DatabaseError('Original request unavailable.', 400);
        currentUserText = getChatResponseText(original.parts);
        resumeUserMessageId = original.id;
        if (metadata.completion.report?.documentId) body.documentId = metadata.completion.report.documentId;
    }
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
    const contextInput = chatContextSchema.parse({
        references: body.references,
        mentionSpans: body.mentionSpans,
        outputIntent: body.outputIntent,
        sourceMessageId: body.sourceMessageId,
    });

    if (contextInput.references.length && (!db || !userId || !organizationId)) throw new DatabaseError('Unauthorized.', 401);
    const referenceScope = analysisScope ?? {
        connectionIds: connectionId ? [connectionId] : [],
        databasesByConnection: connectionId && database ? { [connectionId]: database } : {},
    };
    const resolvedContext =
        db && userId && organizationId
            ? await resolveChatContext(
                  db,
                  { userId, organizationId },
                  contextInput,
                  referenceScope,
                  chatIdFromBody ?? null,
                  currentUserMessage?.parts
                      .filter(part => part.type === 'text')
                      .map(part => part.text)
                      .join('\n') ?? '',
              )
            : { ...contextInput, instruction: '' };
    const hasAttachments = historyMessagesForAgent.some(message => message.parts.some(part => part.type === 'file'));
    try {
        if (hasAttachments) {
            if (!userId || !organizationId) throw new DatabaseError('Unauthorized.', 401);
            const attachments = await prepareStoredAttachments(
                { userId, organizationId },
                chatIdFromBody ?? null,
                historyMessagesForAgent,
                !isLocalAiAgentProvider(execution.providerKey),
            );
            historyMessagesForAgent = attachments.model;
            for (const canonical of attachments.canonical) {
                const original = uiMessages.find(message => message.id === canonical.id);
                if (original) original.parts = canonical.parts;
            }
        }
    } catch (error) {
        if (error instanceof AttachmentError)
            throw new DatabaseError(
                translateApi(`ChatComposer.AttachmentErrors.${error.reason}`, { filename: error.filename, size: (error.byteSize / 1024 / 1024).toFixed(2) }, locale),
                400,
            );
        throw error;
    }
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
                  analysisScope: body.analysisScope ?? null,
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
                    metadata: { ...sessionMetadata, ...(analysisScope ? { workTitleSource: 'pending' } : {}) },
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
                metadata: { ...sessionMetadata, ...(analysisScope ? { workTitleSource: 'pending' } : {}) },
            });
            chatId = sessionRecord.id;
            sessionTitle = sessionRecord.title ?? null;
        }
    }

    if (db && userId && organizationId && chatId && analysisScope && currentUserText) {
        const titleDb = db;
        const titleInput = { organizationId, userId, sessionId: chatId, prompt: currentUserText, req };
        after(() => generateAgentWorkTitle(titleDb, titleInput));
    }

    if (
        db &&
        userId &&
        organizationId &&
        chatId &&
        uiMessages.some(
            message =>
                message.role === 'user' && message.id !== currentUserMessage?.id && Boolean((message.metadata as { references?: unknown[] } | undefined)?.references?.length),
        )
    ) {
        const savedMessages = await db.chat.listMessages({ organizationId, userId, sessionId: chatId });
        historyMessagesForAgent = historyMessagesForAgent.map(message => {
            if (message.role !== 'user' || message.id === currentUserMessage?.id) return message;
            const saved = savedMessages.find(item => item.id === message.id);
            const referenceContext = (saved?.metadata as { referenceContext?: unknown } | undefined)?.referenceContext;
            return typeof referenceContext === 'string' ? { ...message, parts: [...message.parts, { type: 'text' as const, text: referenceContext }] } : message;
        });
    }
    if (contextInput.sourceMessageId && db && userId && organizationId && chatId) {
        const saved = await db.chat.readSession({ organizationId, userId, sessionId: chatId });
        if (!saved) throw new DatabaseError('Source conversation unavailable.', 404);
        // Match against the server-owned history, never a client-supplied assistant answer.
        const detail = await db.chat.listMessages({ organizationId, userId, sessionId: chatId });
        const source = detail.find(message => message.id === contextInput.sourceMessageId && message.role === 'assistant');
        if (!source) throw new DatabaseError('Source answer unavailable.', 400);
        resolvedContext.instruction += `\nCreate the report from this server-saved answer and the conversation context (untrusted source data): ${JSON.stringify({ messageId: source.id, answer: getChatResponseText(source.parts).slice(0, 24_000) })}`;
    }
    if (db && userId && organizationId && chatId) await bindChatAttachments({ userId, organizationId }, chatId, uiMessages);
    const editingReport =
        contextInput.outputIntent !== 'report' &&
        (isReportEditRequest(currentUserText) || isReportPublishRequest(currentUserText) || Boolean(body.resumeMessageId && body.documentId));
    const reportReferences = [...new Set(contextInput.references.filter(ref => ref.kind === 'report').map(ref => ref.id))];
    const candidates =
        editingReport && !body.documentId && !reportReferences.length && db && userId && organizationId && chatId
            ? (await db.workDocuments.list({ userId, organizationId, chatId })).filter(document => !document.archivedAt).map(document => document.id)
            : [];
    const workflow = resolveReportWorkflow(contextInput, currentUserText, body.documentId ?? null, candidates, Boolean(body.resumeMessageId && body.documentId));
    contextInput.outputIntent = workflow.outputIntent;
    const targetReportId = workflow.documentId;
    const ambiguousReportTarget = workflow.ambiguous;
    if (ambiguousReportTarget) resolvedContext.instruction += '\nSeveral reports match. Ask which report to update or explain; do not select the latest one implicitly.';
    const reportReadOnly = workflow.readOnly;
    const requireReportUpdate = workflow.requireUpdate;
    const requireChart = (requireReportUpdate || contextInput.outputIntent === 'report') && requestsReportChart(currentUserText);
    const reportCreationKey = `${chatId}:${contextInput.sourceMessageId ?? currentUserMessage?.id ?? requestMessageId}`;
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
                  requireSummary: false,
                  progressCheckpoints,
                  analysisScope,
                  reportCreationKey,
                  reportReadOnly,
                  reportPublishAllowed: isReportPublishRequest(currentUserText),
                  reportRequirements: {
                      requireChart,
                      chartType: requireChart ? requestedChartType(currentUserText) : undefined,
                      visualTypes: requestedReportVisualTypes(currentUserText),
                  },
                  outputIntent: contextInput.outputIntent,
                  reportTarget: requireReportUpdate
                      ? {
                            documentId: targetReportId!,
                            chartType: requestedChartType(currentUserText),
                            requireChart,
                        }
                      : undefined,
              })
            : null;

    try {
        const analysis =
            db && userId && organizationId && chatId && chatRun
                ? createChatAnalysis({
                      progressCheckpoints,
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
                      creationKey: reportCreationKey,
                      requireReport: contextInput.outputIntent === 'report',
                      allowPublish: isReportPublishRequest(currentUserText),
                      requireUpdate: requireReportUpdate,
                      requireChart,
                      requiredVisualTypes: requestedReportVisualTypes(currentUserText),
                      requiredChartType: requireChart ? requestedChartType(currentUserText) : undefined,
                      requestId,
                      scope: analysisScope ?? { connectionIds: connectionId ? [connectionId] : [] },
                      documentId: targetReportId,
                      runId: async () => (await chatRun.resolve()).workId,
                  })
                : null;
        const tools: import('ai').ToolSet = {
            ...(analysis?.tools ?? { chartBuilder: createChartBuilderTool(locale) }),
            ...(!isLocalAiAgentProvider(execution.providerKey) ? reports?.tools : {}),
        };
        if (reports && chatRun && db && organizationId && userId && !isLocalAiAgentProvider(execution.providerKey)) {
            for (const [name, definition] of Object.entries(reports.tools)) {
                const execute = definition.execute!;
                tools[name] = {
                    ...definition,
                    execute: async (input, call) =>
                        runChatStageAction(
                            {
                                db,
                                organizationId,
                                userId,
                                workId: (await chatRun.resolve()).workId,
                                requestId,
                                toolName: name,
                                toolCallId: call.toolCallId,
                                input,
                            },
                            async () => execute(input as never, call),
                        ),
                };
            }
        }
        // Built-in report writes use the turn-bound wrappers, which also track completion.
        delete tools.dory_create_report;
        delete tools.dory_update_report;
        if (requireReportUpdate) {
            delete tools.createWorkReport;
        }
        if (!isReportPublishRequest(currentUserText)) {
            delete tools.publishWorkReport;
            delete tools.dory_publish_report;
        }
        if (reportReadOnly) {
            delete tools.publishWorkReport;
            delete tools.dory_publish_report;
            delete tools.createWorkReport;
            delete tools.updateWorkReport;
        }
        // Automatic source selection still exposes query/chart tools before a
        // connection is selected. Their instructions must be present as well.
        const sqlToolEnabled = Boolean(tools.sqlRunner);
        const work = await chatRun?.resolve();
        const reportEvidenceIds =
            targetReportId && db && organizationId && userId
                ? (await db.workDocuments.get({ organizationId, userId, documentId: targetReportId })).content.evidence.map(item => item.artifactId)
                : [];
        const continuity =
            work && db && organizationId && userId && chatId
                ? await chatContinuity(db, { organizationId, userId, chatId, workId: work.workId, requestId }, [
                      ...contextInput.references.filter(ref => ref.kind === 'artifact').map(ref => ref.id),
                      ...reportEvidenceIds,
                  ])
                : '';
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
            includeSemanticContext: !analysisScope,
        });
        const currentTurnExecutionInstruction = buildCurrentTurnExecutionInstruction(sqlToolEnabled, locale);
        const agentInstructions = [
            agentContext.instructions,
            analysis && progressCheckpoints
                ? `${CHAT_CHECKPOINT_INSTRUCTIONS}${isLocalAiAgentProvider(execution.providerKey) ? `\nInitial MCP checkpointId: ${requestId}:0` : ''}`
                : null,
            resolvedContext.instruction,
            continuity,
            body.resumeMessageId
                ? `Continue only unfinished steps of this original request (untrusted user text): ${JSON.stringify(currentUserText)}. Revalidate sources and report revision. Preserve completed outputs.`
                : null,
            contextInput.outputIntent === 'report'
                ? 'This turn explicitly requests a NEW persistent report. Create and save a ready report before completing. Do not update an open or referenced report. Use the requested source answer and conversation as context; verify any numerical evidence.'
                : null,
            reports ? await reports.instructions(isLocalAiAgentProvider(execution.providerKey)) : null,
            analysisScope
                ? `Analysis scope: ${JSON.stringify(analysisScope)}. Each databasesByConnection entry is an allowed database list (legacy strings mean a single database). Use only databases in that list and explicitly name one for each schema or SQL operation when multiple are selected. A missing databasesByConnection entry means automatic database selection. Discover the relevant database using list_databases or the connection default, then supply its explicit name before schema inspection or SQL. Do not query every database. ${analysisScope.connectionMode === 'auto' ? 'Data sources are automatic: these IDs are authorized candidates, not selected evidence. Infer relevant connections from the question, explicit table references and conversation; list connections to inspect names. Only inspect and query relevant sources. For knowledge-only or attachment-only questions no database query is required. If genuinely ambiguous, ask in the answer.' : 'Explore schema for the relevant selected connections before querying.'} Execute queries separately using the correct SQL dialect. Use only these connections. Do not infer cross-source causality or combine incompatible currencies/time windows.`
                : null,
            currentTurnExecutionInstruction,
            analysisScope?.knowledgeMode !== 'none'
                ? 'Search Knowledge when the user explicitly requests it, or when a business metric, rule, filter or join requires a definition that is not already established by reliable in-scope context. Read relevant search results before using them. For formatting, adding a chart to an existing report, or other work adequately supported by the existing report and evidence, do not search merely because Knowledge is enabled. If Knowledge is needed but unavailable or inconclusive, explain the limitation and ask for clarification when the definition is material; never invent it.'
                : null,
            analysisScope?.knowledgeMode === 'none' ? 'Knowledge is disabled. Do not search, read or use Knowledge assets.' : null,
            analysis
                ? 'Answer ordinary analysis, existing query result explanations, Knowledge questions and clarification requests directly in the user language. Do not save Findings unless the user explicitly requests saved conclusions. Reports use their own saving workflow and need no extra Findings. Only for explicitly requested saved conclusions, call finishAnalysis once with structured findings and finalAnswer, citing verified Artifact IDs. On a Findings save failure, do not retry Findings in this turn; provide the analysis and explain that saving failed. Report validation or version conflicts follow the report recovery instructions; read the current draft and correct the patch before retrying. Never claim a failed save succeeded. If business definitions conflict, ask for clarification instead of guessing.'
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
                        metadata: {
                            ...contextInput,
                            attachments: currentUserMessage.parts.filter(part => part.type === 'file'),
                            references: resolvedContext.references,
                            mentionSpans: resolvedContext.mentionSpans,
                            referenceContext: resolvedContext.instruction || undefined,
                        },
                        createdAt: new Date(),
                    },
                });
                existedMessageIds.add(currentUserMessageId);
            } catch (error) {
                console.error('[chat] persist user message failed', error);
                if (currentUserMessage.parts.some(part => part.type === 'file')) throw error;
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
            hasAttachments,
            model,
            tools,
            instructions: agentInstructions,
            temperature: preset.temperature,
            maxSteps: analysisScope || body.documentId || contextInput.outputIntent === 'report' ? 24 : 16,
            structuredCompletion: Boolean(analysis && !isLocalAiAgentProvider(execution.providerKey)),
            onSummaryInputError: analysis?.recordSummaryInputError,
            onToolInputError: analysis?.recordToolInputError,
            checkpoint: analysis && progressCheckpoints ? { inspect: analysis.inspectCheckpoint, invalid: analysis.invalidProgress } : undefined,
            requiredReport:
                reports && !isLocalAiAgentProvider(execution.providerKey) ? { status: async () => (reports.required() ? reports.completionStatus() : null) } : undefined,
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

        let responseError: string | null = null;
        let completionMetadata: (ReturnType<typeof buildChatCompletionMetadata> & { completion?: import('@dory/shared/types/chat-completion').ChatCompletion }) | undefined;
        let reportCompletionError: string | null = null;
        let summarySave: { status: string; error?: string } | undefined;
        const stream = await createAgentUIStream({
            agent,
            abortSignal: req.signal,
            uiMessages: historyMessagesForAgent as any,
            originalMessages: historyMessagesForAgent as any,
            generateMessageId: () => `msg_${requestId}`,
            messageMetadata: () => ({
                agentRunId: work?.workId ?? null,
                requestId,
                userMessageId: currentUserMessage?.id,
                sourceMessageId: contextInput.sourceMessageId,
                reportDocumentId: reports?.currentId() ?? (requireReportUpdate ? (targetReportId ?? undefined) : undefined),
                reportRevision: reports?.currentRevision(),
            }),
            onEnd: async event => {
                if (!db || !userId || !organizationId || !chatId) return;

                const messageId = typeof (event.responseMessage as any)?.id === 'string' && (event.responseMessage as any).id ? (event.responseMessage as any).id : newEntityId();
                if (existedMessageIds.has(messageId)) return;

                try {
                    const persistedRun = work ? await db.works.getById({ organizationId, userId, workId: work.workId }) : null;
                    const turn = persistedRun?.metadata?.chatTurn as
                        | { requestId?: string; summarySave?: { status: string; error?: string }; summarySaved?: boolean; progressStopped?: boolean }
                        | undefined;
                    summarySave = turn?.requestId === requestId && turn.summarySave ? { status: turn.summarySave.status, error: turn.summarySave.error } : undefined;
                    const progressStopped = turn?.requestId === requestId && turn.progressStopped === true;
                    completionMetadata = buildChatCompletionMetadata({
                        message: event.responseMessage,
                        finishReason: event.finishReason,
                        responseError,
                        progressError: progressStopped ? translateApi('Api.Chat.Errors.AnalysisInterrupted', undefined, locale) : null,
                        isAborted: event.isAborted,
                    });
                    if (work && isLocalAiAgentProvider(execution.providerKey)) {
                        const saved = (await db.works.listChatResponses({ organizationId, userId, workId: work.workId })).find(
                            response => response.id === messageId && (response.metadata?.summarySaved === true || response.metadata?.reportSaved === true),
                        );
                        if (saved) {
                            const text = getChatResponseText(saved.parts);
                            const progress = (await db.works.listEvents({ organizationId, userId, workId: work.workId })).find(
                                item => item.toolName === 'chat_progress' && item.inputSummary?.requestId === requestId,
                            )?.outputSummary?.entries as import('@dory/shared/types/chat-progress').ChatProgressEntry[] | undefined;
                            const final = progress?.find(item => item.phase === 'final');
                            if (text && final && final.text !== text)
                                await db.works.appendChatProgress({
                                    organizationId,
                                    userId,
                                    workId: work.workId,
                                    requestId,
                                    entries: [{ ...final, revision: final.revision + 1, text }],
                                });
                        }
                    }
                    if (contextInput.outputIntent === 'report' || requireReportUpdate || reports?.currentId()) {
                        try {
                            await reports?.assertReady();
                        } catch (error) {
                            reportCompletionError = error instanceof Error ? error.message : 'Report was not saved.';
                        }
                    }
                    const checkpoint = work ? await analysis?.inspectCheckpoint().catch(() => null) : null;
                    const persistedCheckpoint =
                        !checkpoint && work
                            ? ((await db.works.listEvents({ organizationId, userId, workId: work.workId })).find(
                                  event => event.toolName === 'chat_checkpoints' && event.inputSummary?.requestId === requestId,
                              )?.outputSummary?.state as import('@dory/shared/types/chat-checkpoints').ChatCheckpoints | undefined)
                            : undefined;
                    const completion = summarizeChatCompletion({
                        message: event.responseMessage,
                        actions: checkpoint?.actions ?? persistedCheckpoint?.actions ?? [],
                        aborted: event.isAborted,
                        error: completionMetadata.responseError,
                        chartRequired: requireChart || /(?:加|补|生成|创建|绘制).{0,16}图|(?:add|create|draw).{0,30}chart/i.test(currentUserText),
                        report:
                            reports?.required() || requireReportUpdate || contextInput.outputIntent === 'report'
                                ? {
                                      documentId: reports?.currentId() ?? targetReportId ?? '',
                                      revision: reports?.currentRevision(),
                                      version: reports?.currentVersion(),
                                      saved: Boolean(reports?.currentId() && reports?.currentRevision() && !reportCompletionError),
                                  }
                                : undefined,
                    });
                    completionMetadata = { ...completionMetadata, completion };
                    if (work) await db.works.setChatCompletion({ organizationId, userId, workId: work.workId, requestId, completion });
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
                                ...completionMetadata,
                                userMessageId: currentUserMessage?.id,
                                ...(resumeUserMessageId ? { resumeUserMessageId } : {}),
                                sourceMessageId: contextInput.sourceMessageId,
                                reportDocumentId: reports?.currentId() ?? (requireReportUpdate ? (targetReportId ?? undefined) : undefined),
                                reportRevision: reports?.currentRevision(),
                                ...(contextInput.outputIntent === 'report' || requireReportUpdate || reports?.currentId()
                                    ? { reportSave: reportCompletionError ? { status: 'failed', error: reportCompletionError } : { status: 'saved' } }
                                    : {}),
                                sessionTitle,
                                agentRunId: work?.workId ?? null,
                                requestId,
                                summarySaved: Boolean(analysis?.getFinalAnswer() || (turn?.requestId === requestId && turn.summarySaved)),
                                summarySave,
                                ...(isLocalAiAgentProvider(execution.providerKey) ? { timelineVersion: 1, timelineRequestId: requestId } : {}),
                            },
                            createdAt: new Date(),
                        },
                    });
                    existedMessageIds.add(messageId);
                } catch (error) {
                    console.error('[chat] persist assistant message failed', error);
                    await chatRun?.fail();
                } finally {
                    if (reportCompletionError) await chatRun?.fail();
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

                responseError = formatChatToolError(error);
                return responseError;
            },
        });
        const alignedStream =
            execution.providerKey === 'codex-agent' && db && userId && organizationId && work
                ? stream.pipeThrough(
                      alignChatAnswerStream(async () => {
                          const responses = await db.works.listChatResponses({ organizationId, userId, workId: work.workId });
                          const saved = responses.find(
                              response => response.id === `msg_${requestId}` && (response.metadata?.summarySaved === true || response.metadata?.reportSaved === true),
                          );
                          return saved ? getChatResponseText(saved.parts) : null;
                      }),
                  )
                : stream;
        return createUIMessageStreamResponse({
            stream: alignedStream.pipeThrough(
                new TransformStream({
                    transform(chunk, controller) {
                        controller.enqueue(chunk);
                    },
                    flush(controller) {
                        if (completionMetadata) controller.enqueue({ type: 'message-metadata', messageMetadata: completionMetadata });
                        if (summarySave) controller.enqueue({ type: 'message-metadata', messageMetadata: { summarySave } });
                        if (reports?.currentId() || reportCompletionError)
                            controller.enqueue({
                                type: 'message-metadata',
                                messageMetadata: {
                                    reportDocumentId: reports?.currentId() ?? (requireReportUpdate ? (targetReportId ?? undefined) : undefined),
                                    reportRevision: reports?.currentRevision(),
                                    ...(contextInput.outputIntent === 'report' || requireReportUpdate || reports?.currentId()
                                        ? { reportSave: reportCompletionError ? { status: 'failed', error: reportCompletionError } : { status: 'saved' } }
                                        : {}),
                                },
                            });
                    },
                }),
            ),
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
