'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useParams } from 'next/navigation';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { SelectItem } from '@/registry/new-york-v4/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import type { WorkDocumentContent, WorkVisual } from '@dory/shared/types/work-document';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { reportEmbeds, reportTagSource } from '@/lib/work-documents/report-core';
import { workVisualSchema } from '@/lib/work-documents/schema';

import { ReportBody } from './report-body';
import { ReportMultiSelect, ReportSelect } from './report-select';

export type ComponentDialogHandle = { requestLeave: () => Promise<boolean> };
const selectStyle = 'h-9 w-full';
export default function ReportComponentDialog({
    ref,
    initial,
    content,
    onApply,
    onClose,
}: {
    ref?: Ref<ComponentDialogHandle>;
    initial: WorkVisual;
    content: WorkDocumentContent;
    onApply: (visual: WorkVisual) => void;
    onClose: () => void;
}) {
    const t = useTranslations('WorkDocuments.Report');
    const common = useTranslations('WorkDocuments.Resources');
    const { organization } = useParams<{ organization: string }>();
    const [visual, patch] = useState(() => structuredClone(initial));
    const [search, setSearch] = useState('');
    const [fieldSearch, setFieldSearch] = useState('');
    const [tab, setTab] = useState('configuration');
    const [confirm, setConfirm] = useState(false);
    const decision = useRef<((leave: boolean) => void) | null>(null);
    const dirty = JSON.stringify(visual) !== JSON.stringify(initial);
    const source = visual.evidenceId;
    const evidence = content.evidence.find(item => item.artifactId === source);
    const artifacts = useQuery({
        queryKey: ['report-artifacts', organization, search],
        queryFn: () => executeActionClient<{ rows: Array<{ id: string; title: string }> }>('artifact.list', { types: ['result_set'], query: search, limit: 100 }),
    });
    const artifact = useQuery({
        queryKey: ['report-artifact', organization, source],
        enabled: Boolean(source) && !evidence,
        queryFn: () => executeActionClient<{ resultSet: { columns: Array<{ name?: string }> } | null }>('artifact.get', { artifactId: source }),
    });
    const allColumns = evidence?.columns ?? artifact.data?.resultSet?.columns.flatMap(item => (item.name ? [item.name] : [])) ?? [];
    const columns = allColumns.filter(name => name.toLocaleLowerCase().includes(fieldSearch.toLocaleLowerCase()) || JSON.stringify(visual).includes(JSON.stringify(name)));
    const choices = [
        ...content.evidence.map(item => ({ id: item.artifactId, title: item.title })),
        ...(artifacts.data?.rows ?? []).filter(item => !content.evidence.some(saved => saved.artifactId === item.id)),
    ];
    const parsed = workVisualSchema.safeParse(visual);
    const keys = visual.chart
        ? [visual.chart.xKey, ...(visual.chart.yKeys?.map(item => item.key) ?? [visual.chart.yKey!])]
        : visual.metric
          ? [visual.metric.column, ...(visual.metric.items?.map(item => item.column) ?? []), ...(visual.metric.comparison ? [visual.metric.comparison.column] : [])]
          : [];
    const valid =
        parsed.success &&
        Boolean(source) &&
        allColumns.length > 0 &&
        keys.every(key => allColumns.includes(key)) &&
        (!evidence ||
            !visual.metric ||
            [visual.metric, ...(visual.metric.items ?? []), ...(visual.metric.comparison ? [visual.metric.comparison] : [])].every(cell => Boolean(evidence.rows[cell.rowIndex])));
    const preview = { ...content, body: reportTagSource(visual), visuals: [visual], embeds: reportEmbeds([visual], content.evidence) };
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
                            <label className="block text-sm">
                                {t('FindSource')}
                                <Input value={search} onChange={event => setSearch(event.target.value)} />
                            </label>
                            <label className="block text-sm">
                                {t('Source')}
                                <ReportSelect value={source} onValueChange={value => patch({ ...visual, evidenceId: value })}>
                                    <SelectItem value="__none">{t('SelectSource')}</SelectItem>
                                    {choices.map(item => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.title}
                                        </SelectItem>
                                    ))}
                                </ReportSelect>
                            </label>
                            <label className="block text-sm">
                                {t('FindColumns')}
                                <Input value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} />
                            </label>
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
                                        <label className="text-sm">
                                            {t('Column')}
                                            <ReportSelect
                                                className={selectStyle}
                                                value={visual.metric.column}
                                                onValueChange={value => patch({ ...visual, metric: { ...visual.metric!, column: value } })}
                                            >
                                                {columns.map(name => (
                                                    <SelectItem key={name} value={name}>
                                                        {name}
                                                    </SelectItem>
                                                ))}
                                            </ReportSelect>
                                        </label>
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
                                        <label className="text-sm">
                                            {t('CompareColumn')}
                                            <ReportSelect
                                                className={selectStyle}
                                                value={visual.metric.comparison?.column ?? ''}
                                                onValueChange={value =>
                                                    patch({
                                                        ...visual,
                                                        metric: {
                                                            ...visual.metric!,
                                                            comparison: value ? { column: value, rowIndex: visual.metric?.comparison?.rowIndex ?? 0 } : undefined,
                                                        },
                                                    })
                                                }
                                            >
                                                <SelectItem value="__none">—</SelectItem>
                                                {columns.map(name => (
                                                    <SelectItem key={name} value={name}>
                                                        {name}
                                                    </SelectItem>
                                                ))}
                                            </ReportSelect>
                                        </label>
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
                                        <div className="text-sm">
                                            {t('MetricGroup')}
                                            <ReportMultiSelect
                                                value={visual.metric.items?.map(item => item.column) ?? []}
                                                options={columns.filter(name => name !== visual.metric!.column)}
                                                onValueChange={values =>
                                                    patch({
                                                        ...visual,
                                                        metric: {
                                                            ...visual.metric!,
                                                            items: values.slice(0, 12).map(column => ({ column, rowIndex: visual.metric!.rowIndex, label: column })),
                                                        },
                                                    })
                                                }
                                            />
                                        </div>
                                    </>
                                )}
                                {visual.chart && (
                                    <>
                                        <label className="text-sm">
                                            {t('ChartType')}
                                            <ReportSelect
                                                className={selectStyle}
                                                value={visual.chart.type}
                                                onValueChange={value => patch({ ...visual, chart: { ...visual.chart!, type: value as NonNullable<WorkVisual['chart']>['type'] } })}
                                            >
                                                {['line', 'bar', 'area', 'pie'].map(type => (
                                                    <SelectItem key={type} value={type}>
                                                        {type}
                                                    </SelectItem>
                                                ))}
                                            </ReportSelect>
                                        </label>
                                        <label className="text-sm">
                                            X
                                            <ReportSelect
                                                className={selectStyle}
                                                value={visual.chart.xKey}
                                                onValueChange={value => patch({ ...visual, chart: { ...visual.chart!, xKey: value } })}
                                            >
                                                {columns.map(name => (
                                                    <SelectItem key={name} value={name}>
                                                        {name}
                                                    </SelectItem>
                                                ))}
                                            </ReportSelect>
                                        </label>
                                        <div className="text-sm">
                                            Y
                                            <ReportMultiSelect
                                                value={visual.chart.yKeys?.map(item => item.key) ?? [visual.chart.yKey!]}
                                                options={columns}
                                                onValueChange={values =>
                                                    patch({
                                                        ...visual,
                                                        chart: { type: visual.chart!.type, xKey: visual.chart!.xKey, yKeys: values.slice(0, 10).map(key => ({ key })) },
                                                    })
                                                }
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                            {(artifacts.error || artifact.error) && (
                                <p role="alert" className="text-sm text-destructive">
                                    {t('OriginalUnavailable')}
                                </p>
                            )}
                            {!valid && (
                                <p role="status" className="text-sm text-muted-foreground">
                                    {t('CheckComponent')}
                                </p>
                            )}
                        </div>
                        <div className="report-dialog-preview work-prose min-w-0 overflow-auto bg-muted/20 p-5">
                            {!evidence ? (
                                <p role="status" className="text-sm text-muted-foreground">
                                    {t('PendingBinding')}
                                </p>
                            ) : valid ? (
                                <ReportBody content={preview} title="" onEvidence={() => {}} previewOnly />
                            ) : (
                                <p className="text-sm text-muted-foreground">{t('CheckComponent')}</p>
                            )}
                        </div>
                    </div>
                    <DialogFooter className="shrink-0 flex-row justify-end border-t p-4">
                        <Button variant="outline" onClick={() => void close()}>
                            {common('Cancel')}
                        </Button>
                        <Button disabled={!valid} onClick={() => onApply(visual)}>
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
