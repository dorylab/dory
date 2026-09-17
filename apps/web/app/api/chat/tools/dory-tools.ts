import type { Locale } from '@dory/i18n/routing';
import { listMcpActions, type ActionContext } from '@dory/actions';
import { tool } from 'ai';
import { randomUUID } from 'node:crypto';
import { webActionRegistry } from '@/lib/actions/server/registry';
import type { WebActionServices } from '@/lib/actions/server/types';
import { createWebActionAuditSink } from '@/lib/actions/server/action-audit';
import { getDBService } from '@dory/database';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { getRuntimeForServer } from '@dory/shared/runtime';
import { actionToAgentTool, toAgentToolName } from '@/lib/actions/server/adapters/agent';
import { executeAction } from '@/lib/actions/server/execute';

type CreateDoryChatToolsOptions = {
    userId: string;
    organizationId: string;
    currentConnectionId?: string | null;
    locale?: Locale;
    chatId: string;
};

const AGENT_SCOPES = [
    'connections:read',
    'schema:read',
    'query:read',
    'tabs:read',
    'tabs:write',
    'saved_queries:read',
    'saved_queries:write',
    'analysis:run',
    'monitoring:read',
    'comparisons:read',
    'comparisons:write',
    'knowledge:read',
    'assets:read',
];

async function createActionContext(options: CreateDoryChatToolsOptions): Promise<ActionContext<WebActionServices>> {
    const access = await resolveOrganizationAccess(options.organizationId, options.userId);
    if (!access?.isMember) {
        throw new Error('User does not have access to this organization.');
    }

    const db = await getDBService();

    return {
        organizationId: options.organizationId,
        userId: options.userId,
        currentConnectionId: options.currentConnectionId ?? null,
        locale: options.locale,
        runtime: getRuntimeForServer(),
        access,
        actor: {
            type: 'agent',
            scopes: AGENT_SCOPES,
            id: options.userId,
        },
        requestId: randomUUID(),
        audit: createWebActionAuditSink(db),
        services: {
            db,
        },
    };
}

export function createDoryChatTools(options: CreateDoryChatToolsOptions) {
    const entries = listMcpActions(webActionRegistry as any, 'agent');
    return Object.fromEntries(
        entries.map(entry => {
            if (entry.action.id !== 'catalog.search' && entry.action.id !== 'catalog.read') {
                return [toAgentToolName(entry.action.id), actionToAgentTool(entry.action, () => createActionContext(options))];
            }
            return [
                toAgentToolName(entry.action.id),
                tool({
                    description: entry.description,
                    inputSchema: entry.inputSchema as any,
                    execute: async input => {
                        const ctx = await createActionContext(options);
                        const work = await ctx.services.db.works.resolve({
                            organizationId: ctx.organizationId,
                            userId: ctx.userId,
                            tokenId: null,
                            connectionId: options.currentConnectionId ?? null,
                            externalSessionId: `chat:${options.chatId}`,
                            title: 'Chat Agent Run',
                            metadata: { chatId: options.chatId, source: 'internal_chat' },
                        });
                        const startedAt = performance.now();
                        try {
                            const result = await executeAction<Record<string, unknown>>(ctx, entry.action.id, input ?? {});
                            if (entry.action.id === 'catalog.read') {
                                const asset = result.data.asset as Record<string, unknown>;
                                await ctx.services.db.works.recordAgentAssetUsageEvent(
                                    {
                                        workId: work.workId,
                                        organizationId: ctx.organizationId,
                                        userId: ctx.userId,
                                        assetKind: asset.kind as 'artifact' | 'knowledge_definition' | 'verified_query' | 'knowledge_source',
                                        assetRef: String(asset.ref),
                                        revision: String(asset.revision),
                                        assetSnapshot: {
                                            title: asset.title,
                                            deepLink: asset.deepLink,
                                            knowledgeModelId: asset.knowledgeModelId,
                                            knowledgeModelName: asset.knowledgeModelName,
                                            trustLevel: asset.trustLevel,
                                        },
                                    },
                                    {
                                        tokenId: null,
                                        connectionId: work.connectionId,
                                        toolName: 'read_asset',
                                        actionId: entry.action.id,
                                        status: 'success',
                                        inputSummary: { ref: (input as { ref?: string }).ref ?? null },
                                        outputSummary: { kind: asset.kind, ref: asset.ref, revision: asset.revision },
                                        durationMs: performance.now() - startedAt,
                                    },
                                );
                            } else {
                                await ctx.services.db.works.recordEvent({
                                    workId: work.workId,
                                    organizationId: ctx.organizationId,
                                    userId: ctx.userId,
                                    tokenId: null,
                                    connectionId: work.connectionId,
                                    toolName: 'search_assets',
                                    actionId: entry.action.id,
                                    status: 'success',
                                    inputSummary: { query: (input as { query?: string }).query ?? null },
                                    outputSummary: { resultCount: Array.isArray(result.data.assets) ? result.data.assets.length : 0 },
                                    durationMs: performance.now() - startedAt,
                                });
                            }
                            return { ok: true, ...result.data, work: { workId: work.workId } };
                        } catch (error) {
                            await ctx.services.db.works.recordEvent({
                                workId: work.workId,
                                organizationId: ctx.organizationId,
                                userId: ctx.userId,
                                tokenId: null,
                                connectionId: work.connectionId,
                                toolName: entry.action.id === 'catalog.read' ? 'read_asset' : 'search_assets',
                                actionId: entry.action.id,
                                status: 'error',
                                inputSummary: null,
                                errorCode: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'TOOL_EXECUTION_FAILED',
                                errorMessage: error instanceof Error ? error.message : 'Tool execution failed',
                                durationMs: performance.now() - startedAt,
                            });
                            return { ok: false, error: { code: 'TOOL_EXECUTION_FAILED', message: error instanceof Error ? error.message : 'Tool execution failed' } };
                        }
                    },
                }),
            ];
        }),
    );
}
