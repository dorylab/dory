import { z } from 'zod';
import type { QuerySource, QueryStatus } from '@dory/shared/types/audit';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { querySources, queryStatuses, unknownOutputSchema } from '../../schemas';

export const queryAuditSearchAction = defineWebAction({
    id: 'query.auditSearch',
    domain: 'query',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        sources: z.array(z.enum(querySources as [QuerySource, ...QuerySource[]])).optional(),
        statuses: z.array(z.enum(queryStatuses as [QueryStatus, ...QueryStatus[]])).optional(),
        userId: z.string().optional(),
        connectionId: z.string().optional(),
        databaseName: z.string().optional(),
        chatId: z.string().optional(),
        q: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
        offset: z.number().int().min(0).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user', 'agent', 'automation'],
    handler: (ctx, input) =>
        ctx.services.db.audit.search({
            organizationId: ctx.organizationId,
            from: input.from,
            to: input.to,
            sources: input.sources,
            statuses: input.statuses,
            userId: input.userId,
            connectionId: input.connectionId,
            databaseName: input.databaseName,
            chatId: input.chatId,
            q: input.q,
            cursor: input.cursor,
            limit: input.limit ?? 50,
            offset: input.offset,
        }),
});
