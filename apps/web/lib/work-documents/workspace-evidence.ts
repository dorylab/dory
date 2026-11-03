import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { canReadAttachmentSource, type ChatAttachmentSource } from '@dory/shared/types/chat-attachment';
import type { ReportEvidenceReference } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent } from '@dory/shared/types/work-document';

export function selectReportEvidence(document: { revision: number; chatId: string | null; content: WorkDocumentContent }, reference: ReportEvidenceReference, userId: string) {
    if (document.revision !== reference.revision) throw new DatabaseError('Report version does not match.', 409);
    const evidence = document.content.evidence.find(item => item.artifactId === reference.artifactId && (!reference.snapshotId || item.snapshotId === reference.snapshotId));
    if (!evidence) throw new DatabaseError('Report snapshot not found in this version.', 404);
    if (!canReadAttachmentSource(evidence.attachmentSource, userId, document.chatId)) throw new DatabaseError('Private attachment result unavailable.', 403);
    if (reference.componentId && reference.groupId) throw new DatabaseError('Choose one report target.', 400);
    if (reference.componentId && !document.content.visuals.some(visual => visual.id === reference.componentId && visual.evidenceId === reference.artifactId))
        throw new DatabaseError('The report component no longer references this result. Select the target again.', 409);
    if (
        reference.groupId &&
        !document.content.evidenceGroups?.some(group => group.id === reference.groupId && group.references.some(item => item.artifactId === reference.artifactId))
    )
        throw new DatabaseError('The conclusion no longer references this result. Select the target again.', 409);
    return evidence;
}

export function assertReportAttachmentDataset(source: ChatAttachmentSource, data: { attachmentId: string; sha256: string; tables: Array<{ name: string }> }) {
    const expected = source.files.filter(file => file.attachmentId === data.attachmentId);
    if (!expected.length || expected.some(file => file.sha256 !== data.sha256 || !data.tables.some(table => table.name === file.table)))
        throw new Error('The original attachment has changed. The report snapshot is preserved.');
}
