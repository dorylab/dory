import { z } from 'zod';

import { documentGenerationExecutionContext, getDocumentGenerationRunner } from '@/lib/server/knowledge-document-generation-worker';
import { defineWebAction } from '../../define-web-action';
import { readConnection, writeWorkspace } from '../../policies';
import { documentGenerationInputSchema } from './document-generation';

const id = z.string().uuid();
const taskInput = documentGenerationInputSchema.extend({ id, submissionId: id, folderId: z.string().min(1).max(512).nullable() });
const draftFile = z.object({
    fileName: z.string(),
    contentText: z.string(),
    proof: z.string(),
    evidence: z.object({
        database: z.string(),
        tables: z.array(z.object({ name: z.string(), digest: z.string() })),
        references: z.array(z.object({ kind: z.enum(['query', 'document']), id: z.string() })),
    }),
});
const summary = z.object({
    id,
    knowledgeModelId: z.string(),
    modelName: z.string(),
    database: z.string(),
    folderId: z.string().nullable(),
    folderName: z.string().nullable(),
    status: z.enum(['queued', 'running', 'ready', 'failed', 'saved']),
    phase: z.enum(['queued', 'reading', 'organizing', 'validating', 'ready', 'failed', 'saved']),
    completedTables: z.number(),
    totalTables: z.number(),
    error: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    documents: z.array(z.object({ id: z.string(), folderId: z.string() })),
});
const detail = summary.extend({
    input: documentGenerationInputSchema,
    draft: z.object({ topics: z.array(z.object({ name: z.string(), documents: z.array(draftFile) })), failedTables: z.array(z.string()) }).nullable(),
});

export const documentGenerationTaskActions = [
    ...(['create', 'retry'] as const).map(operation =>
        defineWebAction({
            id: operation === 'create' ? 'knowledge.createDocumentGenerationTask' : 'knowledge.retryDocumentGenerationTask',
            domain: 'knowledge',
            kind: 'command',
            risk: 'write',
            requiresConfirmation: false,
            actors: ['user'],
            permissions: [...readConnection, ...writeWorkspace],
            scopes: ['knowledge:write', 'schema:read', 'analysis:run'],
            inputSchema: taskInput,
            outputSchema: detail,
            handler: async (ctx, { id, submissionId, folderId, ...input }) => {
                await ctx.services.db.knowledge.documentGenerationContext({ ...input, organizationId: ctx.organizationId });
                const executionContext = await documentGenerationExecutionContext(ctx.services.db, ctx.organizationId, ctx.services.req);
                const task = await ctx.services.db.knowledge.documentGeneration.enqueue({
                    id,
                    submissionId,
                    input,
                    folderId,
                    executionContext,
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                    retry: operation === 'retry',
                });
                getDocumentGenerationRunner(ctx.services.db).wake();
                return task;
            },
        }),
    ),
    defineWebAction({
        id: 'knowledge.listDocumentGenerationTasks',
        domain: 'knowledge',
        kind: 'query',
        risk: 'read',
        actors: ['user'],
        permissions: readConnection,
        scopes: ['knowledge:read'],
        inputSchema: z.object({}),
        outputSchema: z.object({ tasks: z.array(summary) }),
        handler: async ctx => ({ tasks: await ctx.services.db.knowledge.documentGeneration.list({ organizationId: ctx.organizationId, userId: ctx.userId }) }),
    }),
    defineWebAction({
        id: 'knowledge.getDocumentGenerationTask',
        domain: 'knowledge',
        kind: 'query',
        risk: 'read',
        actors: ['user'],
        permissions: readConnection,
        scopes: ['knowledge:read'],
        inputSchema: z.object({ id }),
        outputSchema: detail,
        handler: async (ctx, input) => {
            const task = await ctx.services.db.knowledge.documentGeneration.get({ ...input, organizationId: ctx.organizationId, userId: ctx.userId });
            await ctx.services.db.knowledge.documentGenerationContext({
                organizationId: ctx.organizationId,
                knowledgeModelId: task.knowledgeModelId,
                connectionId: task.input.connectionId,
                documentIds: [],
                queryIds: [],
            });
            return task;
        },
    }),
];
