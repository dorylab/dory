import { z } from 'zod';
import type { ActionIntent } from '@/lib/copilot/action/types';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

export const aiQuickActions = (['fix-sql-error', 'optimize-performance', 'rewrite-sql', 'to-aggregation'] as ActionIntent[]).map(intent =>
    defineWebAction<any, any>({
        id: `ai.${intent}` as const,
        domain: 'ai',
        kind: 'command',
        risk: 'low',
        inputSchema: z.object({ input: z.any(), model: z.string().nullable().optional() }),
        outputSchema: unknownOutputSchema,
        permissions: readWorkspace,
        scopes: ['analysis:run'],
        actors: ['user', 'agent', 'automation'],
        handler: async (ctx, input) => {
            const { runQuickActionServer } = await import('@/lib/copilot/action/server/runQuickActionServer');
            return runQuickActionServer(
                intent,
                { ...input.input, model: input.model ?? input.input?.model ?? null },
                { locale: ctx.locale as any, organizationId: ctx.organizationId, userId: ctx.userId },
            );
        },
    }),
);
