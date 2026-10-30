'use client';

import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/registry/new-york-v4/ui/button';
import type { WorkDocumentContent, WorkVisual } from '@dory/shared/types/work-document';
import { useTranslations } from 'next-intl';

import { editableReport, parseReport, reportEmbeds, reportTagSource } from '@/lib/work-documents/report-core';

import { ReportBody } from './report-body';
import type { ComponentDialogHandle } from './report-component-dialog';

const SourceEditor = dynamic(() => import('./source-editor'), { ssr: false });
const ComponentDialog = dynamic(() => import('./report-component-dialog'), { ssr: false });
export type ReportEditorHandle = { requestLeave: () => Promise<boolean>; insert: (type: WorkVisual['type']) => void };
export default function ReportEditor({
    ref,
    content,
    restrictSources,
    title,
    onChange,
    onEvidence,
}: {
    ref?: Ref<ReportEditorHandle>;
    content: WorkDocumentContent;
    restrictSources?: boolean;
    title: string;
    onChange: (content: WorkDocumentContent) => void;
    onEvidence: (id: string) => void;
}) {
    const t = useTranslations('WorkDocuments.Report');
    const current = editableReport(content);
    const [session, setSession] = useState<{ visual: WorkVisual; insert: boolean } | null>(null);
    const dialog = useRef<ComponentDialogHandle>(null);
    const host = useRef<HTMLDivElement>(null);
    const opener = useRef<HTMLElement | null>(null);
    const close = () => {
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
    useImperativeHandle(ref, () => ({
        requestLeave: async () => {
            if (!((await dialog.current?.requestLeave()) ?? true)) return false;
            close();
            return true;
        },
        insert: type =>
            open(
                {
                    id: `embed_${crypto.randomUUID().replaceAll('-', '')}`,
                    type,
                    title: t(type === 'metric' ? 'Metric' : type === 'chart' ? 'Chart' : 'Table'),
                    evidenceId: '',
                    ...(type === 'metric' ? { metric: { column: '', rowIndex: 0 } } : type === 'chart' ? { chart: { type: 'bar', xKey: '', yKey: '' } } : {}),
                },
                true,
            ),
    }));
    const update = (visuals: WorkVisual[], body = current.body!) => onChange({ ...current, body, visuals, embeds: reportEmbeds(visuals, current.evidence) });
    const pending = current.visuals.filter(visual => !current.evidence.some(evidence => evidence.artifactId === visual.evidenceId));
    const diagnostics = parseReport(current.body!, current.visuals).diagnostics;
    return (
        <>
            <div ref={host} className="report-editor-columns grid min-w-0 gap-6">
                <SourceEditor value={current.body!} onChange={body => update(current.visuals, body)} />
                <div className="min-w-0 overflow-auto">
                    {diagnostics.length ? (
                        <ul role="alert" className="text-sm text-destructive">
                            {diagnostics.map((item, i) => (
                                <li key={i}>
                                    {item.line}:{item.column} {item.message}
                                </li>
                            ))}
                        </ul>
                    ) : pending.length ? (
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
                            content={current}
                            title={title}
                            onEvidence={onEvidence}
                            onEditComponent={id => {
                                const visual = current.visuals.find(item => item.id === id);
                                if (visual) open(visual, false);
                            }}
                        />
                    )}
                </div>
            </div>
            {session && (
                <ComponentDialog
                    restrictSources={restrictSources}
                    ref={dialog}
                    initial={session.visual}
                    content={current}
                    onClose={close}
                    onApply={visual => {
                        const visuals = session.insert ? [...current.visuals, visual] : current.visuals.map(item => (item.id === visual.id ? visual : item));
                        update(visuals, session.insert ? `${current.body}\n\n${reportTagSource(visual)}\n` : current.body);
                        close();
                    }}
                />
            )}
        </>
    );
}
