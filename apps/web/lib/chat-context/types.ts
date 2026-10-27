import type { FileUIPart } from 'ai';
import { z } from 'zod';

const name = z.string().min(1).max(512);
export const chatReferenceSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('table'), connectionId: name, database: name, schema: z.string().max(512).nullable(), table: name, title: name }),
    z.object({ kind: z.literal('report'), id: name, title: name, revision: z.number().int().positive().optional(), version: z.number().int().positive().optional() }),
    z.object({ kind: z.literal('artifact'), id: name, title: name }),
]);
export const chatContextSchema = z.object({
    references: z.array(chatReferenceSchema).max(20).default([]),
    mentionSpans: z
        .array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(), referenceKey: z.string().min(1).max(4096) }))
        .max(200)
        .optional(),
    outputIntent: z.enum(['answer', 'report']).default('answer'),
    sourceMessageId: name.optional(),
});
export type ChatReference = z.infer<typeof chatReferenceSchema>;
export type ChatContext = z.infer<typeof chatContextSchema>;
export type MentionSpan = NonNullable<ChatContext['mentionSpans']>[number];
export type ChatSubmission = Partial<ChatContext> & { text: string; files: FileUIPart[]; id?: string };
export type ChatMetadata = Partial<ChatContext> & {
    userMessageId?: string;
    reportDocumentId?: string;
    reportRevision?: number;
    reportSave?: { status: 'saved' | 'failed'; error?: string };
};

export function referenceKey(reference: ChatReference): string {
    return reference.kind === 'table'
        ? JSON.stringify([reference.kind, reference.connectionId, reference.database, reference.schema, reference.table])
        : reference.kind === 'report' && reference.revision
          ? `report:${reference.id}:v${reference.revision}`
          : `${reference.kind}:${reference.id}`;
}
