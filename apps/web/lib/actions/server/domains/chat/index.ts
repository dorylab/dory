import { z } from 'zod';

import { chartPresentationSchema } from '@/lib/charts/schema';

import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';

export const chatChartUpdateAction = defineWebAction({
    id: 'chat.chart.update',
    domain: 'chat',
    kind: 'command',
    risk: 'low',
    desktopAuth: 'local-workspace',
    actors: ['user'],
    permissions: writeWorkspace,
    inputSchema: z
        .object({
            sessionId: z.string().min(1),
            messageId: z.string().min(1),
            toolCallId: z.string().min(1),
            expectedVersion: z.number().int().nonnegative(),
            presentation: chartPresentationSchema.nullable(),
        })
        .strict(),
    outputSchema: z.object({ version: z.number().int(), presentation: chartPresentationSchema.nullable() }),
    handler: (ctx, input) => ctx.services.db.chat.updateChartPresentation({ organizationId: ctx.organizationId, userId: ctx.userId, ...input }),
});
export const chatActions = [chatChartUpdateAction];
