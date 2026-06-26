import type { Locale } from '@dory/i18n/routing';
import { listMcpActions, type ActionContext } from '@dory/actions';
import { randomUUID } from 'node:crypto';
import { webActionRegistry } from '@/lib/actions/server/registry';
import type { WebActionServices } from '@/lib/actions/server/types';
import { createWebActionAuditSink } from '@/lib/actions/server/action-audit';
import { getDBService } from '@dory/database';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { getRuntimeForServer } from '@dory/shared/runtime';
import { actionToAgentTool, toAgentToolName } from '@/lib/actions/server/adapters/agent';

type CreateDoryChatToolsOptions = {
    userId: string;
    organizationId: string;
    currentConnectionId?: string | null;
    locale?: Locale;
};

const AGENT_SCOPES = ['connections:read', 'schema:read', 'query:read', 'tabs:read', 'tabs:write', 'saved_queries:read', 'saved_queries:write', 'analysis:run', 'monitoring:read'];

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

    return Object.fromEntries(entries.map(tool => [toAgentToolName(tool.action.id), actionToAgentTool(tool.action, () => createActionContext(options))]));
}
