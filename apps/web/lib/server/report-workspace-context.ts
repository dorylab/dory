import type { ActionContext } from '@dory/actions';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { ReportEvidenceReference, ReportWorkspaceContext } from '@dory/shared/types/report-workspace';
import type { WebActionServices } from '@/lib/actions/server/types';
import { selectReportEvidence } from '@/lib/work-documents/workspace-evidence';

type Context = ActionContext<WebActionServices>;
const owner = (ctx: Context) => ({ organizationId: ctx.organizationId, userId: ctx.userId });

export async function loadReportEvidence(ctx: Context, reference: ReportEvidenceReference) {
    const target = { ...owner(ctx), documentId: reference.documentId };
    const document = reference.publicationId
        ? await ctx.services.db.workDocuments.getPublication({ ...target, publicationId: reference.publicationId })
        : await ctx.services.db.workDocuments.getVersion({ ...target, revision: reference.revision });
    const evidence = selectReportEvidence(document, reference, ctx.userId);
    return { document, evidence };
}
export async function optionalArtifact(ctx: Context, artifactId: string) {
    try {
        return await ctx.services.db.artifacts.get({ ...owner(ctx), artifactId });
    } catch (error) {
        if (error instanceof DatabaseError && [403, 404].includes(error.code)) return null;
        throw error;
    }
}
export async function reportWorkspaceContext(ctx: Context, reference: ReportEvidenceReference): Promise<ReportWorkspaceContext> {
    const { document, evidence } = await loadReportEvidence(ctx, reference);
    let source: ReportWorkspaceContext['source'] = { kind: 'unavailable', reason: 'The original query source is unavailable.' };
    if (evidence.attachmentSource) source = { kind: 'attachment', dialect: 'duckdb' };
    else if (evidence.connectionId && ctx.access.permissions.connection.read) {
        const connection = await ctx.services.db.connections.getById(ctx.organizationId, evidence.connectionId);
        if (connection) {
            const artifact = await optionalArtifact(ctx, reference.artifactId);
            const database = evidence.sourceDatabaseName ?? artifact?.resultSet?.sourceDatabaseName;
            // An expired legacy result must not silently run in a different default database.
            if (database !== undefined || artifact)
                source = {
                    kind: 'database',
                    connectionId: evidence.connectionId,
                    database: database ?? null,
                    dialect: connection.connection.type,
                };
            else source = { kind: 'unavailable', reason: 'The original database context is no longer available.' };
        }
    }
    return { reference, title: document.title, evidence, source };
}
