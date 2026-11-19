'use client';

import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/registry/new-york-v4/ui/button';
import type { WorkDocumentContent, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { useTranslations } from 'next-intl';

import { editableReport, parseReport, reportEmbeds, reportTagSource } from '@/lib/work-documents/report-core';

import { ReportBody } from './report-body';
import type { ReportBlockEditorHandle } from './report-block-editor';
import type { ComponentDialogHandle } from './report-component-dialog';

function EditorLoading() {
    const t = useTranslations('WorkDocuments');
    return (
        <p role="status" className="py-4 text-sm text-muted-foreground">
            {t('Loading')}
        </p>
    );
}
const BlockEditor = dynamic(() => import('./report-block-editor'), { ssr: false, loading: EditorLoading });
const SourceEditor = dynamic(() => import('./source-editor'), { ssr: false });
const ComponentDialog = dynamic(() => import('./report-component-dialog'), { ssr: false });
export type ReportEditorHandle = { requestLeave: () => Promise<boolean>; hasPendingChanges: () => boolean; insert: (type: WorkVisual['type']) => void };
export default function ReportEditor({
    ref,
    mode,
    onSource,
    content,
    documentId,
    restrictSources,
    title,
    onChange,
    onEvidenceGroup,
}: {
    ref?: Ref<ReportEditorHandle>;
    mode: 'blocks' | 'source';
    onSource: () => void;
    content: WorkDocumentContent;
    documentId: string;
    restrictSources?: boolean;
    title: string;
    onChange: (content: WorkDocumentContent) => void;
    onEvidenceGroup?: (id: string) => void;
}) {
    const t = useTranslations('WorkDocuments.Report');
    const incoming = editableReport(content);
    // Autosave prunes unreferenced metadata on the server. Keep the editing
    // session's bindings available for undo and for switching editing surfaces.
    const retained = useRef(incoming);
    const retain = <T,>(latest: T[], previous: T[], key: (value: T) => string) => [...latest, ...previous.filter(value => !latest.some(item => key(item) === key(value)))];
    const current = {
        ...incoming,
        visuals: retain(incoming.visuals, retained.current.visuals, value => value.id),
        evidence: retain(incoming.evidence, retained.current.evidence, value => value.artifactId),
        evidenceGroups: retain(incoming.evidenceGroups ?? [], retained.current.evidenceGroups ?? [], value => value.id),
    };
    current.embeds = reportEmbeds(current.visuals, current.evidence);
    retained.current = current;
    const [previews, setPreviews] = useState<WorkEvidence[]>([]);
    // Pending rows are for rendering only. The report service saves its own snapshots.
    const displayEvidence = retain(current.evidence, previews, value => value.artifactId);
    const displayContent = { ...current, evidence: displayEvidence, embeds: reportEmbeds(current.visuals, displayEvidence) };
    const [session, setSession] = useState<{ visual: WorkVisual; insert: boolean } | null>(null);
    const blockEditor = useRef<ReportBlockEditorHandle>(null);
    const dialog = useRef<ComponentDialogHandle>(null);
    const host = useRef<HTMLDivElement>(null);
    const opener = useRef<HTMLElement | null>(null);
    const close = () => {
        blockEditor.current?.resetInsertionAnchor();
        setSession(null);
        requestAnimationFrame(() => {
            if (opener.current?.isConnected) opener.current.focus();
        });
    };
    const open = (visual: WorkVisual, insert: boolean) => {
        opener.current = insert
            ? ([...(host.current?.closest('[data-testid="work-report"]')?.querySelectorAll<HTMLElement>('[data-report-insert], [data-report-more]') ?? [])].find(
                  element => element.getClientRects().length > 0,
              ) ?? null)
            : (window.document.activeElement as HTMLElement | null);
        setSession({ visual: structuredClone(visual), insert });
    };
    const insert = (type: WorkVisual['type']) =>
        open(
            {
                id: `embed_${crypto.randomUUID().replaceAll('-', '')}`,
                type,
                title: t(type === 'metric' ? 'Metric' : type === 'chart' ? 'Chart' : 'Table'),
                evidenceId: '',
                ...(type === 'metric' ? { metric: { column: '', rowIndex: 0 } } : type === 'chart' ? { chart: { type: 'bar', xKey: '', yKey: '' } } : {}),
            },
            true,
        );
    useImperativeHandle(ref, () => ({
        // Invalid block operations remain in the editor until corrected or undone.
        hasPendingChanges: () => mode === 'blocks' && blockEditor.current?.requestLeave() === false,
        requestLeave: async () => {
            if (mode === 'blocks' && blockEditor.current?.requestLeave() === false) return false;
            if (!((await dialog.current?.requestLeave()) ?? true)) return false;
            close();
            return true;
        },
        insert,
    }));
    const update = (visuals: WorkVisual[], body = current.body!) =>
        onChange({ ...current, body, visuals, reviewedEvidenceGroupIds: [], embeds: reportEmbeds(visuals, current.evidence) });
    const pending = current.visuals.filter(visual => !displayEvidence.some(evidence => evidence.artifactId === visual.evidenceId));
    const pendingEvidence = current.evidenceGroups?.some(group =>
        group.references.some(reference => !current.evidence.some(evidence => evidence.artifactId === reference.artifactId)),
    );
    const diagnostics = parseReport(current.body!, current.visuals).diagnostics;
    return (
        <>
            <div ref={host} data-testid="report-editor" className={mode === 'source' ? 'flex min-h-0 flex-1 flex-col' : undefined}>
                {mode === 'blocks' ? (
                    <BlockEditor
                        ref={blockEditor}
                        content={current}
                        displayEvidence={displayEvidence}
                        documentId={documentId}
                        onChange={(body, visuals) => update(visuals ?? current.visuals, body)}
                        onEvidenceChange={onChange}
                        onInsert={insert}
                        onEdit={visual => open(visual, false)}
                        onSource={onSource}
                    />
                ) : (
                    <div className="report-editor-columns min-h-0 min-w-0 flex-1 gap-6">
                        <SourceEditor fill value={current.body!} onChange={body => update(current.visuals, body)} />
                        <div className="min-h-0 min-w-0 shrink-0 overflow-auto">
                            {diagnostics.length ? (
                                <ul role="alert" className="text-sm text-destructive">
                                    {diagnostics.map((item, i) => (
                                        <li key={i}>
                                            {item.line}:{item.column} {item.message}
                                        </li>
                                    ))}
                                </ul>
                            ) : pending.length || pendingEvidence ? (
                                <div className="space-y-3 text-sm">
                                    <p role="status" className="text-muted-foreground">
                                        {t('PendingBinding')}
                                    </p>
                                    {pending.map(visual => (
                                        <Button key={visual.id} variant="outline" onClick={() => open(visual, false)}>
                                            {t('EditNamedComponent', { title: visual.title })}
                                        </Button>
                                    ))}
                                </div>
                            ) : (
                                <ReportBody
                                    content={displayContent}
                                    title={title}
                                    onEvidenceGroup={onEvidenceGroup}
                                    onEditComponent={id => {
                                        const visual = current.visuals.find(item => item.id === id);
                                        if (visual) open(visual, false);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
            {session && (
                <ComponentDialog
                    restrictSources={restrictSources}
                    ref={dialog}
                    initial={session.visual}
                    documentId={documentId}
                    content={current}
                    onClose={close}
                    onApply={(visual, evidence) => {
                        if (!current.evidence.some(item => item.artifactId === evidence.artifactId)) {
                            setPreviews(previous => [{ ...evidence, snapshotId: '' }, ...previous.filter(item => item.artifactId !== evidence.artifactId)]);
                        }
                        const visuals = session.insert ? [...current.visuals, visual] : current.visuals.map(item => (item.id === visual.id ? visual : item));
                        if (mode === 'blocks' && session.insert) blockEditor.current?.insertVisual(visual, visuals);
                        else update(visuals, session.insert ? `${current.body}\n\n${reportTagSource(visual)}\n` : current.body);
                        close();
                    }}
                />
            )}
        </>
    );
}
