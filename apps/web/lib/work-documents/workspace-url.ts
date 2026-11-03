import type { ReportEvidenceReference } from '@dory/shared/types/report-workspace';
import { createSerializer, parseAsInteger, parseAsString } from 'nuqs';

export const reportWorkspaceParsers = { revision: parseAsInteger, publication: parseAsString, snapshot: parseAsString, componentId: parseAsString, groupId: parseAsString };
export const reportArtifactParsers = { report: parseAsString, ...reportWorkspaceParsers };
const serialize = createSerializer(reportWorkspaceParsers);
export function buildReportWorkspacePath(organization: string, reference: ReportEvidenceReference) {
    return serialize(
        `/${encodeURIComponent(organization)}/reports/${encodeURIComponent(reference.documentId)}/workspace${reference.artifactId ? `/${encodeURIComponent(reference.artifactId)}` : ''}`,
        {
            revision: reference.revision,
            publication: reference.publicationId ?? null,
            snapshot: reference.snapshotId ?? null,
            componentId: reference.componentId ?? null,
            groupId: reference.groupId ?? null,
        },
    );
}
export function reportWorkspaceReturnPath(organization: string, reference: ReportEvidenceReference) {
    return serialize(`/${encodeURIComponent(organization)}/reports/${encodeURIComponent(reference.documentId)}`, {
        revision: reference.publicationId ? null : reference.revision,
        publication: reference.publicationId ?? null,
    });
}
