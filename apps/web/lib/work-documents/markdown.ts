import type { WorkVisual } from '@dory/shared/types/work-document';
import { Marked, type Token } from 'marked';

export const markdownParser = new Marked({ gfm: true, breaks: false });
export function workReferences(markdown: string) {
    const visuals = new Set<string>();
    const evidence = new Set<string>();
    const invalid: string[] = [];
    markdownParser.walkTokens(markdownParser.lexer(markdown), token => {
        if (token.type === 'text' && !token.tokens && token.text.includes('dory://')) invalid.push(token.text);
        if (token.type !== 'image' && token.type !== 'link') return;
        const href = token.href;
        if (!href.startsWith('dory:')) return;
        const match = /^dory:\/\/(visual|evidence)\/([a-zA-Z0-9_-]+)$/.exec(href);
        if (!match || (match[1] === 'visual' && token.type !== 'image') || (match[1] === 'evidence' && token.type !== 'link')) invalid.push(href);
        else (match[1] === 'visual' ? visuals : evidence).add(match[2]);
    });
    return { visuals: [...visuals], evidence: [...evidence], invalid };
}
export function referencedEvidence(markdown: string, visuals: WorkVisual[]) {
    const refs = workReferences(markdown);
    if (refs.invalid.length)
        throw new Error(
            'WORK_REFERENCE_INVALID: Invalid Work reference: ' +
                refs.invalid[0] +
                '. Use [Source](dory://evidence/ARTIFACT_ID) or ![Title](dory://visual/VISUAL_ID). Knowledge sources are recorded separately; do not use knowledge URLs or footnotes in the body.',
        );
    if (new Set(visuals.map(v => v.id)).size !== visuals.length) throw new Error('Visual IDs must be unique.');
    const ids = new Set(refs.evidence);
    for (const id of refs.visuals) {
        const visual = visuals.find(v => v.id === id);
        if (!visual) throw new Error('Unknown visual: ' + id);
        ids.add(visual.evidenceId);
    }
    return { ids: [...ids], visuals: visuals.filter(v => refs.visuals.includes(v.id)) };
}

// Compare Markdown semantics before allowing a rich-text round trip. Formatting
// normalization is fine, dropping unsupported source is not.
export function markdownSemantics(markdown: string): string {
    const normalize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.filter(item => !(item && typeof item === 'object' && 'type' in item && item.type === 'space')).map(normalize);
        if (!value || typeof value !== 'object') return value;
        const token = value as Token & Record<string, unknown>;
        return Object.fromEntries(
            Object.keys(token)
                .sort()
                .filter(key => !['raw', 'links', 'escaped'].includes(key) && !(key === 'text' && Array.isArray(token.tokens)))
                .map(key => [key, normalize(token[key])]),
        );
    };
    return JSON.stringify(normalize(markdownParser.lexer(markdown)));
}
export function hasUnsupportedMarkdown(markdown: string): boolean {
    let unsupported = false;
    markdownParser.walkTokens(markdownParser.lexer(markdown), token => {
        if (token.type === 'html' || (token.type === 'list_item' && token.task) || (token.type === 'image' && !token.href.startsWith('dory://visual/'))) unsupported = true;
        if (token.type === 'table' && token.align.some(Boolean)) unsupported = true;
    });
    return unsupported;
}
