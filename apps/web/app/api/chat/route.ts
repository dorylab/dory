import 'server-only';
import { NextRequest } from 'next/server';
import { convertToModelMessages, type UIMessage, createIdGenerator, stepCountIs } from 'ai';
import { streamText } from '@/lib/ai/gateway';
import { getModelBundle, getProviderModel } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { isMissingAiEnvError } from '@/lib/ai/errors';

import { getSessionFromRequest } from '@/lib/auth/session';
import { getDBService } from '@/lib/database';
import { buildSchemaContext, getDefaultSchemaSampleLimits } from '@/lib/ai/prompts';
import { createSqlRunnerTool } from './sql-runner';
import { createChartBuilderTool } from './chart-builder';
import { MAX_HISTORY_MESSAGES, SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { normalizeMessage } from './utils';
import { newEntityId } from '@/lib/id';
import type { CopilotEnvelopeV1 } from '@/app/(app)/[team]/[connectionId]/chatbot/copilot/types/copilot-envelope';
import { toPromptContext } from '@/app/(app)/[team]/[connectionId]/chatbot/copilot/copilot-envelope';
import { getApiLocale } from '@/app/api/utils/i18n';
import { withUserAndTeamHandler } from '../utils/with-team-handler';

export const runtime = 'nodejs';

export const POST = withUserAndTeamHandler(async ({ req }) => {
    try {
        return await handleChatRequest(req);
    } catch (error) {
        if (isMissingAiEnvError(error)) {
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
    const teamId = session?.user?.defaultTeamId ?? null;
    const connectionId =
        connectionIdFromBody ?? req.headers.get('x-connection-id') ?? null;

    const { model: defaultModel, preset } = getModelBundle('chat');
    const providerModelName = requestedModel || preset.model;
    const model = providerModelName === preset.model ? defaultModel : getProviderModel(providerModelName);
    const compiledSystem = compileSystemPrompt(preset.system);

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

    if (db && userId && teamId) {
        if (tabId) {
            const s = await db.chat.createOrGetCopilotSession({
                teamId,
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
                    teamId,
                    sessionId: chatId,
                    actorUserId: userId,
                });
                if (existed) {
                    sessionTitle = existed.title ?? null;
                } else {
                    const s = await db.chat.createGlobalSession({
                        id: chatId,
                        teamId,
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
                    teamId,
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

    if (db && userId && teamId && connectionId) {
        const defaults = getDefaultSchemaSampleLimits();
        schemaContext = await buildSchemaContext({
            userId,
            teamId,
            datasourceId: connectionId,
            database,
            table,
            tableSampleLimit: defaults.table,
            columnSampleLimit: defaults.column,
        });

        tools.sqlRunner = createSqlRunnerTool({
            userId,
            teamId,
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
        teamId &&
        chatId &&
        currentUserMessage &&
        currentUserMessageId
    ) {
        try {
            await db.chat.appendMessage({
                teamId,
                sessionId: chatId,
                actorUserId: userId,
                message: {
                    id: currentUserMessageId,
                    teamId,
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

    const result = streamText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(4),
        temperature: preset.temperature,
        context: {
            teamId,
            userId,
            feature: 'chat',
            model: providerModelName,
        },
    });

    const response = result.toUIMessageStreamResponse({
        originalMessages: uiMessages,
        generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),

        onFinish: async ({ messages }) => {
            if (!db || !userId || !teamId || !chatId) return;

            try {
                const finishMessages = Array.isArray(messages) ? messages : [];
                const debugInfo = await result.debugReady;

                const newMessages = finishMessages.filter(m => {
                    const id =
                        typeof (m as any)?.id === 'string' && (m as any).id
                            ? (m as any).id
                            : null;
                    return id ? !existedMessageIds.has(id) : true;
                });

                for (const m of newMessages) {
                    const mid =
                        typeof (m as any)?.id === 'string' && (m as any).id
                            ? (m as any).id
                            : newEntityId();
                    const existingMetadata =
                        ((m as any).metadata ?? null) as Record<string, unknown> | null;
                    const enrichedMetadata: Record<string, unknown> = {
                        ...(existingMetadata ?? {}),
                        model: providerModelName,
                        latencyMs:
                            typeof debugInfo.latencyMs === 'number'
                                ? debugInfo.latencyMs
                                : existingMetadata?.latencyMs,
                        tokenUsage: debugInfo.usage ?? existingMetadata?.tokenUsage,
                        requestId: debugInfo.requestId ?? existingMetadata?.requestId,
                    };

                    await db.chat.appendMessage({
                        teamId,
                        sessionId: chatId,
                        actorUserId: userId,
                        message: {
                            id: mid,
                            teamId,
                            sessionId: chatId,
                            userId: null,
                            connectionId: connectionId ?? null,
                            role: m.role as any,
                            parts: ((m as any).parts ?? []) as any,
                            metadata: Object.keys(enrichedMetadata).length ? enrichedMetadata : null,
                            createdAt: new Date(),
                        },
                    });

                    existedMessageIds.add(mid);
                }
            } catch (err) {
                console.error('[chat] persist assistant messages failed', err);
            }
        },
    });

    if (chatId) {
        response.headers.set('x-chat-id', chatId);
    }

    return response;
}
