'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AgentWorkSummary } from '@dory/shared/types/agent-work';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { loadSharePreview } from '@/lib/work-documents/share-client';
import { downloadShare, shareCsv, shareFilename } from '@/lib/work-documents/share';
import { formatWorkValue } from '@/lib/work-documents/render';

const ChartResultCard = dynamic(() => import('@/components/@dory/ui/ai/charts-result').then(module => module.ChartResultCard), { ssr: false });
const Charts = dynamic(() => import('@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts').then(module => module.Charts), {
    ssr: false,
});

const chartSelector = 'svg.recharts-surface,svg[role="img"],canvas,[data-share-artifact-chart] [style*="grid-template-columns"]';

export function WorkShareDialog({ work, onClose }: { work: AgentWorkSummary; onClose: () => void }) {
    const t = useTranslations('WorkDocuments.Works');
    const organizationId = useOrganizationId();
    const [selectedId, setSelectedId] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(false);
    const [chartReady, setChartReady] = useState(false);
    const imageRef = useRef<HTMLDivElement>(null);
    const output = work.outputs.find(item => item.id === selectedId);
    const preview = useQuery({
        queryKey: ['work-share-preview', organizationId, work.id, work.updatedAt, selectedId],
        enabled: Boolean(output?.available),
        staleTime: 0,
        gcTime: 0,
        retry: false,
        queryFn: ({ signal }) => loadSharePreview(output!, work.id, organizationId, signal),
    });
    const data = preview.data;
    const csv = output?.type === 'result' && data?.type === 'artifact';
    const chart = Boolean(data && data.type !== 'report' && !csv);
    useEffect(() => {
        setChartReady(false);
        const element = imageRef.current;
        if (!chart || !element) return;
        const update = () => setChartReady(Boolean(element.querySelector(chartSelector)));
        const observer = new MutationObserver(update);
        observer.observe(element, { childList: true, subtree: true });
        update();
        return () => observer.disconnect();
    }, [chart, data]);
    const doExport = async () => {
        if (!data || !output || exporting) return;
        setExporting(true);
        setExportError(false);
        try {
            if (data.type === 'report') downloadShare(new Blob([data.html], { type: 'text/html;charset=utf-8' }), shareFilename(output.title, 'html'));
            else if (csv)
                downloadShare(
                    new Blob([shareCsv(data.columns, data.rows)], { type: 'text/csv;charset=utf-8' }),
                    shareFilename(`${output.title}-${data.rows.length}-rows`, 'csv', data.previewOnly),
                );
            else {
                if (!imageRef.current || !imageRef.current.querySelector(chartSelector)) throw new Error('Chart is not ready');
                await document.fonts.ready;
                const { toBlob } = await import('html-to-image');
                const blob = await toBlob(imageRef.current, {
                    pixelRatio: 2,
                    backgroundColor: getComputedStyle(imageRef.current).backgroundColor,
                });
                if (!blob) throw new Error('Unable to export chart');
                downloadShare(blob, shareFilename(output.title, 'png'));
            }
        } catch {
            setExportError(true);
        } finally {
            setExporting(false);
        }
    };
    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open && !exporting) onClose();
            }}
        >
            <DialogContent className="flex max-h-[90dvh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-4xl" data-testid="work-share-dialog">
                <DialogHeader>
                    <DialogTitle>{t('Share')}</DialogTitle>
                    <DialogDescription>{t('ShareDescription')}</DialogDescription>
                </DialogHeader>
                <label className="space-y-2 text-sm">
                    <span>{t('ChooseOutput')}</span>
                    <select
                        aria-label={t('ChooseOutput')}
                        className="h-10 w-full rounded-md border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={selectedId}
                        onChange={event => {
                            setSelectedId(event.target.value);
                            setExportError(false);
                        }}
                        disabled={exporting}
                    >
                        <option value="">{t('ChooseOutput')}</option>
                        {work.outputs.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.title} · {t(`Types.${item.type}`)}
                                {item.available ? '' : ` · ${t('Unavailable')}`}
                            </option>
                        ))}
                    </select>
                </label>
                {!work.outputs.length ? <p className="text-sm text-muted-foreground">{t('NoShareableOutputs')}</p> : null}
                {output && !output.available ? (
                    <p role="status" className="text-sm text-muted-foreground">
                        {t('UnavailableDescription')}
                    </p>
                ) : null}
                {output?.available && preview.isPending ? (
                    <p role="status" className="text-sm text-muted-foreground">
                        {t('Loading')}
                    </p>
                ) : null}
                {preview.isError ? (
                    <div role="alert" className="text-sm text-destructive">
                        <p>{t('PreviewFailed')}</p>
                        <Button variant="outline" onClick={() => void preview.refetch()}>
                            {t('Retry')}
                        </Button>
                    </div>
                ) : null}
                {data ? (
                    <div className="min-h-0 flex-1 overflow-auto rounded-lg border" data-testid="work-share-preview">
                        {data.type === 'report' ? (
                            <iframe title={output?.title} sandbox="" srcDoc={data.html} className="h-[50dvh] w-full bg-background" />
                        ) : (
                            <div ref={imageRef} className="bg-background p-4 text-foreground" data-share-chart>
                                {data.type !== 'visual' && <h3 className="mb-3 break-words text-base font-semibold">{output?.title}</h3>}
                                {data.type === 'visual' ? <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: data.html }} /> : null}
                                {data.type === 'message' ? (
                                    <>
                                        <p className="mb-3 text-sm text-muted-foreground">{t('PreviewRows', { count: data.chart.data.length })}</p>
                                        <ChartResultCard result={data.chart} />
                                    </>
                                ) : null}
                                {data.type === 'artifact' ? (
                                    csv ? (
                                        <>
                                            <p className="mb-3 text-sm text-muted-foreground">{t(data.previewOnly ? 'PreviewRows' : 'FullRows', { count: data.rows.length })}</p>
                                            <p className="mb-3 text-xs text-muted-foreground">{t('TablePreview', { count: Math.min(50, data.rows.length) })}</p>
                                            <div className="overflow-auto">
                                                <table className="w-full text-left text-xs">
                                                    <thead>
                                                        <tr>
                                                            {data.columns.map(column => (
                                                                <th className="border-b p-2" key={column}>
                                                                    {column}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {data.rows.slice(0, 50).map((row, index) => (
                                                            <tr key={index}>
                                                                {data.columns.map(column => (
                                                                    <td className="max-w-64 break-words border-b p-2" key={column}>
                                                                        {formatWorkValue(row[column])}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    ) : (
                                        <div>
                                            <p className="mb-3 text-sm text-muted-foreground">{t(data.previewOnly ? 'PreviewRows' : 'FullRows', { count: data.rows.length })}</p>
                                            <div className="pointer-events-none flex h-[28rem] min-h-0 flex-col" data-share-artifact-chart>
                                                <Charts
                                                    rows={data.rows.map(row => ({ rowData: row }))}
                                                    columnsRaw={data.columnsRaw}
                                                    initialState={data.artifact.chartState ?? undefined}
                                                    stateSyncEnabled={false}
                                                    presentationOnly
                                                />
                                            </div>
                                        </div>
                                    )
                                ) : null}
                            </div>
                        )}
                    </div>
                ) : null}
                {exportError ? (
                    <p role="alert" className="text-sm text-destructive">
                        {t('ExportFailed')}
                    </p>
                ) : null}
                {chart && !chartReady ? (
                    <p role="status" className="text-sm text-muted-foreground">
                        {t('ChartNotReady')}
                    </p>
                ) : null}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" disabled={exporting} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button disabled={!data || preview.isFetching || preview.isError || !output?.available || exporting || (chart && !chartReady)} onClick={() => void doExport()}>
                        {t(exporting ? 'Exporting' : csv && data.previewOnly ? 'ExportPreview' : 'Export')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
