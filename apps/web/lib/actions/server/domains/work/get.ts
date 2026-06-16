import { z } from 'zod';
import { buildWorkRunTimelines, buildWorkTimelineEvents } from '@/lib/work/timeline';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import {
    workInvestigationDetailOutputSchema,
    workOutputSchema,
    workRunEventOutputSchema,
    workRunOutputSchema,
    workRunTimelineOutputSchema,
    workTimelineEventOutputSchema,
} from './schemas';

type InvestigationDetail = z.infer<typeof workInvestigationDetailOutputSchema>;

function activeInvestigationScore(investigation: InvestigationDetail) {
    return investigation.findings.length * 100 + investigation.sqlAssetCount * 10 + (investigation.lastQueryAt ? 1 : 0);
}

function selectVisibleInvestigationDetails(investigations: InvestigationDetail[]) {
    if (investigations.length <= 5) return investigations;

    return [...investigations]
        .sort((a, b) => {
            const scoreDiff = activeInvestigationScore(b) - activeInvestigationScore(a);
            if (scoreDiff !== 0) return scoreDiff;
            return b.updatedAt.getTime() - a.updatedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime();
        })
        .slice(0, 5)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
}

export const workGetAction = defineWebAction({
    id: 'work.get',
    domain: 'work',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ id: z.string().min(1) }),
    outputSchema: z.object({
        work: workOutputSchema,
        investigations: z.array(workInvestigationDetailOutputSchema),
        runs: z.array(workRunOutputSchema),
        latestRun: workRunOutputSchema.nullable(),
        latestRunEvents: z.array(workRunEventOutputSchema),
        runTimelines: z.array(workRunTimelineOutputSchema),
        timelineEvents: z.array(workTimelineEventOutputSchema),
        unlinkedTimelineEvents: z.array(workTimelineEventOutputSchema),
    }),
    permissions: readWorkspace,
    scopes: ['works:read'],
    actors: ['user', 'agent', 'automation'],
    handler: async (ctx, input) => {
        const work = await ctx.services.db.works.getById({ organizationId: ctx.organizationId, id: input.id });
        if (!work) throw new Error('Work not found.');
        const investigations = await ctx.services.db.works.listInvestigations({ organizationId: ctx.organizationId, workId: input.id });
        const findings = await ctx.services.db.works.listFindingsForWork({ organizationId: ctx.organizationId, workId: input.id });
        const revisions = await ctx.services.db.works.listInvestigationRevisions({ organizationId: ctx.organizationId, workId: input.id });
        const allRunEvents = await ctx.services.db.works.listRunEvents({ organizationId: ctx.organizationId, workId: input.id });
        const workspaceSnapshots = await ctx.services.db.works.listWorkspaceSnapshots({ organizationId: ctx.organizationId, workId: input.id });
        const findingsByInvestigationId = new Map<string, typeof findings>();
        for (const finding of findings) {
            const existing = findingsByInvestigationId.get(finding.investigationId) ?? [];
            existing.push(finding);
            findingsByInvestigationId.set(finding.investigationId, existing);
        }
        const currentRevisionById = new Map(revisions.map(revision => [revision.id, revision]));
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
            sqlAssetCount: Math.max(sqlAssetCountByInvestigationId.get(investigation.id) ?? 0, investigation.linkedTabId ? 1 : 0),
            currentRevision: investigation.currentRevisionId ? (currentRevisionById.get(investigation.currentRevisionId) ?? null) : null,
        }));
        const runs = await ctx.services.db.works.listRuns({ organizationId: ctx.organizationId, workId: input.id });
        const latestRun = runs[0] ?? null;
        const latestRunEvents = latestRun ? allRunEvents.filter(event => event.runId === latestRun.id) : [];
        const { runTimelines, unlinkedTimelineEvents } = buildWorkRunTimelines({
            runs,
            runEvents: allRunEvents,
            workspaceSnapshots,
        });
        const timelineEvents = buildWorkTimelineEvents({
            runEvents: allRunEvents,
            workspaceSnapshots,
        });

        return {
            work,
            investigations: selectVisibleInvestigationDetails(investigationDetails),
            runs,
            latestRun,
            latestRunEvents,
            runTimelines,
            timelineEvents,
            unlinkedTimelineEvents,
        };
    },
});
