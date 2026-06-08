import { z } from 'zod';
import { newEntityId } from '@dory/shared/id';
import { defineWebAction } from '../../define-web-action';
import { writeWorkspace } from '../../policies';
import { createWorkspaceTab } from '../../workspace-tabs';
import { workInvestigationOutputSchema } from './schemas';

function sqlCommentLines(value: string) {
    return value
        .split(/\r?\n/)
        .map(line => `-- ${line}`)
        .join('\n');
}

export function investigationWorkspaceContent(input: { workTitle: string; goal: string; investigationTitle: string; sql?: string | null }) {
    return [
        `-- Work: ${input.workTitle}`,
        '-- Goal:',
        sqlCommentLines(input.goal),
        `-- Investigation: ${input.investigationTitle}`,
        '',
        input.sql?.trim() ?? '',
    ].join('\n');
}

export const workCreateInvestigationAction = defineWebAction({
    id: 'work.createInvestigation',
    domain: 'work',
    kind: 'command',
    risk: 'low',
    effects: ['work:investigation:create'],
    inputSchema: z.object({
        workId: z.string().min(1),
        title: z.string().trim().min(1),
        linkedTabId: z.string().min(1).nullable().optional(),
    }),
    outputSchema: workInvestigationOutputSchema,
    permissions: writeWorkspace,
    scopes: ['works:write'],
    actors: ['user', 'agent', 'automation'],
    audit: {
        allowInputFields: ['workId', 'title', 'linkedTabId'],
        resource: (_ctx, input) => ({ type: 'work', id: input.workId }),
    },
    handler: async (ctx, input) => {
        const work = await ctx.services.db.works.getById({ organizationId: ctx.organizationId, id: input.workId });
        if (!work) throw new Error('Work not found.');
        const investigationId = newEntityId();
        const linkedTabId =
            input.linkedTabId ??
            (
                await createWorkspaceTab(ctx, {
                    connectionId: work.connectionId,
                    tabType: 'sql',
                    tabName: input.title,
                    content: investigationWorkspaceContent({
                        workTitle: work.title,
                        goal: work.goal,
                        investigationTitle: input.title,
                    }),
                    workspaceScope: {
                        type: 'work_investigation',
                        workId: work.id,
                        investigationId,
                    },
                    resultMeta: {
                        workId: work.id,
                        investigationId,
                        source: 'work-investigation',
                    },
                })
            ).tabId;

        return ctx.services.db.works.createInvestigation({
            id: investigationId,
            workId: work.id,
            organizationId: ctx.organizationId,
            connectionId: work.connectionId,
            title: input.title,
            linkedTabId,
        });
    },
});
