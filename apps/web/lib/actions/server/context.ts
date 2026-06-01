import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { getDBService } from '@dory/database';
import type { ActionActorType, ActionContext } from '@dory/actions';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { getSessionFromRequest } from '@/lib/auth/session';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { getRuntimeForServer } from '@dory/shared/runtime';
import { getApiLocale } from '@/app/api/utils/i18n';
import type { McpAuthContext } from '@/lib/server/mcp/auth';
import { createWebActionAuditSink } from './action-audit';
import type { WebActionServices } from './types';

const TRUSTED_USER_SCOPES = [
    'connections:read',
    'connections:write',
    'schema:read',
    'query:read',
    'query:write',
    'tabs:read',
    'tabs:write',
    'saved_queries:read',
    'saved_queries:write',
    'analysis:run',
    'monitoring:read',
    'action:destructive',
];

const AGENT_SCOPES = ['connections:read', 'schema:read', 'query:read', 'saved_queries:read', 'analysis:run', 'monitoring:read'];

export type ResolvedActionRequest = {
    ctx: ActionContext<WebActionServices>;
    body: {
        actionId?: string;
        input?: unknown;
        confirmationToken?: string | null;
        reason?: string | null;
    };
};

function scopesForActor(actorType: ActionActorType, requestedScopes?: string[] | null) {
    if (requestedScopes?.length) return requestedScopes;
    if (actorType === 'agent') return AGENT_SCOPES;
    return TRUSTED_USER_SCOPES;
}

export async function resolveActionRequest(req: NextRequest): Promise<ResolvedActionRequest> {
    const body = (await req.json().catch(() => ({}))) as ResolvedActionRequest['body'] & {
        organizationId?: string;
        currentConnectionId?: string | null;
    };
    const session = await getSessionFromRequest(req);
    const userId = session?.user?.id ?? null;

    if (!userId) {
        throw Object.assign(new Error('Unauthorized'), { status: 401, code: 'UNAUTHORIZED' });
    }

    const organizationId = body.organizationId ?? resolveCurrentOrganizationId(session);
    if (!organizationId) {
        throw Object.assign(new Error('Missing organization context.'), { status: 401, code: 'MISSING_ORGANIZATION_CONTEXT' });
    }

    const access = await resolveOrganizationAccess(organizationId, userId);
    if (!access?.isMember) {
        throw Object.assign(new Error('Forbidden'), { status: 403, code: 'FORBIDDEN' });
    }

    const actorType: ActionActorType = 'user';
    const db = await getDBService();
    const locale = await getApiLocale();
    const currentConnectionId = body.currentConnectionId ?? req.headers.get(X_CONNECTION_ID_KEY) ?? req.headers.get(X_CONNECTION_ID_KEY.toLowerCase());

    return {
        body,
        ctx: {
            organizationId,
            userId,
            access,
            actor: {
                type: actorType,
                scopes: scopesForActor(actorType),
                id: userId,
            },
            runtime: getRuntimeForServer(),
            locale,
            currentConnectionId,
            requestId: req.headers.get('x-request-id') ?? randomUUID(),
            audit: createWebActionAuditSink(db),
            services: { db },
        },
    };
}

export async function createMcpActionContext(context: McpAuthContext): Promise<ActionContext<WebActionServices>> {
    const db = await getDBService();
    return {
        organizationId: context.organizationId,
        userId: context.userId,
        access: context.access,
        actor: {
            type: 'mcp',
            scopes: context.scopes,
            id: context.tokenId,
        },
        runtime: getRuntimeForServer(),
        locale: null,
        currentConnectionId: null,
        requestId: randomUUID(),
        audit: createWebActionAuditSink(db),
        services: { db },
    };
}
