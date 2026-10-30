import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { canReadAttachmentSource, type ChatAttachmentSource } from '@dory/shared/types/chat-attachment';
import type { ReportEvidenceReference } from '@dory/shared/types/report-workspace';
import type { WorkDocumentContent } from '@dory/shared/types/work-document';

export function selectReportEvidence(document: { revision: number; chatId: string | null; content: WorkDocumentContent }, reference: ReportEvidenceReference, userId: string) {
    if (document.revision !== reference.revision) throw new DatabaseError('Report version does not match.', 409);
    const evidence = document.content.evidence.find(item => item.artifactId === reference.artifactId && (!reference.snapshotId || item.snapshotId === reference.snapshotId));
    if (!evidence) throw new DatabaseError('Report snapshot not found in this version.', 404);
    if (!canReadAttachmentSource(evidence.attachmentSource, userId, document.chatId)) throw new DatabaseError('Private attachment result unavailable.', 403);
    return evidence;
}

export function assertReportAttachmentDataset(source: ChatAttachmentSource, data: { attachmentId: string; sha256: string; tables: Array<{ name: string }> }) {
    const expected = source.files.filter(file => file.attachmentId === data.attachmentId);
    if (!expected.length || expected.some(file => file.sha256 !== data.sha256 || !data.tables.some(table => table.name === file.table)))
        throw new Error('The original attachment has changed. The report snapshot is preserved.');
}
