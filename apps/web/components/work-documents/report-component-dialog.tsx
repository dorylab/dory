'use client';

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useParams } from 'next/navigation';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { SelectItem } from '@/registry/new-york-v4/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import type { WorkDocumentContent, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { getPreviewColumnNames } from '@/lib/agent-runs/report';
import type { ArtifactDetail } from '@/lib/artifacts/types';
import { REPORT_SNAPSHOT_ROW_LIMIT } from '@/lib/work-documents/evidence-preview';
import { workVisualSchema } from '@/lib/work-documents/schema';
import { SearchableSelect } from '@/components/@dory/ui/searchable-select';

import { ReportVisual } from './report-body';
import { ReportColumnSelect, ReportSelect } from './report-select';

export type ComponentDialogHandle = { requestLeave: () => Promise<boolean> };
type PreviewRows = { columns: unknown[]; rows: WorkEvidence['rows']; rowCount: number | null; dataAvailability: string };
const selectStyle = 'h-9 w-full';
export default function ReportComponentDialog({
    ref,
    initial,
    restrictSources = false,
    documentId,
    content,
    onApply,
    onClose,
}: {
    ref?: Ref<ComponentDialogHandle>;
    initial: WorkVisual;
    restrictSources?: boolean;
    documentId: string;
    content: WorkDocumentContent;
    onApply: (visual: WorkVisual, evidence: WorkEvidence) => void;
    onClose: () => void;
}) {
    const t = useTranslations('WorkDocuments.Report');
    const common = useTranslations('WorkDocuments.Resources');
    const artifactText = useTranslations('Artifacts');
    const previewText = useTranslations('AgentRuns.Report');
    const { organization } = useParams<{ organization: string }>();
    const sourceInputId = useId();
    const [visual, patch] = useState(() => structuredClone(initial));
    const [search, setSearch] = useState('');
    const [selectedSourceLabel, setSelectedSourceLabel] = useState<string>();
    const [tab, setTab] = useState('configuration');
    const [confirm, setConfirm] = useState(false);
    const decision = useRef<((leave: boolean) => void) | null>(null);
    const dirty = JSON.stringify(visual) !== JSON.stringify(initial);
    const source = visual.evidenceId;
    const evidence = content.evidence.find(item => item.artifactId === source);
    const sourceQuery = search.trim().slice(0, 160);
    const artifacts = useQuery({
        queryKey: ['report-component-sources', organization, documentId, sourceQuery],
        enabled: !restrictSources,
        queryFn: ({ signal }) => executeActionClient<{ rows: Array<{ id: string; title: string }> }>('report.component.sources', { documentId, query: sourceQuery }, { signal }),
    });
    const checkSource = Boolean(source) && !evidence && selectedSourceLabel === undefined;
    const sourceAccess = useQuery({
        queryKey: ['report-component-source', organization, documentId, source],
        enabled: checkSource,
        queryFn: ({ signal }) => executeActionClient<{ rows: Array<{ id: string; title: string }> }>('report.component.sources', { documentId, artifactId: source }, { signal }),
    });
    const canReadSource = !checkSource || Boolean(sourceAccess.data?.rows.length);
    const artifact = useQuery({
        queryKey: ['report-artifact', organization, source],
        enabled: Boolean(source) && !evidence && canReadSource,
        queryFn: ({ signal }) => executeActionClient<ArtifactDetail>('artifact.get', { artifactId: source }, { signal }),
    });
    const detail = canReadSource ? artifact.data : undefined;
    const resultSetId = detail?.resultSet?.id;
    const previewRows = useQuery({
        queryKey: ['report-component-preview-rows', organization, resultSetId],
        enabled: !evidence && Boolean(resultSetId),
        queryFn: ({ signal }) => executeActionClient<PreviewRows>('resultSet.rows.read', { resultSetId, limit: REPORT_SNAPSHOT_ROW_LIMIT }, { signal }),
    });
    const result = previewRows.data;
    const columns = evidence?.columns ?? getPreviewColumnNames(result?.columns ?? detail?.resultSet?.columns ?? [], result?.rows ?? []);
    const columnSelect = { modal: true, options: columns.map(name => ({ value: name, label: name })), disabled: !columns.length, placeholder: t('SelectColumn') };
    const rowCount = result?.rowCount ?? detail?.rowCount ?? null;
    const unavailable = result?.dataAvailability === 'none' || Boolean(result && rowCount && !result.rows.length);
    const previewEvidence: WorkEvidence | undefined =
        evidence ??
        (detail && result && !unavailable
            ? {
                  artifactId: source,
                  title: detail.title,
                  connectionId: detail.connectionId,
                  connectionName: detail.connectionName,
                  sql: detail.resultSet?.sql ?? null,
                  capturedAt: detail.createdAt,
                  columns,
                  rows: result.rows,
                  rowCount,
                  truncated: result.dataAvailability === 'preview-only' || (rowCount ?? result.rows.length) > result.rows.length,
                  runId: detail.workId,
              }
            : undefined);
    const matchingSnapshots = content.evidence.filter(item => item.title.toLowerCase().includes(sourceQuery.toLowerCase()));
    const choices = [
        ...matchingSnapshots.map(item => ({ value: item.artifactId, label: item.title })),
        ...(restrictSources ? [] : (artifacts.data?.rows ?? []))
            .filter(item => !matchingSnapshots.some(saved => saved.artifactId === item.id))
            .map(item => ({ value: item.id, label: item.title })),
    ];
    const parsed = workVisualSchema.safeParse(visual);
    const chart = visual.chart;
    const series = chart?.yKeys ?? (chart?.yKey ? [{ key: chart.yKey }] : []);
    const keys = chart
        ? [chart.xKey, ...series.map(item => item.key)]
        : visual.metric
          ? [visual.metric.column, ...(visual.metric.items?.map(item => item.column) ?? []), ...(visual.metric.comparison ? [visual.metric.comparison.column] : [])]
          : [];
    const valid =
        parsed.success &&
        columns.length > 0 &&
        keys.every(key => columns.includes(key)) &&
        (!visual.metric ||
            [visual.metric, ...(visual.metric.items ?? []), ...(visual.metric.comparison ? [visual.metric.comparison] : [])].every(cell =>
                Boolean(previewEvidence?.rows[cell.rowIndex]),
            ));
    const loadingPreview = !evidence && Boolean(source) && ((checkSource && sourceAccess.isPending) || (canReadSource && artifact.isPending) || previewRows.isLoading);
    const previewFailed = (checkSource && sourceAccess.isError) || artifact.isError || previewRows.isError;
    const previewError = !evidence && (previewFailed || unavailable || Boolean(detail && !resultSetId));
    const sourceUnavailable = checkSource && sourceAccess.isSuccess && !canReadSource;
    const requestLeave = () => {
        if (!dirty) return Promise.resolve(true);
        return new Promise<boolean>(resolve => {
            decision.current?.(false);
            decision.current = resolve;
            setConfirm(true);
        });
    };
    useImperativeHandle(ref, () => ({ requestLeave }));
    const close = async () => {
        if (await requestLeave()) onClose();
    };
    const resolve = (leave: boolean) => {
        setConfirm(false);
        decision.current?.(leave);
        decision.current = null;
    };
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (dirty) event.preventDefault();
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    useEffect(
        () => () => {
            decision.current?.(false);
        },
        [],
    );
    return (
        <>
            <Dialog
                open
                onOpenChange={open => {
                    if (!open) void close();
                }}
            >
                <DialogContent
                    className="report-component-dialog flex h-[min(90dvh,880px)] w-[calc(100vw-2rem)] max-w-[1200px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]"
                    onInteractOutside={event => event.preventDefault()}
                    showCloseButton
                    data-testid="report-component-dialog"
                >
                    <DialogHeader className="shrink-0 border-b p-5 pr-12">
                        <DialogTitle>{t('EditComponent')}</DialogTitle>
                        <DialogDescription>{t('ComponentDescription')}</DialogDescription>
                    </DialogHeader>
                    <Tabs value={tab} onValueChange={setTab} className="report-dialog-tabs px-5 pt-3">
                        <TabsList>
                            <TabsTrigger value="configuration">{t('Configure')}</TabsTrigger>
                            <TabsTrigger value="preview">{t('PreviewTab')}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="report-dialog-columns min-h-0 flex-1" data-tab={tab}>
                        <div className="report-dialog-config space-y-4 overflow-y-auto p-5">
                            <div>
                                <label htmlFor={sourceInputId} className="block text-sm">
                                    {t('Source')}
                                </label>
                                <SearchableSelect
                                    id={sourceInputId}
                                    modal
                                    disabled={restrictSources}
                                    value={source}
                                    options={choices}
                                    selectedLabel={evidence?.title ?? selectedSourceLabel ?? artifact.data?.title}
                                    onChange={value => {
                                        setSelectedSourceLabel(choices.find(item => item.value === value)?.label);
                                        patch({ ...visual, evidenceId: value });
                                    }}
                                    search={{ value: search, onChange: setSearch }}
                                    searchPlaceholder={t('FindSource')}
                                    placeholder={t('SelectSource')}
                                    enableAll={Boolean(source) && !sourceQuery}
                                    allLabel={t('SelectSource')}
                                    emptyText={artifacts.isLoading ? artifactText('Loading') : undefined}
                                    triggerSize="default"
                                    popoverClassName="w-(--radix-popover-trigger-width)"
                                />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="text-sm">
                                    {t('ComponentTitle')}
                                    <Input value={visual.title} onChange={event => patch({ ...visual, title: event.target.value })} />
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={visual.allowSubset ?? false} onCheckedChange={checked => patch({ ...visual, allowSubset: checked === true })} />
                                    {t('AllowSubset')}
                                </label>
                                {visual.metric && (
                                    <>
                                        <ReportColumnSelect
                                            {...columnSelect}
                                            label={t('Column')}
                                            value={visual.metric.column}
                                            onChange={value => patch({ ...visual, metric: { ...visual.metric!, column: value } })}
                                        />
                                        <label className="text-sm">
                                            {t('Row')}
                                            <Input
                                                type="number"
                                                min={0}
                                                max={499}
                                                value={visual.metric.rowIndex}
                                                onChange={event => patch({ ...visual, metric: { ...visual.metric!, rowIndex: Number(event.target.value) } })}
                                            />
                                        </label>
                                        <label className="text-sm">
                                            {t('Format')}
                                            <ReportSelect
                                                className={selectStyle}
                                                value={visual.metric.format ?? 'number'}
                                                onValueChange={value => patch({ ...visual, metric: { ...visual.metric!, format: value as 'number' | 'percent' | 'currency' } })}
                                            >
                                                {['number', 'percent', 'currency'].map(value => (
                                                    <SelectItem key={value} value={value}>
                                                        {value}
                                                    </SelectItem>
                                                ))}
                                            </ReportSelect>
                                        </label>
                                        <label className="text-sm">
                                            {t('Precision')}
                                            <Input
                                                type="number"
                                                min={0}
                                                max={12}
                                                value={visual.metric.precision ?? 2}
                                                onChange={event => patch({ ...visual, metric: { ...visual.metric!, precision: Number(event.target.value) } })}
                                            />
                                        </label>
                                        <label className="text-sm">
                                            {t('Unit')}
                                            <Input
                                                value={visual.metric.unit ?? ''}
                                                onChange={event => patch({ ...visual, metric: { ...visual.metric!, unit: event.target.value } })}
                                            />
                                        </label>
                                        {visual.metric.format === 'currency' && (
                                            <label className="text-sm">
                                                {t('Currency')}
                                                <Input
                                                    maxLength={3}
                                                    value={visual.metric.currency ?? 'USD'}
                                                    onChange={event => patch({ ...visual, metric: { ...visual.metric!, currency: event.target.value.toUpperCase() } })}
                                                />
                                            </label>
                                        )}
                                        {visual.metric.format === 'percent' && (
                                            <label className="text-sm">
                                                {t('Scale')}
                                                <ReportSelect
                                                    className={selectStyle}
                                                    value={visual.metric.percentScale ?? 'ratio'}
                                                    onValueChange={value => patch({ ...visual, metric: { ...visual.metric!, percentScale: value as 'ratio' | 'whole' } })}
                                                >
                                                    <SelectItem value="ratio">0.95 → 95%</SelectItem>
                                                    <SelectItem value="whole">95 → 95%</SelectItem>
                                                </ReportSelect>
                                            </label>
                                        )}
                                        <ReportColumnSelect
                                            {...columnSelect}
                                            label={t('CompareColumn')}
                                            enableAll
                                            allLabel="—"
                                            value={visual.metric.comparison?.column ?? ''}
                                            onChange={value =>
                                                patch({
                                                    ...visual,
                                                    metric: {
                                                        ...visual.metric!,
                                                        comparison: value ? { column: value, rowIndex: visual.metric?.comparison?.rowIndex ?? 0 } : undefined,
                                                    },
                                                })
                                            }
                                        />
                                        {visual.metric.comparison && (
                                            <label className="text-sm">
                                                {t('CompareRow')}
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={499}
                                                    value={visual.metric.comparison.rowIndex}
                                                    onChange={event =>
                                                        patch({
                                                            ...visual,
                                                            metric: { ...visual.metric!, comparison: { ...visual.metric!.comparison!, rowIndex: Number(event.target.value) } },
                                                        })
                                                    }
                                                />
                                            </label>
                                        )}
                                        <ReportColumnSelect
                                            {...columnSelect}
                                            label={t('MetricGroup')}
                                            placeholder={t('SelectColumns')}
                                            multiple
                                            maxSelected={12}
                                            value={visual.metric.items?.map(item => item.column) ?? []}
                                            options={columnSelect.options.filter(option => option.value !== visual.metric!.column)}
                                            onChange={values =>
                                                patch({
                                                    ...visual,
                                                    metric: {
                                                        ...visual.metric!,
                                                        items: values.map(
                                                            column =>
                                                                visual.metric!.items?.find(item => item.column === column) ?? {
                                                                    column,
                                                                    rowIndex: visual.metric!.rowIndex,
                                                                    label: column,
                                                                },
                                                        ),
                                                    },
                                                })
                                            }
                                        />
                                    </>
                                )}
                                {chart && (
                                    <>
                                        <label className="text-sm">
                                            {t('ChartType')}
                                            <ReportSelect
                                                className={selectStyle}
                                                value={chart.type}
                                                onValueChange={value => patch({ ...visual, chart: { ...chart, type: value as typeof chart.type } })}
                                            >
                                                {['line', 'bar', 'area', 'pie'].map(type => (
                                                    <SelectItem key={type} value={type}>
                                                        {type}
                                                    </SelectItem>
                                                ))}
                                            </ReportSelect>
                                        </label>
                                        <ReportColumnSelect {...columnSelect} label="X" value={chart.xKey} onChange={xKey => patch({ ...visual, chart: { ...chart, xKey } })} />
                                        <ReportColumnSelect
                                            {...columnSelect}
                                            label="Y"
                                            placeholder={t('SelectColumns')}
                                            multiple
                                            maxSelected={chart.type === 'pie' ? 1 : 10}
                                            value={series.map(item => item.key)}
                                            onChange={values =>
                                                patch({
                                                    ...visual,
                                                    chart: {
                                                        type: chart.type,
                                                        xKey: chart.xKey,
                                                        options: chart.options,
                                                        seriesLayout: chart.seriesLayout,
                                                        yKeys: values.map(key => series.find(item => item.key === key) ?? { key }),
                                                    },
                                                })
                                            }
                                        />
                                        {chart.type !== 'pie' && series.length > 1 && (
                                            <label className="text-sm">
                                                {t('ChartSeriesLayout')}
                                                <ReportSelect
                                                    className={selectStyle}
                                                    value={chart.seriesLayout ?? 'separate'}
                                                    onValueChange={value => patch({ ...visual, chart: { ...chart, seriesLayout: value === 'combined' ? 'combined' : 'separate' } })}
                                                >
                                                    <SelectItem value="combined">{t('ChartSeriesCombined')}</SelectItem>
                                                    <SelectItem value="separate">{t('ChartSeriesSeparate')}</SelectItem>
                                                </ReportSelect>
                                            </label>
                                        )}
                                    </>
                                )}
                            </div>
                            {artifacts.isError && (
                                <p role="alert" className="text-sm text-destructive">
                                    {t('OriginalUnavailable')}
                                </p>
                            )}
                        </div>
                        <div className="report-dialog-preview work-prose min-w-0 overflow-auto bg-muted/20 p-5" data-testid="report-component-preview">
                            {valid && previewEvidence ? (
                                <>
                                    {previewEvidence.truncated && <div className="mb-2 text-xs font-medium text-muted-foreground">{t('Subset')}</div>}
                                    <ReportVisual key={source} visual={visual} evidence={previewEvidence} />
                                </>
                            ) : loadingPreview ? (
                                <p role="status" className="text-sm text-muted-foreground">
                                    {previewText('LoadingPreview')}
                                </p>
                            ) : sourceUnavailable || previewError ? (
                                <p role="alert" className="text-sm text-destructive">
                                    {sourceUnavailable ? t('ComponentSourceUnavailable') : previewText(previewFailed ? 'PreviewFailed' : 'PreviewUnavailable')}
                                </p>
                            ) : (
                                <p role="status" className="text-sm text-muted-foreground">
                                    {t('CheckComponent')}
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter className="shrink-0 flex-row justify-end border-t p-4">
                        <Button variant="outline" onClick={() => void close()}>
                            {common('Cancel')}
                        </Button>
                        <Button disabled={!valid || !previewEvidence} onClick={() => previewEvidence && onApply(visual, previewEvidence)}>
                            {t('ApplyComponent')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <AlertDialog
                open={confirm}
                onOpenChange={open => {
                    if (!open) resolve(false);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('DiscardComponentTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('DiscardComponentDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={() => resolve(false)}>
                            {common('Cancel')}
                        </Button>
                        <Button onClick={() => resolve(true)}>{common('Discard')}</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
