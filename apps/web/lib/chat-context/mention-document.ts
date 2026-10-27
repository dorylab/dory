import type { JSONContent } from '@tiptap/core';

import { chatReferenceSchema, referenceKey, type ChatReference, type MentionSpan } from './types';
import { mentionLabel, validMentionSpans } from './mentions';

export type MentionDraft = { text: string; references: ChatReference[]; mentionSpans: MentionSpan[] };

export function serializeMentionDocument(document: JSONContent): MentionDraft {
    let text = '';
    const references = new Map<string, ChatReference>();
    const mentionSpans: MentionSpan[] = [];
    const visit = (node: JSONContent) => {
        if (node.type === 'text') text += node.text ?? '';
        else if (node.type === 'hardBreak') text += '\n';
        else if (node.type === 'resourceMention') {
            const parsed = chatReferenceSchema.safeParse(node.attrs?.reference);
            if (!parsed.success) return;
            const reference = parsed.data;
            const start = text.length;
            text += mentionLabel(reference);
            const key = referenceKey(reference);
            references.set(key, reference);
            mentionSpans.push({ start, end: text.length, referenceKey: key });
        } else node.content?.forEach(visit);
    };
    document.content?.forEach((node, index) => {
        if (index) text += '\n';
        visit(node);
    });
    return { text, references: [...references.values()], mentionSpans };
}

export function buildMentionDocument(text: string, references: ChatReference[] = [], spans: MentionSpan[] = []): JSONContent {
    const content: JSONContent[] = [];
    const byKey = new Map(references.map(ref => [referenceKey(ref), ref]));
    const appendText = (value: string) =>
        value.split('\n').forEach((line, index) => {
            if (index) content.push({ type: 'hardBreak' });
            if (line) content.push({ type: 'text', text: line });
        });
    let end = 0;
    if (validMentionSpans(text, references, spans, false)) {
        for (const span of spans) {
            appendText(text.slice(end, span.start));
            content.push({ type: 'resourceMention', attrs: { reference: byKey.get(span.referenceKey) } });
            end = span.end;
        }
    }
    appendText(text.slice(end));
    return { type: 'doc', content: [{ type: 'paragraph', content }] };
}
