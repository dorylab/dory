'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import type { ReportEvidenceGroup, WorkDocumentContent } from '@dory/shared/types/work-document';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { attachReportEvidenceGroup, reconcileReportEvidenceGroups, removeReportEvidenceGroup, reportEvidenceParagraphs } from '@/lib/work-documents/evidence-groups';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { SelectItem } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

import { ReportSelect } from './report-select';

type Paragraph = ReturnType<typeof reportEvidenceParagraphs>[number];

function EvidenceDialog({
    content,
    paragraph,
    documentId,
    onApply,
    onClose,
}: {
    content: WorkDocumentContent;
    paragraph: Paragraph;
    documentId?: string;
    onApply: (references: ReportEvidenceGroup['references'], reviewed: boolean) => void;
    onClose: () => void;
}) {
    const t = useTranslations('WorkDocuments.Evidence');
    const { organization } = useParams<{ organization: string }>();
    const group = content.evidenceGroups?.find(item => item.id === paragraph.groupId);
    const [references, setReferences] = useState<ReportEvidenceGroup['references']>(() => structuredClone(group?.references ?? []));
    const [reviewed, setReviewed] = useState(false);
    const [source, setSource] = useState('');
    const candidates = useQuery({
        queryKey: ['report-evidence-candidates', organization, documentId],
        enabled: Boolean(documentId),
        queryFn: ({ signal }) => executeActionClient<{ artifacts: Array<{ id: string; title: string }> }>('report.evidence.candidates', { documentId }, { signal }),
    });
    const choices = [
        ...content.evidence.map(item => ({ id: item.artifactId, title: item.title })),
        ...(candidates.data?.artifacts ?? []).filter(item => !content.evidence.some(saved => saved.artifactId === item.id)),
    ];
    const available = choices.filter(item => !references.some(reference => reference.artifactId === item.id));
    const change = (next: ReportEvidenceGroup['references']) => {
        setReferences(next);
        setReviewed(false);
    };
    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl" data-testid="report-evidence-editor">
                <DialogHeader>
                    <DialogTitle>{t('Manage')}</DialogTitle>
                    <DialogDescription>{t('ManageDescription')}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 space-y-4 overflow-y-auto">
                    <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{paragraph.text}</p>
                    {references.map((reference, index) => (
                        <div key={reference.artifactId} className="space-y-2 rounded-md border p-3">
                            <div className="flex items-start justify-between gap-2">
                                <p className="break-words text-sm font-medium">{choices.find(item => item.id === reference.artifactId)?.title ?? t('Unavailable')}</p>
                                <Button variant="ghost" size="sm" onClick={() => change(references.filter((_, i) => i !== index))}>
                                    {t('Remove')}
                                </Button>
                            </div>
                            <label className="grid gap-1 text-sm">
                                {t('Explanation')}
                                <Textarea
                                    value={reference.explanation ?? ''}
                                    maxLength={1000}
                                    placeholder={t('ExplanationPlaceholder')}
                                    onChange={event => change(references.map((item, i) => (i === index ? { ...item, explanation: event.target.value } : item)))}
                                />
                            </label>
                        </div>
                    ))}
                    {!references.length && <p className="text-sm text-muted-foreground">{t('NoReferences')}</p>}
                    <div className="flex items-end gap-2">
                        <label className="grid min-w-0 flex-1 gap-1 text-sm">
                            {t('AddFromWork')}
                            <ReportSelect value={source} onValueChange={setSource} aria-label={t('ChooseSource')}>
                                <SelectItem value="__none">{t('ChooseSource')}</SelectItem>
                                {available.map(item => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {item.title}
                                    </SelectItem>
                                ))}
                            </ReportSelect>
                        </label>
                        <Button
                            variant="outline"
                            disabled={!available.some(item => item.id === source) || references.length >= 20}
                            onClick={() => {
                                change([...references, { artifactId: source, explanation: '' }]);
                                setSource('');
                            }}
                        >
                            {t('Add')}
                        </Button>
                    </div>
                    {candidates.isError && (
                        <p role="alert" className="text-sm text-destructive">
                            {t('CandidatesUnavailable')}
                        </p>
                    )}
                    {references.length > 0 && (
                        <label className="flex items-start gap-2 text-sm">
                            <Checkbox checked={reviewed} onCheckedChange={checked => setReviewed(checked === true)} />
                            <span>{t('ConfirmReview')}</span>
                        </label>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={() => onApply(references, reviewed)}>{t('Apply')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function ReportEvidenceEditor({ content, documentId, onChange }: { content: WorkDocumentContent; documentId?: string; onChange: (content: WorkDocumentContent) => void }) {
    const t = useTranslations('WorkDocuments.Evidence');
    const body = content.body ?? content.markdown;
    const [selection, setSelection] = useState('');
    const [editing, setEditing] = useState<Paragraph | null>(null);
    let paragraphs: Paragraph[];
    try {
        paragraphs = reportEvidenceParagraphs(body);
    } catch {
        return <p className="text-sm text-muted-foreground">{t('FixBodyFirst')}</p>;
    }
    const selected = paragraphs.find(item => String(item.start) === selection);
    return (
        <section className="space-y-3 rounded-md border p-3" aria-label={t('Manage')}>
            <p className="text-sm font-medium">{t('Manage')}</p>
            <div className="flex items-end gap-2">
                <label className="grid min-w-0 flex-1 gap-1 text-sm">
                    {t('Paragraph')}
                    <ReportSelect value={selection} onValueChange={setSelection} aria-label={t('Paragraph')}>
                        <SelectItem value="__none">{t('ChooseParagraph')}</SelectItem>
                        {paragraphs.map(paragraph => (
                            <SelectItem key={paragraph.start} value={String(paragraph.start)}>
                                {paragraph.text.slice(0, 100)}
                                {paragraph.text.length > 100 ? '…' : ''}
                            </SelectItem>
                        ))}
                    </ReportSelect>
                </label>
                <Button variant="outline" disabled={!selected} onClick={() => selected && setEditing(selected)}>
                    {t('Manage')}
                </Button>
            </div>
            {content.evidenceGroups?.some(group => group.needsReview) && (
                <p role="status" className="text-sm text-muted-foreground">
                    {t('ReviewRequired')}
                </p>
            )}
            {editing && (
                <EvidenceDialog
                    content={content}
                    paragraph={editing}
                    documentId={documentId}
                    onClose={() => setEditing(null)}
                    onApply={(references, reviewed) => {
                        const id = editing.groupId ?? `evidence_${crypto.randomUUID().replaceAll('-', '')}`;
                        const groups = (content.evidenceGroups ?? []).filter(group => group.id !== id);
                        const reviewedIds = (content.reviewedEvidenceGroupIds ?? []).filter(groupId => groupId !== id);
                        const nextBody = references.length ? (editing.groupId ? body : attachReportEvidenceGroup(body, editing.start, id)) : removeReportEvidenceGroup(body, id);
                        const nextReviewedIds = reviewed ? [...reviewedIds, id] : reviewedIds;
                        onChange({
                            ...content,
                            body: nextBody,
                            evidenceGroups: reconcileReportEvidenceGroups(content, nextBody, references.length ? [...groups, { id, references }] : groups, nextReviewedIds),
                            reviewedEvidenceGroupIds: nextReviewedIds,
                        });
                        setEditing(null);
                    }}
                />
            )}
        </section>
    );
}
