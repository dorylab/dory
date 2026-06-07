import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { workInvestigationOutputSchema, workOutputSchema, workRunEventOutputSchema, workRunOutputSchema } from './schemas';

export const workGetAction = defineWebAction({
    id: 'work.get',
    domain: 'work',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: z.object({
        work: workOutputSchema,
        investigations: z.array(workInvestigationOutputSchema),
        latestRun: workRunOutputSchema.nullable(),
        latestRunEvents: z.array(workRunEventOutputSchema),
    }),
    permissions: readWorkspace,
    scopes: ['works:read'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => {
        const work = await ctx.services.db.works.getById({ organizationId: ctx.organizationId, id: input.id });
        if (!work) throw new Error('Work not found.');
        const investigations = await ctx.services.db.works.listInvestigations({ organizationId: ctx.organizationId, workId: input.id });
        const runs = await ctx.services.db.works.listRuns({ organizationId: ctx.organizationId, workId: input.id, limit: 1 });
        const latestRun = runs[0] ?? null;
        const latestRunEvents = latestRun
            ? await ctx.services.db.works.listRunEvents({
                  organizationId: ctx.organizationId,
                  workId: input.id,
                  runId: latestRun.id,
              })
            : [];
        return { work, investigations, latestRun, latestRunEvents };
    },
});
