import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { ReportApplyTarget, ReportQueryTab, ReportWorkingDraft, ReportWorkingState } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';

import { reportNumber } from './format';
import { remapChartFields, resultUsedBy } from './workspace-presentation';
import { referencedEvidence } from './markdown';
import { editableReport, parseReport, reportEmbeds, reportOutline, reportTagSource } from './report-core';

export function initialWorkingState(title: string, raw: WorkDocumentContent): ReportWorkingState {
    const content = editableReport(raw);
    const groups = new Map<string, ReportQueryTab>();
    for (const evidence of content.evidence) {
        const key = evidence.snapshotId ?? evidence.artifactId;
        const componentIds = content.visuals.filter(visual => visual.evidenceId === evidence.artifactId).map(visual => visual.id);
        const prior = groups.get(key);
        if (prior) prior.componentIds.push(...componentIds);
        else
            groups.set(key, {
                id: `query_${groups.size + 1}`,
                title: evidence.title,
                sourceArtifactId: evidence.artifactId,
                snapshotArtifactId: evidence.artifactId,
                sql: evidence.sql ?? '',
                hidden: false,
                componentIds,
            });
    }
    const tabs = [...groups.values()];
    return {
        title,
        content,
        tabs,
        activeTabId: tabs[0]?.id ?? null,
        proseNeedsReview: false,
        bindingVersion: 2,
        charts: [],
        baseline: { revision: 1, title, content: structuredClone(content) },
    };
}

export function validateWorkingVisual(visual: WorkVisual, evidence: WorkEvidence) {
    if (evidence.truncated && !visual.allowSubset) throw new DatabaseError(`“${visual.title}”: explicitly allow partial results or rerun an aggregate query.`, 400);
    if (visual.chartSpec) {
        const spec = visual.chartSpec;
        const keys = [
            spec.xKey,
            ...(spec.groupKey && spec.groupKey !== '__none__' ? [spec.groupKey] : []),
            ...(spec.filters ?? []).map(filter => filter.col),
            ...(spec.search?.columns ?? []),
        ];
        // Metric keys encode aggregate operations, e.g. sum:duration; count has no column.
        if (spec.yKey !== 'count' && !/^(sum|avg|min|max|count_distinct|count_true):.+$/.test(spec.yKey))
            throw new DatabaseError('Unsupported chart aggregation. Update its configuration.', 400);
        const metricColumn = spec.yKey.includes(':') ? spec.yKey.slice(spec.yKey.indexOf(':') + 1) : spec.yKey;
        if (spec.yKey !== 'count') keys.push(metricColumn);
        if (keys.some(key => !evidence.columns.includes(key))) throw new DatabaseError(`“${visual.title}”: chart fields changed. Update its configuration.`, 400);
        const numericColumns = [...(/^(sum|avg|min|max):/.test(spec.yKey) ? [metricColumn] : []), ...(['scatter', 'histogram'].includes(spec.chartType) ? [spec.xKey] : [])];
        for (const key of numericColumns) {
            const type = evidence.columnTypes?.find(column => column.name === key)?.type ?? '';
            if (
                /(^|[^a-z])(string|varchar|char|text|json|uuid|boolean|bool|date|timestamp|datetime)([^a-z]|$)/i.test(type) ||
                evidence.rows.some(row => row[key] != null && row[key] !== '' && reportNumber(row[key]) === null)
            )
                throw new DatabaseError(`“${visual.title}”: chart field “${key}” is no longer numeric. Update its configuration.`, 400);
        }
    }
    if (visual.metric) {
        for (const cell of [visual.metric, ...(visual.metric.items ?? []), ...(visual.metric.comparison ? [visual.metric.comparison] : [])]) {
            if (!evidence.columns.includes(cell.column) || !evidence.rows[cell.rowIndex])
                throw new DatabaseError(`“${visual.title}”: metric column or row no longer exists. Update its configuration.`, 400);
        }
    }
    if (visual.chart) {
        const keys = visual.chart.yKeys?.map(item => item.key) ?? [visual.chart.yKey!];
        if ([visual.chart.xKey, ...keys].some(key => !evidence.columns.includes(key)))
            throw new DatabaseError(`“${visual.title}”: chart fields changed. Update its configuration.`, 400);
        if (evidence.rows.some(row => keys.some(key => row[key] != null && row[key] !== '' && reportNumber(row[key]) === null)))
            throw new DatabaseError('Chart series must be numeric.', 400);
        if (
            visual.chart.type === 'pie' &&
            (evidence.truncated ||
                keys.length !== 1 ||
                evidence.rows.some(row => row[keys[0]] == null || !Number.isFinite(Number(row[keys[0]])) || Number(row[keys[0]]) < 0) ||
                evidence.rows.reduce((sum, row) => sum + Number(row[keys[0]]), 0) <= 0)
        )
            throw new DatabaseError('A pie requires a complete, non-negative series with a positive total.', 400);
    }
}

/** Materialize only server-owned evidence. Client bindings/configuration contain no rows or provenance. */
export function materializeWorkingContent(state: ReportWorkingState, results: ReportWorkingDraft['results'], validate = false): WorkDocumentContent {
    if (state.bindingVersion === 2) {
        const trusted = new Map([...Object.values(results).map(result => result.evidence), ...state.content.evidence].map(evidence => [evidence.artifactId, evidence]));
        const ids = new Set<string>();
        for (const visual of state.content.visuals) {
            if (ids.has(visual.id)) throw new DatabaseError('Duplicate component ID.', 400);
            ids.add(visual.id);
            const evidence = trusted.get(visual.evidenceId);
            if (!evidence) throw new DatabaseError('The selected result is unavailable.', 409);
            if (validate) validateWorkingVisual(visual, evidence);
        }
        const parsed = parseReport(state.content.body ?? '', state.content.visuals);
        if (validate && parsed.diagnostics.length) throw new DatabaseError(parsed.diagnostics[0].message, 400);
        const referenced = referencedEvidence(parsed.presentation, state.content.visuals, state.content.evidenceGroups);
        const evidence = referenced.ids.map(id => {
            const value = trusted.get(id);
            if (!value) throw new DatabaseError('Report evidence is unavailable.', 409);
            return value;
        });
        return { ...state.content, evidence, embeds: reportEmbeds(state.content.visuals, evidence), markdown: parsed.presentation, diagnostics: parsed.diagnostics };
    }
    const seen = new Set<string>();
    const visuals = state.content.visuals.map(visual => {
        const owners = state.tabs.filter(tab => tab.componentIds.includes(visual.id));
        if (owners.length !== 1) throw new DatabaseError('Every component must belong to exactly one query.', 400);
        const tab = owners[0];
        const evidence = tab.appliedId ? results[tab.appliedId]?.evidence : state.content.evidence.find(item => item.artifactId === tab.snapshotArtifactId);
        if (!evidence) throw new DatabaseError('Apply a successful query result before adding it to the report.', 400);
        const next = { ...visual, evidenceId: evidence.artifactId };
        if (validate) validateWorkingVisual(next, evidence);
        if (seen.has(visual.id)) throw new DatabaseError('Duplicate component ID.', 400);
        seen.add(visual.id);
        return next;
    });
    const all = [...state.content.evidence, ...state.tabs.flatMap(tab => (tab.appliedId && results[tab.appliedId] ? [results[tab.appliedId].evidence] : []))];
    const evidence = [...new Map(all.map(item => [item.artifactId, item])).values()];
    const parsed = parseReport(state.content.body ?? '', visuals);
    if (validate && (parsed.diagnostics.length || !state.content.body?.trim())) throw new DatabaseError(parsed.diagnostics[0]?.message ?? 'Report text is empty.', 400);
    return { ...state.content, visuals, evidence, embeds: reportEmbeds(visuals, evidence), markdown: parsed.presentation, diagnostics: parsed.diagnostics };
}

export function versionContent(draft: ReportWorkingDraft) {
    const content = materializeWorkingContent(draft.state, draft.results, true);
    const referenced = referencedEvidence(content.markdown, content.visuals, content.evidenceGroups);
    const evidence = content.evidence.filter(item => referenced.ids.includes(item.artifactId));
    return { ...content, visuals: referenced.visuals, evidence, embeds: reportEmbeds(referenced.visuals, evidence), agentWrite: undefined };
}

/** An execution is a candidate until a single, still-current report reference is selected. */
export function applyWorkingResult(draft: ReportWorkingDraft, tabId: string, resultId: string, target: ReportApplyTarget, newTabId: string): ReportWorkingState {
    const tab = draft.state.tabs.find(item => item.id === tabId);
    const result = draft.results[resultId];
    if (!tab || !result || result.sourceArtifactId !== tab.sourceArtifactId) throw new DatabaseError('Query result unavailable.', 403);
    if (Boolean(target.componentId) === Boolean(target.groupId)) throw new DatabaseError('Select one report component or evidence reference.', 400);
    const state = structuredClone(draft.state);
    if (target.componentId) {
        const visual = state.content.visuals.find(item => item.id === target.componentId);
        const owner = state.tabs.find(item => item.componentIds.includes(target.componentId!));
        if (!visual || visual.evidenceId !== target.artifactId || !owner || owner.sourceArtifactId !== tab.sourceArtifactId)
            throw new DatabaseError('The report target changed. Select the target again.', 409);
        validateWorkingVisual(visual, result.evidence);
        if (owner.id === tabId && owner.componentIds.length === 1) owner.appliedId = resultId;
        else {
            if (state.tabs.length >= 100 || state.tabs.some(item => item.id === newTabId))
                throw new DatabaseError('Too many query tabs. Close unused queries before applying.', 400);
            owner.componentIds = owner.componentIds.filter(id => id !== visual.id);
            state.tabs.push({ ...tab, id: newTabId, copiedFromId: tab.id, title: visual.title, componentIds: [visual.id], appliedId: resultId, hidden: false });
            state.activeTabId = newTabId;
        }
    } else {
        const group = state.content.evidenceGroups?.find(item => item.id === target.groupId);
        const source = state.content.evidence.find(item => item.artifactId === target.artifactId);
        const belongs =
            target.artifactId === tab.sourceArtifactId ||
            Object.values(draft.results).some(item => item.sourceArtifactId === tab.sourceArtifactId && item.evidence.artifactId === target.artifactId);
        if (!group || !source || !belongs || !group.references.some(item => item.artifactId === target.artifactId))
            throw new DatabaseError('The conclusion reference changed. Select the target again.', 409);
        if (group.references.some(item => item.artifactId !== target.artifactId && item.artifactId === result.evidence.artifactId))
            throw new DatabaseError('This result is already linked to the conclusion.', 400);
        group.references = group.references.map(item => (item.artifactId === target.artifactId ? { ...item, artifactId: result.evidence.artifactId } : item));
        group.needsReview = true;
        if (!state.content.evidence.some(item => item.artifactId === result.evidence.artifactId)) state.content.evidence.push(result.evidence);
    }
    state.content = materializeWorkingContent(state, draft.results, true);
    state.proseNeedsReview = true;
    return state;
}

/** Upgrade once, preserving already applied legacy bindings and their result records. */
export function upgradeWorkingState(draft: ReportWorkingDraft, baseline: WorkDocumentContent): ReportWorkingState {
    if (draft.state.bindingVersion === 2) return draft.state;
    const content = materializeWorkingContent(draft.state, draft.results);
    return {
        ...draft.state,
        content,
        bindingVersion: 2,
        charts: [],
        baseline: { revision: draft.expectedReportRevision, title: draft.state.title, content: editableReport(baseline) },
    };
}

export type ReportDraftOperation =
    | { type: 'replace'; resultId: string; blockIds: string[]; chartSpec?: WorkVisual['chartSpec']; fieldMappings?: Record<string, Record<string, string>> }
    | { type: 'insert'; resultId: string; visual: Pick<WorkVisual, 'id' | 'type' | 'title' | 'chartSpec'>; anchorId: string; position: 'before' | 'after' | 'end' }
    | { type: 'remove' | 'revert'; blockId: string };

export function changeReportDraft(draft: ReportWorkingDraft, operation: ReportDraftOperation): ReportWorkingState {
    const state = structuredClone(draft.state);
    if (state.bindingVersion !== 2) throw new DatabaseError('Reopen the workspace to upgrade this draft.', 409);
    const content = state.content;
    const body = content.body ?? '';
    const outline = reportOutline(body, content.visuals);
    if (operation.type === 'replace' || operation.type === 'insert') {
        const snapshot = operation.resultId.startsWith('snapshot:')
            ? [...state.content.evidence, ...(state.baseline?.content.evidence ?? [])].find(item => item.artifactId === operation.resultId.slice(9))
            : undefined;
        const result = draft.results[operation.resultId] ?? (snapshot ? { evidence: snapshot } : undefined);
        if (!result) throw new DatabaseError('Result unavailable. Run the query again.', 409);
        if (!content.evidence.some(item => item.artifactId === result.evidence.artifactId)) content.evidence.push(result.evidence);
        if (operation.type === 'replace') {
            if (!operation.blockIds.length || new Set(operation.blockIds).size !== operation.blockIds.length) throw new DatabaseError('Select report blocks.', 400);
            for (const id of operation.blockIds) {
                const visual = content.visuals.find(item => item.id === id);
                if (!visual || !outline.some(item => item.visualId === id)) throw new DatabaseError('The target changed. Select it again.', 409);
                if (operation.chartSpec && visual.type !== 'chart') throw new DatabaseError('Select a chart target.', 400);
                if (!Object.keys(operation.fieldMappings?.[id] ?? {}).length && resultUsedBy([visual], result.evidence, operation.chartSpec).length) continue;
                visual.evidenceId = result.evidence.artifactId;
                if (operation.chartSpec) {
                    visual.chartSpec = structuredClone(operation.chartSpec);
                    delete visual.chart;
                }
                if (operation.fieldMappings?.[id]) Object.assign(visual, remapChartFields(visual, operation.fieldMappings[id]));
                delete visual.chartData;
                validateWorkingVisual(visual, result.evidence);
            }
        } else {
            if (!['chart', 'table'].includes(operation.visual.type) || content.visuals.some(item => item.id === operation.visual.id))
                throw new DatabaseError('Invalid report block.', 400);
            const visual: WorkVisual = { ...operation.visual, evidenceId: result.evidence.artifactId };
            if (visual.type === 'chart' && !visual.chartSpec) throw new DatabaseError('Choose a chart configuration.', 400);
            validateWorkingVisual(visual, result.evidence);
            const anchor = outline.find(item => item.id === operation.anchorId);
            if (!anchor) throw new DatabaseError('The insertion position changed. Select it again.', 409);
            const offset = operation.position === 'before' ? anchor.start : operation.position === 'after' ? anchor.end : anchor.sectionEnd;
            content.body = body.slice(0, offset) + '\n\n' + reportTagSource(visual) + '\n\n' + body.slice(offset);
            content.visuals.push(visual);
        }
    } else {
        const node = outline.find(item => item.visualId === operation.blockId);
        const baseline = state.baseline?.content;
        const original = baseline?.visuals.find(item => item.id === operation.blockId);
        if (operation.type === 'revert' && original && baseline) {
            const current = content.visuals.find(item => item.id === original.id);
            if (current) Object.assign(current, { chart: undefined, chartSpec: undefined, chartData: undefined, metric: undefined }, structuredClone(original));
            else {
                const baseOutline = reportOutline(baseline.body ?? '', baseline.visuals);
                const index = baseOutline.findIndex(item => item.visualId === original.id);
                const baselineBody = baseline.body ?? '';
                const matches = (item: (typeof baseOutline)[number]) =>
                    outline.filter(current =>
                        item.visualId
                            ? current.visualId === item.visualId
                            : current.kind === item.kind && body.slice(current.start, current.end) === baselineBody.slice(item.start, item.end),
                    );
                const next = baseOutline.slice(index + 1).find(item => matches(item).length === 1);
                const offset = next ? matches(next)[0].start : body.length;
                content.body = body.slice(0, offset) + '\n\n' + reportTagSource(original) + '\n\n' + body.slice(offset);
                content.visuals.push(structuredClone(original));
            }
            const evidence = baseline.evidence.find(item => item.artifactId === original.evidenceId);
            if (evidence && !content.evidence.some(item => item.artifactId === evidence.artifactId)) content.evidence.push(evidence);
        } else {
            if (!node) throw new DatabaseError('The block is no longer present.', 409);
            content.body = body.slice(0, node.start) + body.slice(node.end);
            content.visuals = content.visuals.filter(item => item.id !== operation.blockId);
        }
    }
    state.content = materializeWorkingContent(state, draft.results, true);
    state.proseNeedsReview = true;
    return state;
}

export function reportDraftChanges(state: ReportWorkingState) {
    const before = state.baseline?.content.visuals ?? [];
    const after = state.content.visuals;
    return [...new Set([...before, ...after].map(item => item.id))].flatMap(id => {
        const original = before.find(item => item.id === id);
        const current = after.find(item => item.id === id);
        if (JSON.stringify(original) === JSON.stringify(current)) return [];
        return [{ id, title: (current ?? original)!.title, type: !original ? ('insert' as const) : !current ? ('remove' as const) : ('replace' as const) }];
    });
}
