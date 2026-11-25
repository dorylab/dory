import { decrypt } from '@dory/shared/utils/crypto';
import { z } from 'zod';
import { draftDigest, generateDocumentDraft } from '@/lib/server/knowledge-document-generation';
import { defineWebAction } from '../../define-web-action';
import { readConnection, writeWorkspace } from '../../policies';

const id = z.string().min(1).max(512);
const scope = z.object({ knowledgeModelId: id, connectionId: id });
const ids = z.array(id).max(10);
const evidence = z.object({
    database: id,
    tables: z
        .array(z.object({ name: id, digest: z.string().regex(/^[a-f0-9]{64}$/) }))
        .min(1)
        .max(20),
    references: z.array(z.object({ kind: z.enum(['query', 'document']), id })).max(20),
});
const topic = z.object({
    name: z.string().trim().min(1).max(240),
    documents: z
        .array(z.object({ fileName: z.string().trim().min(1).max(240), contentText: z.string().min(1).max(2_000_000), proof: z.string().min(1).max(512), evidence }))
        .min(1)
        .max(60),
});
export const documentGenerationInputSchema = scope.extend({
    database: id,
    tables: z.array(id).min(1).max(20),
    prompt: z.string().max(4000),
    documentIds: ids,
    queryIds: ids,
    locale: z.enum(['zh', 'en', 'ja', 'es']),
});
const generate = defineWebAction({
    id: 'knowledge.generateDocumentDraft',
    domain: 'knowledge',
    kind: 'query',
    risk: 'low',
    actors: ['user'],
    permissions: readConnection,
    scopes: ['knowledge:read', 'schema:read', 'analysis:run'],
    inputSchema: documentGenerationInputSchema,
    outputSchema: z.object({ topics: z.array(topic), failedTables: z.array(z.string()) }),
    handler: async (ctx, input) => {
        return generateDocumentDraft(
            { db: ctx.services.db, organizationId: ctx.organizationId, userId: ctx.userId, req: ctx.services.req, actionRunId: ctx.actionRunId, requestId: ctx.requestId },
            input,
        );
    },
});
const create = defineWebAction({
    id: 'knowledge.createDocumentBatch',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    actors: ['user'],
    permissions: [...readConnection, ...writeWorkspace],
    scopes: ['knowledge:write', 'schema:read'],
    inputSchema: scope.extend({
        batchId: z.string().uuid(),
        taskId: z.string().uuid().optional(),
        folderId: id.nullable(),
        elapsedMs: z.number().int().nonnegative().max(2147483647),
        topics: z.array(topic).min(1).max(20),
    }),
    outputSchema: z.object({ documents: z.array(z.object({ id, folderId: id })) }),
    handler: async (ctx, input) => {
        if (input.taskId) {
            const task = await ctx.services.db.knowledge.documentGeneration.get({ id: input.taskId, organizationId: ctx.organizationId, userId: ctx.userId });
            if (task.knowledgeModelId !== input.knowledgeModelId || task.input.connectionId !== input.connectionId || !task.draft)
                throw new Error('Invalid document generation task.');
            const proofs = new Set(task.draft.topics.flatMap(topic => topic.documents.map(doc => doc.proof)));
            if (input.topics.some(topic => topic.documents.some(doc => !proofs.has(doc.proof)))) throw new Error('Invalid document preview.');
        }
        for (const topic of input.topics) {
            for (const doc of topic.documents) {
                if ((await decrypt(doc.proof)) !== draftDigest(ctx, input.knowledgeModelId, input.connectionId, doc)) throw new Error('Invalid document preview.');
            }
        }
        return { documents: await ctx.services.db.knowledge.createDocumentBatch({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId }) };
    },
});
export const documentGenerationActions = [generate, create];
