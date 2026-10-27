'use client';

import { Fragment } from 'react';

import { chatContextSchema, referenceKey } from '@/lib/chat-context/types';
import { ResourceIcon } from './resource-icon';

export function inlineMessageMentions(text: string, metadata: unknown) {
    const parsed = chatContextSchema.safeParse(metadata);
    if (!parsed.success || !parsed.data.mentionSpans?.length) return null;
    const { references, mentionSpans } = parsed.data;
    const byKey = new Map(references.map(reference => [referenceKey(reference), reference]));
    let end = 0;
    for (const span of mentionSpans) {
        if (span.start < end || span.end <= span.start || span.end > text.length || !byKey.has(span.referenceKey)) return null;
        end = span.end;
    }
    end = 0;
    return (
        <span className="whitespace-pre-wrap break-words">
            {mentionSpans.map((span, index) => {
                const before = text.slice(end, span.start);
                end = span.end;
                const reference = byKey.get(span.referenceKey)!;
                return (
                    <Fragment key={index}>
                        {before}
                        <span
                            className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 align-middle text-sm"
                            title={
                                reference.kind === 'table'
                                    ? [reference.connectionId, reference.database, reference.schema, reference.table].filter(Boolean).join(' / ')
                                    : reference.title
                            }
                            data-testid="message-mention"
                        >
                            <ResourceIcon reference={reference} />
                            <span className="max-w-64 truncate">{reference.title}</span>
                            {reference.kind === 'report' && reference.revision && <span className="text-xs text-muted-foreground">v{reference.revision}</span>}
                        </span>
                    </Fragment>
                );
            })}
            {text.slice(mentionSpans[mentionSpans.length - 1].end)}
        </span>
    );
}
