import { Output } from 'ai';
import type { DBService } from '@dory/database';
import { catalogTableReference } from '@dory/drivers/core';
import type { DocumentDraft, DocumentGenerationInput, DocumentGenerationPhase, GeneratedDocument } from '@dory/shared/types/knowledge-document-draft';
import { encrypt } from '@dory/shared/utils/crypto';
import { translate } from '@dory/i18n/translate';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { generateText } from '@/lib/ai/gateway';
import { describeTableOperation, getSchemaGraphOperation, listTablesOperation, type DoryToolOperationContext } from '@/lib/ai/tools/dory-tool-operations';
import { generateValidatedDocumentDraft } from './knowledge-document-outline';
import { addConstraints, type TableFacts } from './knowledge-document-draft';

// Only names, topic assignment and selection are editable in the preview.
export function draftDigest(scope: { organizationId: string; userId: string }, modelId: string, connectionId: string, doc: GeneratedDocument) {
    return createHash('sha256')
        .update(
            JSON.stringify([
                'knowledge-document-draft',
                scope.organizationId,
                scope.userId,
                modelId,
                connectionId,
                doc.contentText,
                doc.evidence.database,
                doc.evidence.tables.map(t => [t.name, t.digest]),
                doc.evidence.references.map(r => [r.kind, r.id]),
            ]),
        )
        .digest('hex');
}
export async function generateDocumentDraft(
    ctx: { db: DBService; organizationId: string; userId: string; req?: NextRequest; signal?: AbortSignal; actionRunId?: string | null; requestId?: string | null },
    input: DocumentGenerationInput,
    progress: (value: { phase: DocumentGenerationPhase; completedTables?: number }) => Promise<void> = async () => {},
): Promise<DocumentDraft> {
    const repo = ctx.db.knowledge;
    const { source, references } = await repo.documentGenerationContext({ ...input, organizationId: ctx.organizationId });
    const op: DoryToolOperationContext = {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        currentConnectionId: input.connectionId,
        locale: input.locale,
        auditSource: 'dory_schema_metadata',
        actionRunId: ctx.actionRunId ?? null,
        requestId: ctx.requestId ?? null,
    };
    const args = { database: input.database, connectionId: input.connectionId };
    const { tables: catalog } = await listTablesOperation(op, args);
    const entries = new Map(catalog.map(table => [table.name, { ...catalogTableReference(table, source.engine), comment: table.comment ?? null }]));
    const names = [...new Set(input.tables)];
    const facts: TableFacts[] = [],
        failedTables: string[] = [];
    for (let offset = 0; offset < names.length; offset += 4) {
        const chunk = names.slice(offset, offset + 4);
        const result = await Promise.allSettled(
            chunk.map(async name => {
                const entry = entries.get(name);
                if (!entry) throw new Error('Table unavailable.');
                const { columns } = await describeTableOperation(op, { ...args, table: entry.identifier });
                if (!columns.length) throw new Error('No readable columns.');
                return {
                    name,
                    comment: entry.comment ?? null,
                    columns: columns.map(({ columnName, columnType, isPrimaryKey, nullable, isNullable, comment }) => ({
                        columnName,
                        columnType,
                        isPrimaryKey,
                        nullable,
                        isNullable,
                        comment,
                    })),
                    foreignKeys: null,
                };
            }),
        );
        result.forEach((r, i) => {
            if (r.status === 'fulfilled') facts.push(r.value);
            else failedTables.push(chunk[i]);
        });
        await progress({ phase: 'reading', completedTables: Math.min(offset + chunk.length, names.length) });
    }
    if (failedTables.length) return { topics: [], failedTables };
    await progress({ phase: 'organizing' });
    const focus = facts.map(f => entries.get(f.name)!.focus);
    const graph = await getSchemaGraphOperation(op, { ...args, focusTables: focus, depth: 0, columnMode: 'all' }).catch(() => undefined);
    addConstraints(facts, focus, graph?.graph);
    const ai = await resolveAiLanguageModel({ role: 'action', organizationId: ctx.organizationId, req: ctx.req, db: ctx.db });
    const topics = await generateValidatedDocumentDraft({
        source: { name: source.name, database: input.database },
        locale: input.locale,
        goal: input.prompt,
        tables: facts,
        references,
        label: key => translate(input.locale, 'Knowledge.Generation.' + key),
        progress: phase => progress({ phase }),
        generate: request =>
            generateText({
                ...request,
                model: ai.model,
                output: Output.json(),
                abortSignal: ctx.signal,
                timeout: 180_000,
                temperature: 0.2,
                context: {
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                    feature: 'knowledge_document_generation',
                    promptVersion: 2,
                    model: ai.modelName,
                    provider: ai.providerKey,
                    gateway: ai.gateway,
                },
            }),
    });
    const signedTopics = await Promise.all(
        topics.map(async topic => ({
            ...topic,
            documents: await Promise.all(topic.documents.map(async doc => ({ ...doc, proof: await encrypt(draftDigest(ctx, input.knowledgeModelId, input.connectionId, doc)) }))),
        })),
    );
    return { topics: signedTopics, failedTables: [] };
}
