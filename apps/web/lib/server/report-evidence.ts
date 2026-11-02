import type { ActionContext } from '@dory/actions';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { ReportEvidenceInspection, ReportEvidenceReference, ReportEvidenceRows } from '@dory/shared/types/report-workspace';
import type { WebActionServices } from '@/lib/actions/server/types';
import { loadReportEvidence, optionalArtifact } from './report-workspace-context';

type Context = ActionContext<WebActionServices>;

async function evidenceArtifact(ctx: Context, reference: ReportEvidenceReference) {
    const { document, evidence } = await loadReportEvidence(ctx, reference);
    if (evidence.snapshotId && reference.snapshotId !== evidence.snapshotId) throw new DatabaseError('The exact report snapshot is required.', 409);
    const artifact = await optionalArtifact(ctx, evidence.artifactId);
    return { document, evidence, artifact };
}

export async function inspectReportEvidence(ctx: Context, reference: ReportEvidenceReference): Promise<ReportEvidenceInspection> {
    const { evidence, artifact } = await evidenceArtifact(ctx, reference);
    return {
        evidence,
        artifactAvailable: Boolean(artifact),
        fullResultAvailable: Boolean(
            artifact?.sourceResultSetId && artifact.resultSet?.dataAvailability === 'full' && artifact.resultSet.status === 'success' && artifact.resultSet.limited === false,
        ),
        canOpenWorkspace: Boolean(evidence.sql && ctx.access.permissions.workspace.write),
    };
}

export async function readReportEvidenceRows(ctx: Context, input: ReportEvidenceReference & { offset: number; limit: number }): Promise<ReportEvidenceRows> {
    const { document, artifact } = await evidenceArtifact(ctx, input);
    if (!artifact?.sourceResultSetId || artifact.resultSet?.dataAvailability !== 'full' || artifact.resultSet.status !== 'success' || artifact.resultSet.limited !== false)
        throw new DatabaseError('The full original result is unavailable. The report snapshot is preserved.', 409);
    const result = await ctx.services.db.resultSets.readRows({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        chatId: document.chatId,
        resultSetId: artifact.sourceResultSetId,
        offset: input.offset,
        limit: input.limit,
    });
    if (result.dataAvailability !== 'full') throw new DatabaseError('The full original result is unavailable. The report snapshot is preserved.', 409);
    return { columns: result.columns.map(column => column.name), rows: result.rows, rowCount: result.rowCount, offset: result.offset, limit: result.limit };
}
