import type { ChatContext } from './types';

/** Only the current user's text may opt a normal chat turn into report creation. */
export function resolveChatOutputIntent(context: ChatContext, text: string, documentId?: string | null): ChatContext['outputIntent'] {
    if (context.outputIntent === 'report') return 'report';
    // Open/referenced reports have an editing workflow; do not turn an edit or
    // explanation into a request for a separate document.
    if (documentId || context.references.some(reference => reference.kind === 'report')) return 'answer';
    if (isReportEditRequest(text) && !/(?:生成|创建|新建|制作).{0,24}(?:报告)|\b(?:create|generate|write|prepare)\b.{0,40}\breport\b/i.test(text)) return 'answer';
    const request = text
        .replace(/```[\s\S]*?(?:```|$)|`[^`]*`/g, '')
        .split(/\r?\n/)
        .filter(line => !/^\s*>/.test(line))
        .join('\n');
    for (const sentence of request.split(/[。！？!?；;\n]/)) {
        if (
            /(?:不要|不用|无需|不必|别|不需要|如何|怎么|怎样|为什么|是否|能否|失败|卡住|问题|出错|无法)|\b(?:do\s+not|don't|never|without|how|why|whether|failed|error|stuck)\b/i.test(
                sentence,
            )
        )
            continue;
        if (
            /(?:生成|创建|制作|整理|写|保存|存成)[^。！？\n]{0,40}报告|报告[^。！？\n]{0,24}(?:保存|存起来|存下来)/.test(sentence) ||
            /\b(?:create|generate|write|prepare|save)\b[^.!?\n]{0,80}\breport\b/i.test(sentence)
        )
            return 'report';
    }
    return 'answer';
}

/** Edit intent is separate from creating a new report and from explaining one. */
export function isReportEditRequest(text: string): boolean {
    const request = text
        .replace(/```[\s\S]*?(?:```|$)|`[^`]*`/g, '')
        .split(/\r?\n/)
        .filter(line => !/^\s*>/.test(line))
        .join(' ');
    return request
        .split(/[。！？!?；;,，]/)
        .some(
            clause =>
                !/(?:不要|不用|无需|不必|不需要|如何|怎么|为什么|只解释)|\b(?:do not|don't|how|why|explain)\b/i.test(clause) &&
                /(?:添加|加个|加一|加上|加一个|补充|补图|修改|更新|替换|调整|改成|改为|继续未完成)|\b(?:add|update|edit|replace|revise|continue unfinished)\b/i.test(clause),
        );
}
export function requestedChartType(text: string): 'pie' | 'area' | 'line' | 'bar' | undefined {
    if (/饼图|饼状|\bpie\b/i.test(text)) return 'pie';
    if (/面积图|\barea chart\b/i.test(text)) return 'area';
    if (/折线|\bline chart\b/i.test(text)) return 'line';
    if (/柱状|条形|\bbar chart\b/i.test(text)) return 'bar';
    return undefined;
}

/** Explicit references outrank the currently open report; ambiguity never selects the newest one. */
export function selectReportTarget(currentDocumentId: string | null, referencedIds: string[], candidateIds: string[]) {
    const references = [...new Set(referencedIds)];
    const candidates = references.length ? references : currentDocumentId ? [currentDocumentId] : [...new Set(candidateIds)];
    return { documentId: candidates.length === 1 ? candidates[0] : null, ambiguous: candidates.length > 1 };
}
