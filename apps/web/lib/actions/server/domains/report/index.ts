import type { ActionContext } from '@dory/actions';
import type { DBService } from '@dory/database';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import { z } from 'zod';

import { emptyWorkContent, publishWorkReport, saveWorkDraft, validateAnalysisScope } from '@/lib/server/work-documents';
import { analysisScopeSchema, workVisualSchema } from '@/lib/work-documents/schema';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import type { WebActionServices } from '../../types';

const contentInput = z.object({
    title: z.string().trim().min(1).max(160),
    body: z.string().max(200000),
    visuals: z
        .array(workVisualSchema)
        .max(100)
        .describe('Component configurations keyed by id. evidenceId must be an actual accessible Artifact ID. Dory creates snapshots; never supply rows or snapshot IDs.'),
});
const documentOutput = z.object({ document: z.object({ id: z.string(), revision: z.number() }).passthrough() });
const owner = (ctx: { organizationId: string; userId: string }) => ({ organizationId: ctx.organizationId, userId: ctx.userId });
function bounded(document: Awaited<ReturnType<DBService['workDocuments']['get']>>) {
    return {
        ...document,
        content: { ...document.content, evidence: document.content.evidence.map(item => ({ ...item, rows: item.rows.slice(0, 10), previewOnly: item.rows.length > 10 })) },
    };
}
function assertScope(ctx: ActionContext<WebActionServices>, scope: AnalysisScope) {
    const allowed = ctx.actor.metadata?.allowedConnectionIds;
    if (Array.isArray(allowed) && scope.connectionIds.some(id => !allowed.includes(id))) throw new DatabaseError('Report is outside the allowed data sources.', 403);
}
async function writableReport(ctx: ActionContext<WebActionServices>, documentId: string) {
    const document = await ctx.services.db.workDocuments.get({ ...owner(ctx), documentId });
    assertScope(ctx, document.scope);
    if (ctx.services.agentTurn) {
        const turn = ctx.services.agentTurn;
        const work = await ctx.services.db.works.assertChatTurn({ ...owner(ctx), workId: turn.workId, requestId: turn.requestId });
        const metadata = work.metadata?.chatTurn as { reportReadOnly?: boolean; reportTarget?: { documentId?: string } } | undefined;
        if (metadata?.reportReadOnly || (metadata?.reportTarget?.documentId && metadata.reportTarget.documentId !== documentId))
            throw new DatabaseError('This turn cannot modify that report.', 403);
    }
    return document;
}
const reportCreate = defineWebAction({
    id: 'report.create',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: contentInput.extend({ requestId: z.string().min(1).max(200), sourceWorkId: z.string().optional(), scope: analysisScopeSchema }),
    outputSchema: documentOutput,
    permissions: writeWorkspace,
    scopes: ['write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_create_report',
        title: 'Create Report',
        description: 'Create an idempotent private report draft in restricted MDX. Use standalone Metric, Chart and DataTable tags with source="visual-id". This does not publish.',
    },
    audit: { allowInputFields: ['requestId', 'sourceWorkId'] },
    handler: async (ctx, input) => {
        if (ctx.services.agentTurn) throw new DatabaseError('Use the turn-bound createWorkReport or dory_finish_work report tool in the built-in Work.', 409);
        const db = ctx.services.db;
        const target = owner(ctx);
        const scope = await validateAnalysisScope(db, target, input.scope);
        assertScope(ctx, scope);
        const run = input.sourceWorkId ? await db.works.getById({ ...target, workId: input.sourceWorkId }) : null;
        if (input.sourceWorkId && !run) throw new DatabaseError('Source Work unavailable.', 404);
        const document = await db.workDocuments.create({
            ...target,
            creationKey: `report:${input.requestId}`,
            title: input.title,
            chatId: typeof run?.metadata?.chatId === 'string' ? run.metadata.chatId : null,
            scope,
            content: { ...emptyWorkContent(), sourceWorkId: input.sourceWorkId },
        });
        assertScope(ctx, document.scope);
        if (document.revision > 1) return { document: bounded(document) };
        return {
            document: bounded(
                await saveWorkDraft(db, {
                    ...target,
                    documentId: document.id,
                    expectedRevision: document.revision,
                    source: 'agent',
                    draft: { title: input.title, markdown: input.body, body: input.body, format: 'restricted-mdx', visuals: input.visuals, status: 'draft' },
                }),
            ),
        };
    },
});
const reportGet = defineWebAction({
    id: 'report.get',
    domain: 'report',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ documentId: z.string().min(1), publicationId: z.string().optional(), revision: z.number().int().positive().optional() }),
    outputSchema: documentOutput,
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_get_report',
        title: 'Read Report',
        description: 'Read a private report, diagnostics, revision and bounded evidence preview. Select a publication or historical revision explicitly.',
    },
    handler: async (ctx, input) => {
        const target = { ...owner(ctx), documentId: input.documentId };
        const document = input.publicationId
            ? await ctx.services.db.workDocuments.getPublication({ ...target, publicationId: input.publicationId })
            : input.revision
              ? await ctx.services.db.workDocuments.getVersion({ ...target, revision: input.revision })
              : await ctx.services.db.workDocuments.get(target);
        assertScope(ctx, document.scope);
        return { document: bounded(document) };
    },
});
const reportUpdate = defineWebAction({
    id: 'report.update',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: contentInput.extend({ documentId: z.string().min(1), expectedRevision: z.number().int().positive() }),
    outputSchema: documentOutput,
    permissions: writeWorkspace,
    scopes: ['write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_update_report',
        title: 'Update Report Draft',
        description: 'Atomically update MDX and component configurations with expectedRevision. Read again on conflict and preserve human edits. Never changes published versions.',
    },
    audit: { allowInputFields: ['documentId', 'expectedRevision'] },
    handler: async (ctx, input) => {
        await writableReport(ctx, input.documentId);
        return {
            document: bounded(
                await saveWorkDraft(ctx.services.db, {
                    ...owner(ctx),
                    documentId: input.documentId,
                    expectedRevision: input.expectedRevision,
                    source: 'user',
                    draft: { title: input.title, markdown: input.body, body: input.body, format: 'restricted-mdx', visuals: input.visuals, status: 'draft' },
                }),
            ),
        };
    },
});
const reportPublish = defineWebAction({
    id: 'report.publish',
    domain: 'report',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: z.object({ documentId: z.string().min(1), expectedRevision: z.number().int().positive(), requestId: z.string().min(1).max(200) }),
    outputSchema: documentOutput,
    permissions: writeWorkspace,
    scopes: ['write'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_publish_report',
        title: 'Publish Report',
        description:
            'Freeze an immutable report version only when the user explicitly requests publication. Generating or completing a report does not authorize publication. Retry with the same requestId and revision.',
    },
    audit: { allowInputFields: ['documentId', 'expectedRevision', 'requestId'] },
    handler: async (ctx, input) => {
        await writableReport(ctx, input.documentId);
        if (ctx.services.agentTurn) {
            const { workId, requestId } = ctx.services.agentTurn;
            const work = await ctx.services.db.works.assertChatTurn({ ...owner(ctx), workId, requestId });
            if (!(work.metadata?.chatTurn as { reportPublishAllowed?: boolean } | undefined)?.reportPublishAllowed)
                throw new DatabaseError('Publication requires an explicit user request.', 403);
        }
        return { document: bounded(await publishWorkReport(ctx.services.db, { ...owner(ctx), ...input })) };
    },
});
export const reportActions = [reportCreate, reportGet, reportUpdate, reportPublish];
