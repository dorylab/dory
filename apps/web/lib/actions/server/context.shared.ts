import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { getDBService } from '@dory/database';
import type { ActionActorType, ActionContext } from '@dory/actions';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { getRuntimeForServer } from '@dory/shared/runtime';
import { getApiLocale } from '@/app/api/utils/i18n';
import type { McpAuthContext } from '@/lib/server/mcp/auth';
import type { OrganizationAccess } from '@/lib/server/authz/types';
import { createWebActionAuditSink } from './action-audit';
import type { WebActionServices } from './types';

export const TRUSTED_USER_SCOPES = [
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

export const AGENT_SCOPES = [
    'connections:read',
    'schema:read',
    'query:read',
    'tabs:read',
    'tabs:write',
    'saved_queries:read',
    'saved_queries:write',
    'analysis:run',
    'monitoring:read',
];

export type ActionRequestBody = {
    actionId?: string;
    input?: unknown;
    confirmationToken?: string | null;
    reason?: string | null;
    organizationId?: string;
    currentConnectionId?: string | null;
};

export type ResolvedActionRequest = {
    ctx: ActionContext<WebActionServices>;
    body: ActionRequestBody;
};

export function scopesForActor(actorType: ActionActorType, requestedScopes?: string[] | null) {
    if (requestedScopes?.length) return requestedScopes;
    if (actorType === 'agent') return AGENT_SCOPES;
    return TRUSTED_USER_SCOPES;
}

export async function parseActionRequestBody(req: NextRequest): Promise<ActionRequestBody> {
    return (await req.json().catch(() => ({}))) as ActionRequestBody;
}

export async function createUserActionContext(options: {
    req: NextRequest;
    body: ActionRequestBody;
    userId: string;
    organizationId: string;
    access: OrganizationAccess;
}): Promise<ActionContext<WebActionServices>> {
    const actorType: ActionActorType = 'user';
    const db = await getDBService();
    const locale = await getApiLocale();
    const currentConnectionId = options.body.currentConnectionId ?? options.req.headers.get(X_CONNECTION_ID_KEY) ?? options.req.headers.get(X_CONNECTION_ID_KEY.toLowerCase());

    return {
        organizationId: options.organizationId,
        userId: options.userId,
        access: options.access,
        actor: {
            type: actorType,
            scopes: scopesForActor(actorType),
            id: options.userId,
        },
        runtime: getRuntimeForServer(),
        locale,
        currentConnectionId,
        requestId: options.req.headers.get('x-request-id') ?? randomUUID(),
        audit: createWebActionAuditSink(db),
        services: { db, req: options.req },
    };
}

export async function createMcpActionContextFromAuth(context: McpAuthContext): Promise<ActionContext<WebActionServices>> {
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
        services: { db, requestOrigin: context.requestOrigin ?? null, workspaceOrigin: context.workspaceOrigin ?? null },
    };
}
