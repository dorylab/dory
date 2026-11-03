import type { WorkDocumentContent, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import type { WorkspaceChartSpec } from '@dory/shared/types/workspace-chart';

import { reportEvidenceParagraphs } from './evidence-groups';
import { reportOutline, type ReportOutlineItem } from './report-core';

export type ReportStructureNode = ReportOutlineItem & { parentId: string; groupId?: string; children: ReportStructureNode[] };

/** Presentation hierarchy only. Insertion anchors still belong to the revision-scoped MDX outline. */
export function reportStructure(content: WorkDocumentContent): ReportStructureNode {
    const items = reportOutline(content.body ?? '', content.visuals);
    const root: ReportStructureNode = { ...items[0], parentId: '', children: [] };
    const stack = [root];
    const paragraphs = reportEvidenceParagraphs(content.body ?? '');
    for (const item of items.slice(1)) {
        if (item.kind === 'section') {
            while (stack.length > 1 && (stack.at(-1)!.depth ?? 0) >= (item.depth ?? 0)) stack.pop();
        }
        const parent = stack.at(-1)!;
        const findings = paragraphs.filter(paragraph => paragraph.groupId && paragraph.start >= item.start && paragraph.end <= item.end);
        const node: ReportStructureNode = { ...item, parentId: parent.id, children: [] };
        if (findings.length) {
            // Lists can contain several linked findings; each keeps its own position and identity.
            for (const paragraph of paragraphs.filter(paragraph => paragraph.start >= item.start && paragraph.end <= item.end)) {
                parent.children.push({
                    ...node,
                    id: paragraph.groupId ? `finding:${paragraph.groupId}` : `text:${paragraph.start}`,
                    kind: paragraph.groupId ? 'finding' : 'text',
                    title: paragraph.text.replace(/\s+/g, ' '),
                    groupId: paragraph.groupId,
                });
            }
        } else parent.children.push(node);
        if (item.kind === 'section') stack.push(node);
    }
    return root;
}

export function flattenReportStructure(root: ReportStructureNode): ReportStructureNode[] {
    return [root, ...root.children.flatMap(flattenReportStructure)];
}

export function reportNodePath(nodes: ReportStructureNode[], id: string): string[] {
    const node = nodes.find(item => item.id === id || item.visualId === id);
    if (!node || node.id === 'root') return [];
    return [...reportNodePath(nodes, node.parentId), node.title];
}

export function chartFields(visual: Pick<WorkVisual, 'chart' | 'chartSpec'>): string[] {
    const spec = visual.chartSpec;
    if (spec)
        return [
            ...new Set(
                [
                    spec.xKey,
                    ...(spec.yKey.includes(':') ? [spec.yKey.slice(spec.yKey.indexOf(':') + 1)] : []),
                    ...(spec.groupKey && spec.groupKey !== '__none__' ? [spec.groupKey] : []),
                    ...(spec.filters ?? []).map(filter => filter.col),
                    ...(spec.search?.columns ?? []),
                ].filter(Boolean),
            ),
        ];
    return visual.chart ? [visual.chart.xKey, ...(visual.chart.yKeys?.map(series => series.key) ?? [visual.chart.yKey!])] : [];
}

export function remapChartFields(visual: WorkVisual, fields: Record<string, string>): WorkVisual {
    const next = structuredClone(visual);
    const key = (value: string) => (Object.hasOwn(fields, value) ? fields[value] : value);
    if (next.chartSpec) {
        const spec = next.chartSpec;
        spec.xKey = key(spec.xKey);
        if (spec.yKey.includes(':')) {
            const separator = spec.yKey.indexOf(':');
            spec.yKey = `${spec.yKey.slice(0, separator)}:${key(spec.yKey.slice(separator + 1))}`;
        }
        if (spec.groupKey !== '__none__') spec.groupKey = key(spec.groupKey);
        spec.filters = spec.filters?.map(filter => ({ ...filter, col: key(filter.col) }));
        if (spec.search?.columns) spec.search.columns = spec.search.columns.map(key);
    }
    if (next.chart) {
        next.chart.xKey = key(next.chart.xKey);
        if (next.chart.yKeys) next.chart.yKeys = next.chart.yKeys.map(series => ({ ...series, key: key(series.key) }));
        else next.chart.yKey = key(next.chart.yKey);
    }
    delete next.chartData;
    return next;
}

export function sameChartSpec(left: WorkspaceChartSpec | undefined, right: WorkspaceChartSpec | undefined): boolean {
    if (!left || !right) return left === right;
    return (
        left.version === right.version &&
        left.chartType === right.chartType &&
        left.xKey === right.xKey &&
        left.yKey === right.yKey &&
        left.groupKey === right.groupKey &&
        (left.chartColorPreset ?? 'blue') === (right.chartColorPreset ?? 'blue') &&
        JSON.stringify(left.filters ?? []) === JSON.stringify(right.filters ?? []) &&
        (left.search?.text ?? '') === (right.search?.text ?? '') &&
        JSON.stringify(left.search?.columns ?? []) === JSON.stringify(right.search?.columns ?? [])
    );
}

export function resultUsedBy(visuals: WorkVisual[], evidence: WorkEvidence, spec?: WorkspaceChartSpec): WorkVisual[] {
    return visuals.filter(visual => visual.evidenceId === evidence.artifactId && (!spec || (visual.type === 'chart' && sameChartSpec(visual.chartSpec, spec))));
}

/** Transport/database failures should never become a SQL dump in the product UI. */
export function workspaceErrorMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return message && message.length < 300 && !/failed query|\bselect\b.+\bfrom\b|params:|stack trace|\b(insert into|update .+ set)\b/i.test(message) ? message : fallback;
}
