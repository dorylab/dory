import type { ChatContext } from './types';

/** Only the current user's text may opt a normal chat turn into report creation. */
export function resolveChatOutputIntent(context: ChatContext, text: string, documentId?: string | null): ChatContext['outputIntent'] {
    if (context.outputIntent === 'report') return 'report';
    // Open/referenced reports have an editing workflow; do not turn an edit or
    // explanation into a request for a separate document.
    if (documentId || context.references.some(reference => reference.kind === 'report')) return 'answer';
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
