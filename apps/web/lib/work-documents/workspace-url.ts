import type { ReportEvidenceReference } from '@dory/shared/types/report-workspace';
import { createSerializer, parseAsInteger, parseAsString } from 'nuqs';

export const reportWorkspaceParsers = { revision: parseAsInteger, publication: parseAsString, snapshot: parseAsString, componentId: parseAsString, groupId: parseAsString };
export type ReportRunOrigin = { workId: string; connectionId?: string | null; tabId?: string | null; sessionId?: string | null; section?: string | null; historical?: boolean };
const serializeRun = createSerializer({ run: parseAsString, connection: parseAsString, section: parseAsString, tabId: parseAsString, history: parseAsString });
export function reportRunWorkspacePath(organization: string, reference: ReportEvidenceReference, run: ReportRunOrigin) {
    return serializeRun(buildReportWorkspacePath(organization, reference), {
        run: run.workId,
        connection: run.connectionId,
        section: run.section,
        tabId: run.tabId,
        history: run.historical ? '1' : null,
    });
}
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
export function reportWorkspaceReturnPath(organization: string, reference: ReportEvidenceReference, historical = true) {
    return serialize(`/${encodeURIComponent(organization)}/reports/${encodeURIComponent(reference.documentId)}`, {
        revision: !historical || reference.publicationId ? null : reference.revision,
        publication: reference.publicationId ?? null,
    });
}
