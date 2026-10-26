import type { AgentWorkOutput } from '@dory/shared/types/agent-work';
import type { WorkDocumentView } from '@dory/shared/types/work-document';

import type { ArtifactDetail } from '@/lib/artifacts/types';
import { executeActionClient } from '@/lib/actions/client';
import { getPreviewColumnNames } from '@/lib/agent-runs/report';
import { getChartResultFromPart } from '@/lib/agent-runs/chart-result';
import type { ChartResultPart } from '@/components/@dory/ui/ai/charts-result';
import { workRequest } from './client';
import { renderSharedReport } from './share';
import { workVisualHtml } from './render';

type Rows = { rows: Record<string, unknown>[]; columns: unknown[]; rowCount: number | null; dataAvailability: string };
export type SharePreview =
    | { type: 'report'; html: string }
    | { type: 'visual'; html: string }
    | { type: 'message'; chart: ChartResultPart }
    | { type: 'artifact'; artifact: ArtifactDetail; rows: Record<string, unknown>[]; columns: string[]; columnsRaw: unknown[]; previewOnly: boolean };

export async function loadSharePreview(output: AgentWorkOutput, chatId: string, organizationId: string, signal: AbortSignal): Promise<SharePreview> {
    if (!output.available) throw new Error('Unavailable');
    const origin = output.origin;
    if (origin.kind === 'report') {
        const { document } = await workRequest<{ document: WorkDocumentView }>(`/api/work-documents/${encodeURIComponent(origin.documentId)}`, undefined, signal);
        if (document.chatId !== chatId || document.status !== 'ready' || document.archivedAt) throw new Error('Unavailable');
        if (!origin.visualId) return { type: 'report', html: renderSharedReport(document) };
        const visual = document.content.visuals.find(item => item.id === origin.visualId);
        const evidence = visual && document.content.evidence.find(item => item.artifactId === visual.evidenceId);
        if (!visual || !evidence || !evidence.rows.length) throw new Error('Unavailable');
        return { type: 'visual', html: workVisualHtml(visual, evidence, false) };
    }
    if (origin.kind === 'message') {
        const { apiFetchSessionDetail } = await import('@/app/(app)/[organization]/[connectionId]/chatbot/core/api');
        const { messages } = await apiFetchSessionDetail(chatId, { signal });
        const message = messages.find(item => item.id === origin.messageId);
        const part = message?.parts.find(item => 'toolCallId' in item && item.toolCallId === origin.toolCallId);
        const chart = part && getChartResultFromPart(part);
        if (!chart || chart.dataState === 'missing' || chart.dataState === 'invalid-fields' || !chart.data.length) throw new Error('Unavailable');
        return { type: 'message', chart };
    }
    const artifact = await executeActionClient<ArtifactDetail>('artifact.get', { artifactId: origin.artifactId }, { organizationId, signal });
    if (artifact.status !== 'ready' || !artifact.sourceResultSetId || (artifact.expiresAt && Date.parse(artifact.expiresAt) <= Date.now())) throw new Error('Unavailable');
    const read = (offset: number) => executeActionClient<Rows>('resultSet.rows.read', { resultSetId: artifact.sourceResultSetId, offset, limit: 5000 }, { organizationId, signal });
    const first = await read(0);
    if (first.dataAvailability === 'none') throw new Error('Unavailable');
    const rows = [...first.rows];
    if (first.dataAvailability === 'full') {
        let page = first.rows;
        while (page.length === 5000 && (first.rowCount === null || rows.length < first.rowCount)) {
            const next = await read(rows.length);
            if (next.dataAvailability !== first.dataAvailability) throw new Error('Unavailable');
            page = next.rows;
            rows.push(...page);
        }
    }
    if (output.type === 'chart' && !rows.length) throw new Error('Unavailable');
    return {
        type: 'artifact',
        artifact,
        rows,
        columns: getPreviewColumnNames(first.columns, rows),
        columnsRaw: first.columns,
        previewOnly: first.dataAvailability !== 'full' || (first.rowCount !== null && rows.length < first.rowCount),
    };
}
