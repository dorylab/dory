import type { Locale } from '@dory/i18n/routing';
import type { ActionContext } from '@dory/actions';
import { randomUUID } from 'node:crypto';
import { webActionRegistry } from '@/lib/actions/server/registry';
import type { WebActionServices } from '@/lib/actions/server/types';
import { createWebActionAuditSink } from '@/lib/actions/server/action-audit';
import { getDBService } from '@dory/database';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { getRuntimeForServer } from '@dory/shared/runtime';
import { actionToAgentTool, toAgentToolName } from '@/lib/actions/server/adapters/agent';
import { AGENT_SCOPES } from '@/lib/actions/server/context.shared';

type CreateDoryChatToolsOptions = {
    userId: string;
    organizationId: string;
    currentConnectionId?: string | null;
    locale?: Locale;
};

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
    const entries = webActionRegistry
        .list()
        .filter(action => action.exposure.actors.includes('agent'))
        .filter(action => action.risk !== 'destructive');

    return Object.fromEntries(entries.map(action => [toAgentToolName(action.id), actionToAgentTool(action, () => createActionContext(options))]));
}
