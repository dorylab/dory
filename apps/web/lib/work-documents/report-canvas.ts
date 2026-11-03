import type { ReportCanvasBlock, ReportWorkingState } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent } from '@dory/shared/types/work-document';

import { reportOutline } from './report-core';

// Deterministic initialization also lets an older client render a not-yet-upgraded draft.
function fingerprint(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36);
}
export function canvasBlocks(content: WorkDocumentContent, previous: ReportCanvasBlock[] = []): ReportCanvasBlock[] {
    const used = new Set<string>();
    const reserved = new Set([...previous.map(block => block.id), ...content.visuals.map(visual => visual.id)]);
    return reportOutline(content.body ?? '', content.visuals)
        .slice(1)
        .map(node => {
            const source = (content.body ?? '').slice(node.start, node.end);
            const prior = previous.find(block => !used.has(block.id) && (node.visualId ? block.visualId === node.visualId : !block.visualId && block.source === source));
            let id = prior?.id ?? node.visualId;
            if (!id) {
                const prefix = `prose_${fingerprint(source)}`;
                let count = 0;
                do {
                    id = `${prefix}_${count++}`;
                } while (used.has(id) || reserved.has(id));
            }
            used.add(id);
            return { id, source, kind: node.kind, title: node.title, ...(node.visualId ? { visualId: node.visualId } : {}) };
        });
}
export function withReportCanvas(state: ReportWorkingState): ReportWorkingState & { canvas: NonNullable<ReportWorkingState['canvas']> } {
    const revision = state.baseline?.revision ?? 1;
    const changedBaseline = state.canvas?.baselineRevision !== revision;
    const baselineBlocks = changedBaseline ? canvasBlocks(state.baseline?.content ?? state.content, state.canvas?.blocks) : state.canvas!.baselineBlocks;
    const blocks = canvasBlocks(state.content, state.canvas?.blocks ?? baselineBlocks);
    return { ...state, canvas: { blocks, baselineBlocks, baselineRevision: revision, ...(!changedBaseline && state.canvas?.undo ? { undo: state.canvas.undo } : {}) } };
}

/** A longest common subsequence prevents insertions/deletions from looking like moves. */
export function movedCanvasBlocks(before: string[], after: string[]): Set<string> {
    const surviving = new Set(after);
    const old = before.filter(id => surviving.has(id));
    const positions = new Map(old.map((id, index) => [id, index]));
    const current = after.filter(id => positions.has(id));
    const tails: number[] = [];
    const tailIndices: number[] = [];
    const parents = new Array<number>(current.length).fill(-1);
    current.forEach((id, index) => {
        const value = positions.get(id)!;
        let lo = 0,
            hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (tails[mid] < value) lo = mid + 1;
            else hi = mid;
        }
        tails[lo] = value;
        parents[index] = lo ? tailIndices[lo - 1] : -1;
        tailIndices[lo] = index;
    });
    const stationary = new Set<string>();
    for (let index = tailIndices.at(-1) ?? -1; index >= 0; index = parents[index]) stationary.add(current[index]);
    return new Set(current.filter(id => !stationary.has(id)));
}
