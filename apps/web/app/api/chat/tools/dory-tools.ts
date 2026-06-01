import { tool } from 'ai';
import type { Locale } from '@dory/i18n/routing';
import type { ActionContext } from '@dory/actions';
import { executeAction } from '@/lib/actions/server/execute';
import { webActionRegistry } from '@/lib/actions/server/registry';
import type { WebActionServices } from '@/lib/actions/server/types';
import { createWebActionAuditSink } from '@/lib/actions/server/action-audit';
import { getDBService } from '@dory/database';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { getRuntimeForServer } from '@dory/shared/runtime';

type CreateDoryChatToolsOptions = {
    userId: string;
    organizationId: string;
    currentConnectionId?: string | null;
    locale?: Locale;
};

const AGENT_SCOPES = ['connections:read', 'schema:read', 'query:read', 'saved_queries:read', 'analysis:run', 'monitoring:read'];

function toChatToolName(actionId: string) {
    return actionId.replace(/[^a-zA-Z0-9_]/g, '_');
}

function toChatToolResult<T extends Record<string, unknown>>(value: T) {
    return {
        ok: true,
        ...value,
    };
}

function toChatToolError(error: unknown) {
    const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    return {
        ok: false,
        error: {
            code: typeof record.code === 'string' ? record.code : 'TOOL_EXECUTION_FAILED',
            message: error instanceof Error ? error.message : String(error ?? 'Tool execution failed'),
        },
    };
}

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
        audit: createWebActionAuditSink(db),
        services: {
            db,
        },
    };
}

async function executeChatAction(options: CreateDoryChatToolsOptions, actionId: string, input: unknown) {
    try {
        const ctx = await createActionContext(options);
        const output = await executeAction<Record<string, unknown>>(ctx, actionId as any, input ?? {});
        return toChatToolResult(output && typeof output === 'object' && !Array.isArray(output) ? output : { data: output });
    } catch (error) {
        return toChatToolError(error);
    }
}

export function createDoryChatTools(options: CreateDoryChatToolsOptions) {
    const entries = webActionRegistry
        .list()
        .filter(action => action.exposure.actors.includes('agent'))
        .filter(action => action.risk !== 'destructive');

    return Object.fromEntries(
        entries.map(action => [
            toChatToolName(action.id),
            tool({
                description: action.exposure.mcp?.description ?? action.id,
                inputSchema: action.inputSchema as any,
                execute: async input => executeChatAction(options, action.id, input),
            }),
        ]),
    );
}
