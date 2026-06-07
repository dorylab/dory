import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { workInvestigationDetailOutputSchema, workOutputSchema, workRunEventOutputSchema, workRunOutputSchema } from './schemas';

export const workGetAction = defineWebAction({
    id: 'work.get',
    domain: 'work',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: z.object({
        work: workOutputSchema,
        investigations: z.array(workInvestigationDetailOutputSchema),
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
        const findings = await ctx.services.db.works.listFindingsForWork({ organizationId: ctx.organizationId, workId: input.id });
        const allRunEvents = await ctx.services.db.works.listRunEvents({ organizationId: ctx.organizationId, workId: input.id });
        const findingsByInvestigationId = new Map<string, typeof findings>();
        for (const finding of findings) {
            const existing = findingsByInvestigationId.get(finding.investigationId) ?? [];
            existing.push(finding);
            findingsByInvestigationId.set(finding.investigationId, existing);
        }
        const sqlAssetCountByInvestigationId = new Map<string, number>();
        for (const event of allRunEvents) {
            if (event.type !== 'sql_executed') continue;
            const investigationId = event.payload?.investigationId;
            if (typeof investigationId !== 'string' || !investigationId) continue;
            sqlAssetCountByInvestigationId.set(investigationId, (sqlAssetCountByInvestigationId.get(investigationId) ?? 0) + 1);
        }
        const investigationDetails = investigations.map(investigation => ({
            ...investigation,
            findings: findingsByInvestigationId.get(investigation.id) ?? [],
            sqlAssetCount: sqlAssetCountByInvestigationId.get(investigation.id) ?? 0,
        }));
        const runs = await ctx.services.db.works.listRuns({ organizationId: ctx.organizationId, workId: input.id, limit: 1 });
        const latestRun = runs[0] ?? null;
        const latestRunEvents = latestRun
            ? await ctx.services.db.works.listRunEvents({
                  organizationId: ctx.organizationId,
                  workId: input.id,
                  runId: latestRun.id,
              })
            : [];
        return { work, investigations: investigationDetails, latestRun, latestRunEvents };
    },
});
