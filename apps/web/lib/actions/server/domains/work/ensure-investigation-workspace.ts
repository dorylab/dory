import { z } from 'zod';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { createWorkspaceTab } from '../../workspace-tabs';
import { investigationWorkspaceContent } from './create-investigation';
import { workInvestigationOutputSchema } from './schemas';

export const workEnsureInvestigationWorkspaceAction = defineWebAction({
    id: 'work.ensureInvestigationWorkspace',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:update', 'tab:create'],
    inputSchema: z.object({
        workId: z.string().min(1),
        investigationId: z.string().min(1),
    }),
    outputSchema: workInvestigationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write', 'tabs:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'investigationId'],
        resource: (_ctx, input) => ({ type: 'work_investigation', id: input.investigationId, metadata: { workId: input.workId } }),
    },
    handler: async (ctx, input) => {
        const work = await ctx.services.db.works.getById({ organizationId: ctx.organizationId, id: input.workId });
        if (!work) throw new Error('Work not found.');

        const investigation = await ctx.services.db.works.getInvestigationById({
            organizationId: ctx.organizationId,
            workId: work.id,
            id: input.investigationId,
        });
        if (!investigation) throw new Error('Work investigation not found.');
        if (investigation.linkedTabId) return investigation;

        const tab = await createWorkspaceTab(ctx, {
            connectionId: work.connectionId,
            tabType: 'sql',
            tabName: investigation.title,
            content: investigationWorkspaceContent({
                workTitle: work.title,
                goal: work.goal,
                investigationTitle: investigation.title,
            }),
            workspaceScope: {
                type: 'work_investigation',
                workId: work.id,
                investigationId: investigation.id,
            },
            resultMeta: {
                workId: work.id,
                investigationId: investigation.id,
                source: 'work-investigation',
            },
        });

        return ctx.services.db.works.updateInvestigation({
            organizationId: ctx.organizationId,
            workId: work.id,
            id: investigation.id,
            patch: {
                linkedTabId: tab.tabId,
            },
        });
    },
});
