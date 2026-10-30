import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { ReportQueryTab, ReportWorkingDraft, ReportWorkingState } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent, WorkVisual, WorkEvidence } from '@dory/shared/types/work-document';
import { editableReport, parseReport, reportEmbeds } from './report-core';
import { referencedEvidence } from './markdown';
import { reportNumber } from './format';

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
    return { title, content, tabs, activeTabId: tabs[0]?.id ?? null, proseNeedsReview: false };
}

export function validateWorkingVisual(visual: WorkVisual, evidence: WorkEvidence) {
    if (evidence.truncated && !visual.allowSubset) throw new DatabaseError(`“${visual.title}”: explicitly allow partial results or rerun an aggregate query.`, 400);
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
    const referenced = referencedEvidence(content.markdown, content.visuals);
    const evidence = content.evidence.filter(item => referenced.ids.includes(item.artifactId));
    return { ...content, visuals: referenced.visuals, evidence, embeds: reportEmbeds(referenced.visuals, evidence), agentWrite: undefined };
}
