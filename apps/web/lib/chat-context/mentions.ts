import type { AnalysisScope } from '@dory/shared/types/work-document';
import { isAnalysisDatabaseAllowed } from '@dory/shared/utils/analysis-scope';

import { referenceKey, type ChatReference, type MentionSpan } from './types';

export function mentionLabel(reference: ChatReference) {
    return `@${reference.title}${reference.kind === 'report' && reference.revision ? ` · v${reference.version ?? reference.revision}` : ''}`;
}

/** Offsets are UTF-16 string offsets, identical in the editor, JSON and JS. */
export function validMentionSpans(text: string, references: ChatReference[], spans: MentionSpan[], checkLabels = true) {
    const byKey = new Map(references.map(reference => [referenceKey(reference), reference]));
    let end = 0;
    return spans.every(span => {
        const reference = byKey.get(span.referenceKey);
        const valid = Boolean(
            reference && span.start >= end && span.end > span.start && span.end <= text.length && (!checkLabels || text.slice(span.start, span.end) === mentionLabel(reference)),
        );
        end = span.end;
        return valid;
    });
}

export function textWithMentionIds(text: string, spans: MentionSpan[]) {
    let result = '';
    let end = 0;
    for (const span of spans) {
        result += text.slice(end, span.end) + ` [resource ${JSON.stringify(span.referenceKey)}]`;
        end = span.end;
    }
    return result + text.slice(end);
}

export function referenceInScope(reference: ChatReference, scope: AnalysisScope) {
    return (
        reference.kind !== 'table' ||
        scope.connectionMode === 'auto' ||
        (!scope.connectionMode && !scope.connectionIds.length) ||
        (scope.connectionIds.includes(reference.connectionId) && isAnalysisDatabaseAllowed(scope, reference.connectionId, reference.database))
    );
}

export type ReferenceOption = {
    reference: ChatReference;
    detail: string;
    current?: boolean;
    timestamp?: string;
    recentAt?: number;
    artifactType?: 'result_set' | 'chart' | 'file';
    group?: 'current' | 'recent';
};
export type ReferenceCategory = 'report' | 'result_set' | 'table' | null;

function matchRank(option: ReferenceOption, query: string) {
    const title = option.reference.title.toLocaleLowerCase();
    if (title === query) return 4;
    if (title.startsWith(query)) return 3;
    if (title.includes(query)) return 2;
    if (option.detail.toLocaleLowerCase().includes(query)) return 1;
    return 0;
}

export function rankReferences(options: ReferenceOption[], query: string, category: ReferenceCategory = null) {
    const q = query.trim().toLocaleLowerCase();
    const unique = new Map<string, ReferenceOption>();
    for (const option of options) {
        const key = referenceKey(option.reference);
        const previous = unique.get(key);
        unique.set(key, previous ? { ...option, current: previous.current || option.current, recentAt: previous.recentAt ?? option.recentAt } : option);
    }
    return [...unique.values()]
        .filter(
            option => (!category || (category === 'result_set' ? option.artifactType === 'result_set' : option.reference.kind === category)) && (!q || matchRank(option, q) > 0),
        )
        .sort(
            (a, b) =>
                (q ? matchRank(b, q) - matchRank(a, q) : 0) ||
                Number(Boolean(b.current)) - Number(Boolean(a.current)) ||
                (b.recentAt ?? 0) - (a.recentAt ?? 0) ||
                (b.timestamp ?? '').localeCompare(a.timestamp ?? '') ||
                referenceKey(a.reference).localeCompare(referenceKey(b.reference)),
        );
}

export function defaultReferences(options: ReferenceOption[]) {
    const current = options
        .filter(option => option.current)
        .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '') || referenceKey(a.reference).localeCompare(referenceKey(b.reference)))
        .slice(0, 3);
    const resourceId = (ref: ChatReference) => (ref.kind === 'table' ? referenceKey(ref) : `${ref.kind}:${ref.id}`);
    const currentIds = new Set(current.map(option => resourceId(option.reference)));
    const recent = options
        .filter(option => option.recentAt && !currentIds.has(resourceId(option.reference)))
        .sort((a, b) => (b.recentAt ?? 0) - (a.recentAt ?? 0))
        .slice(0, 3);
    return [...current.map(option => ({ ...option, group: 'current' as const })), ...recent.map(option => ({ ...option, group: 'recent' as const }))];
}
