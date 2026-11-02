import type { ReportEvidenceGroup, WorkDocumentContent } from '@dory/shared/types/work-document';
import type { Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);
const groupUrl = /^dory:\/\/evidence-group\/([a-zA-Z0-9_-]+)$/;
export type ReportEvidenceParagraph = { start: number; end: number; text: string; groupId?: string };

function paragraphReferences(body: string) {
    const tree = parser.parse(body) as Root;
    const paragraphs: ReportEvidenceParagraph[] = [];
    const markers: Array<{ id: string; start: number; end: number }> = [];
    const visit = (node: Nodes, paragraph?: ReportEvidenceParagraph) => {
        if (node.type === 'paragraph' && node.position) {
            paragraph = { start: node.position.start.offset!, end: node.position.end.offset!, text: '' };
            paragraphs.push(paragraph);
        }
        if (node.type === 'link' && groupUrl.test(node.url)) {
            if (!paragraph || !node.position) throw new Error('Evidence groups must be linked from a body paragraph.');
            const id = groupUrl.exec(node.url)![1];
            if (paragraph.groupId || markers.some(marker => marker.id === id)) throw new Error('Each evidence group must belong to exactly one paragraph.');
            paragraph.groupId = id;
            markers.push({ id, start: node.position.start.offset!, end: node.position.end.offset! });
        }
        if ('children' in node) for (const child of node.children) visit(child, paragraph);
    };
    visit(tree);
    for (const paragraph of paragraphs) {
        let text = body.slice(paragraph.start, paragraph.end);
        for (const marker of markers.filter(item => item.start >= paragraph.start && item.end <= paragraph.end).reverse()) {
            text = text.slice(0, marker.start - paragraph.start) + text.slice(marker.end - paragraph.start);
        }
        paragraph.text = text.trim();
        if (!paragraph.text && paragraph.groupId) throw new Error('An evidence group must support non-empty prose.');
    }
    return { paragraphs: paragraphs.filter(paragraph => paragraph.text && !paragraph.text.startsWith('![')), markers };
}

export function reportEvidenceParagraphs(body: string): ReportEvidenceParagraph[] {
    return paragraphReferences(body).paragraphs;
}

export function reportEvidenceGroupText(body: string, id: string): string {
    return reportEvidenceParagraphs(body).find(paragraph => paragraph.groupId === id)?.text ?? '';
}

export function attachReportEvidenceGroup(body: string, start: number, id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid evidence group ID.');
    const paragraphs = reportEvidenceParagraphs(body);
    const paragraph = paragraphs.find(item => item.start === start);
    if (!paragraph || paragraph.groupId || paragraphs.some(item => item.groupId === id)) throw new Error('Select an unlinked paragraph.');
    return body.slice(0, paragraph.end) + ` [Evidence](dory://evidence-group/${id})` + body.slice(paragraph.end);
}

export function removeReportEvidenceGroup(body: string, id: string): string {
    const marker = paragraphReferences(body).markers.find(item => item.id === id);
    return marker ? body.slice(0, marker.start) + body.slice(marker.end) : body;
}

/** Resolve only live paragraph anchors; omitted groups preserve old callers' metadata. */
export function reconcileReportEvidenceGroups(
    previous: Pick<WorkDocumentContent, 'body' | 'markdown' | 'evidenceGroups'>,
    body: string,
    inputGroups?: ReportEvidenceGroup[],
    reviewedGroupIds: string[] = [],
): ReportEvidenceGroup[] {
    const paragraphs = reportEvidenceParagraphs(body);
    const groups = inputGroups ?? previous.evidenceGroups ?? [];
    if (new Set(groups.map(group => group.id)).size !== groups.length) throw new Error('Evidence group IDs must be unique.');
    const byId = new Map(groups.map(group => [group.id, group]));
    let previousParagraphs: ReportEvidenceParagraph[] = [];
    try {
        previousParagraphs = previous.evidenceGroups?.length ? reportEvidenceParagraphs(previous.body ?? previous.markdown) : [];
    } catch {
        // A recoverable draft syntax error must not prevent fixing the prose.
        // Without a previous anchor match its existing groups require review.
    }
    const liveIds = new Set(paragraphs.flatMap(paragraph => (paragraph.groupId ? [paragraph.groupId] : [])));
    const removedGroups = (previous.evidenceGroups ?? []).filter(group => !liveIds.has(group.id));
    if (reviewedGroupIds.some(id => !liveIds.has(id))) throw new Error('The reviewed evidence group is not in this report.');
    return paragraphs.flatMap(paragraph => {
        if (!paragraph.groupId) return [];
        const group = byId.get(paragraph.groupId);
        if (!group || !group.references.length) throw new Error('Missing evidence group references.');
        if (new Set(group.references.map(reference => reference.artifactId)).size !== group.references.length)
            throw new Error('Evidence references must be unique within a paragraph.');
        const prior = previous.evidenceGroups?.find(item => item.id === group.id);
        // Replacing an existing anchor with a new ID must not silently clear review.
        const changed = prior
            ? JSON.stringify(prior.references) !== JSON.stringify(group.references) || previousParagraphs.find(item => item.groupId === group.id)?.text !== paragraph.text
            : removedGroups.length > 0;
        return [{ id: group.id, references: group.references, needsReview: reviewedGroupIds.includes(group.id) ? false : changed || Boolean(prior?.needsReview) }];
    });
}

export function validateReportEvidenceGroups(body: string, groups: ReportEvidenceGroup[] = []) {
    return reconcileReportEvidenceGroups({ body, markdown: body, evidenceGroups: groups }, body, groups);
}
