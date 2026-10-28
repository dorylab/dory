import type { ChatContext } from './types';

/** Only the current user's text may opt a normal chat turn into report creation. */
export function resolveChatOutputIntent(context: ChatContext, text: string, documentId?: string | null): ChatContext['outputIntent'] {
    if (context.outputIntent === 'report' || isNewReportRequest(text)) return 'report';
    // Open/referenced reports have an editing workflow; do not turn an edit or
    // explanation into a request for a separate document.
    if (documentId || context.references.some(reference => reference.kind === 'report')) return 'answer';
    if (isReportContentEditRequest(text) && !/(?:生成|创建|新建|制作).{0,24}(?:报告)|\b(?:create|generate|write|prepare)\b.{0,40}\breport\b/i.test(text)) return 'answer';
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
function isReportContentEditRequest(text: string): boolean {
    return actionableReportClauses(text).some(clause =>
        /(?:添加|加个|加一|加上|加一个|补充|补图|修改|更新|替换|调整|改成|改为|继续未完成)|\b(?:add|update|edit|replace|revise|continue unfinished)\b/i.test(clause),
    );
}
export function requestedChartType(text: string): 'pie' | 'area' | 'line' | 'bar' | undefined {
    const clauses = actionableReportClauses(text);
    const changedType = clauses.map(clause => clause.match(/(?:改成|改为|替换为|change.+?to|replace.+?with)\s*(.+)/i)?.[1]).find(Boolean);
    text = changedType ?? clauses.filter(clause => !/^(?:保留|保持)|\b(?:keep|preserve)\b/i.test(clause.trim())).join(' ');
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

function actionableReportClauses(text: string) {
    return text
        .replace(/```[\s\S]*?(?:```|$)|`[^`]*`/g, '')
        .split(/\r?\n/)
        .filter(line => !/^\s*>/.test(line))
        .join(' ')
        .split(/[。！？!?；;,，]/)
        .filter(clause => !/(?:不要|不用|无需|不必|别|不需要|如何|怎么|怎样|为什么|只解释)|\b(?:do not|don't|never|how|why|explain)\b/i.test(clause));
}

export function isReportSaveRequest(text: string): boolean {
    return actionableReportClauses(text).some(
        clause =>
            !/(?:保存失败|无法保存|保存出错)|\b(?:failed|unable|cannot)\b/i.test(clause) &&
            /(?:保存|存起来|存下来|继续完成|继续未完成|重试保存)|\b(?:save|retry saving|continue unfinished|finish (?:this|the) report)\b/i.test(clause),
    );
}

export function isNewReportRequest(text: string): boolean {
    return actionableReportClauses(text).some(clause =>
        /(?:新建|创建|生成|制作).{0,20}(?:新|另一|一份).{0,12}报告|\b(?:create|generate|write)\b.{0,30}\b(?:new|another) report\b/i.test(clause),
    );
}

/** Resolve capabilities and target together, before constructing tools or completion guards. */
export function resolveReportWorkflow(context: ChatContext, text: string, documentId: string | null, candidates: string[], resume = false) {
    const references = context.references.filter(ref => ref.kind === 'report').map(ref => ref.id);
    const create = context.outputIntent === 'report' || isNewReportRequest(text);
    const editing = !create && (isReportEditRequest(text) || resume);
    const publishing = !create && isReportPublishRequest(text);
    const target = create ? { documentId: null, ambiguous: false } : selectReportTarget(documentId, references, editing || publishing ? candidates : []);
    const outputIntent =
        create || (!target.documentId && !target.ambiguous && (isReportSaveRequest(text) || resolveChatOutputIntent(context, text) === 'report')) ? 'report' : 'answer';
    return {
        outputIntent: outputIntent as ChatContext['outputIntent'],
        documentId: target.documentId,
        ambiguous: target.ambiguous,
        readOnly: target.ambiguous || (!editing && !publishing && Boolean(target.documentId || references.length) && outputIntent !== 'report'),
        requireUpdate: editing && Boolean(target.documentId),
    };
}

export function requestsReportChart(text: string): boolean {
    return actionableReportClauses(text).some(clause => /(?:饼图|饼状|面积图|折线图|柱状图|条形图|图表|可视化|补图)|\b(?:chart|visualization|visualisation)\b/i.test(clause));
}

export function isReportEditRequest(text: string): boolean {
    return isReportContentEditRequest(text) || isReportSaveRequest(text);
}

export function isReportPublishRequest(text: string): boolean {
    return actionableReportClauses(text).some(clause => /发布|\bpublish\b/i.test(clause));
}

export function requestedReportVisualTypes(text: string): Array<'chart' | 'metric' | 'table'> {
    const clauses = actionableReportClauses(text).join(' ');
    const types: Array<'chart' | 'metric' | 'table'> = [];
    if (requestsReportChart(text)) types.push('chart');
    if (/指标卡|KPI卡|\b(?:metric|kpi) cards?\b/i.test(clauses)) types.push('metric');
    if (/统计表|数据表|汇总表|\b(?:data|summary) tables?\b/i.test(clauses)) types.push('table');
    return types;
}
