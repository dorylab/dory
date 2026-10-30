import { createSerializer, parseAsInteger, parseAsString } from 'nuqs';
import type { ReportEvidenceReference } from '@dory/shared/types/report-workspace';

export const reportWorkspaceParsers = { revision: parseAsInteger, publication: parseAsString, snapshot: parseAsString };
const serialize = createSerializer(reportWorkspaceParsers);
export function buildReportWorkspacePath(organization: string, reference: ReportEvidenceReference) {
    return serialize(`/${encodeURIComponent(organization)}/reports/${encodeURIComponent(reference.documentId)}/workspace/${encodeURIComponent(reference.artifactId)}`, {
        revision: reference.revision,
        publication: reference.publicationId ?? null,
        snapshot: reference.snapshotId ?? null,
    });
}
export function reportWorkspaceReturnPath(organization: string, reference: ReportEvidenceReference) {
    return serialize(`/${encodeURIComponent(organization)}/reports/${encodeURIComponent(reference.documentId)}`, {
        revision: reference.publicationId ? null : reference.revision,
        publication: reference.publicationId ?? null,
    });
}
