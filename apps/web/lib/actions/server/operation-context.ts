import type { ActionContext } from '@dory/actions';
import type { QuerySource } from '@dory/shared/types/audit';
import type { WebActionServices } from './types';
import { querySources } from './schemas';

export function isQuerySource(value?: string | null): value is QuerySource {
    return Boolean(value && querySources.includes(value as QuerySource));
}

export const actionOperationContext = (ctx: ActionContext<WebActionServices>, auditSource?: QuerySource) => ({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    currentConnectionId: ctx.currentConnectionId ?? null,
    locale: ctx.locale as any,
    restrictToCurrentConnection: ctx.actor.type === 'agent',
    auditSource: auditSource ?? (isQuerySource(ctx.auditSource) ? ctx.auditSource : undefined),
    actionRunId: ctx.actionRunId ?? null,
    requestId: ctx.requestId ?? null,
});

export function actorAuditSource(ctx: { actor: { type: string } }, fallback: QuerySource): QuerySource {
    if (ctx.actor.type === 'mcp') return 'mcp_schema_metadata';
    if (ctx.actor.type === 'automation') return 'automation_schema_metadata';
    if (ctx.actor.type === 'agent') return 'ai_schema_metadata';
    return fallback;
}

export function resolveConnectionId(ctx: { currentConnectionId?: string | null }, input: { connectionId?: string | null }) {
    const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
    if (!connectionId) throw new Error('Missing connectionId.');
    return connectionId;
}
