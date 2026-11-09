'use client';

import { useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import type { ChartPresentation, ChartResultPart } from '@dory/shared/types/chat-chart';
import { chartAxis, chartPresentation, chartSeries, validateChartPresentation } from '@dory/shared/utils/chat-chart';
import { useTranslations } from 'next-intl';

import { ChartResultCard } from './index';

const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
export function ChartEditor({ result, onClose, onSave }: { result: ChartResultPart; onClose: () => void; onSave: (presentation: ChartPresentation | null) => Promise<void> }) {
    const t = useTranslations('DoryUI.ChartResult');
    const [draft, setDraft] = useState(() => chartPresentation(result));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const columns = [...new Set(result.data.flatMap(row => Object.keys(row)))];
    const options = draft.options ?? {};
    const setOptions = (value: Partial<NonNullable<ChartPresentation['options']>>) => setDraft(previous => ({ ...previous, options: { ...previous.options, ...value } }));
    const setFormat = (value: Partial<NonNullable<typeof options.valueFormat>>) => setOptions({ valueFormat: { ...options.valueFormat, ...value } });
    const series = chartSeries(draft);
    const save = async (reset = false) => {
        const invalid = !reset && validateChartPresentation({ ...result, ...draft });
        if (invalid) {
            setError(t(invalid === 'duplicate-x' ? 'DuplicateX' : invalid === 'incomplete' ? 'Preview' : 'InvalidFields'));
            return;
        }
        setBusy(true);
        setError('');
        try {
            await onSave(reset ? null : draft);
            onClose();
        } catch (error) {
            setError(error instanceof Error ? error.message : t('SaveError'));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open && !busy) onClose();
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t('Edit')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                        {t('Title')}
                        <Input value={draft.title ?? ''} maxLength={300} onChange={event => setDraft({ ...draft, title: event.target.value })} />
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('Description')}
                        <Input value={draft.description ?? ''} maxLength={2000} onChange={event => setDraft({ ...draft, description: event.target.value })} />
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('ChartType')}
                        <select
                            className={selectClass}
                            value={draft.chartType}
                            onChange={event => {
                                const type = event.target.value as ChartPresentation['chartType'];
                                setDraft({
                                    ...draft,
                                    chartType: type,
                                    yKeys: type === 'pie' ? series.slice(0, 1) : series,
                                    valueKey: type === 'pie' ? series[0]?.key : undefined,
                                    categoryKey: type === 'pie' ? chartAxis(draft) : undefined,
                                });
                            }}
                        >
                            {(['bar', 'line', 'area', 'pie'] as const).map(type => (
                                <option key={type} value={type}>
                                    {t(`Types.${type}`)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('XAxis')}
                        <select
                            className={selectClass}
                            value={chartAxis(draft)}
                            onChange={event => setDraft({ ...draft, xKey: event.target.value, categoryKey: draft.chartType === 'pie' ? event.target.value : undefined })}
                        >
                            {columns.map(key => (
                                <option key={key} value={key}>
                                    {key}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('XAxisLabel')}
                        <Input value={options.xAxisLabel ?? ''} maxLength={160} onChange={event => setOptions({ xAxisLabel: event.target.value })} />
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('YAxisLabel')}
                        <Input value={options.yAxisLabel ?? ''} maxLength={160} onChange={event => setOptions({ yAxisLabel: event.target.value })} />
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('AxisType')}
                        <select
                            className={selectClass}
                            value={options.xKeyType ?? 'auto'}
                            onChange={event => setOptions({ xKeyType: event.target.value === 'auto' ? undefined : (event.target.value as 'time' | 'category' | 'number') })}
                        >
                            {['auto', 'time', 'category', 'number'].map(value => (
                                <option key={value} value={value}>
                                    {t(`AxisTypes.${value}`)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('Sort')}
                        <select
                            className={selectClass}
                            value={options.sortDirection === 'none' ? 'none' : options.sortBy ? `${options.sortBy}-${options.sortDirection ?? 'asc'}` : 'auto'}
                            onChange={event => {
                                const [key, direction] = event.target.value.split('-');
                                setOptions({
                                    sortBy: key === 'x' || key === 'value' ? key : undefined,
                                    sortDirection: key === 'none' ? 'none' : direction === 'desc' ? 'desc' : key === 'auto' ? undefined : 'asc',
                                });
                            }}
                        >
                            {['auto', 'none', 'x-asc', 'x-desc', 'value-asc', 'value-desc'].map(value => (
                                <option key={value} value={value}>
                                    {t(`Sorts.${value}`)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('Scale')}
                        <Input
                            type="number"
                            min="0.000001"
                            value={options.valueFormat?.scale ?? 1}
                            onChange={event => {
                                const scale = Number(event.target.value);
                                if (Number.isFinite(scale) && scale > 0) setFormat({ scale });
                            }}
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('Precision')}
                        <Input
                            type="number"
                            min={0}
                            max={12}
                            value={options.valueFormat?.precision ?? 2}
                            onChange={event => {
                                const precision = Number(event.target.value);
                                if (Number.isInteger(precision) && precision >= 0 && precision <= 12) setFormat({ precision });
                            }}
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('Prefix')}
                        <Input value={options.valueFormat?.prefix ?? ''} maxLength={40} onChange={event => setFormat({ prefix: event.target.value })} />
                    </label>
                    <label className="space-y-1 text-sm">
                        {t('Suffix')}
                        <Input value={options.valueFormat?.suffix ?? ''} maxLength={40} onChange={event => setFormat({ suffix: event.target.value })} />
                    </label>
                </div>
                <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">{t('Metrics')}</legend>
                    {columns
                        .filter(key => key !== chartAxis(draft))
                        .map(key => {
                            const selected = series.find(item => item.key === key);
                            return (
                                <div key={key} className="flex items-center gap-3">
                                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(selected)}
                                            onChange={event => {
                                                const next = event.target.checked
                                                    ? draft.chartType === 'pie'
                                                        ? [{ key }]
                                                        : [...series, { key }]
                                                    : series.filter(item => item.key !== key);
                                                setDraft({ ...draft, yKeys: next, valueKey: draft.chartType === 'pie' ? next[0]?.key : undefined });
                                            }}
                                        />
                                        {key}
                                    </label>
                                    {selected && (
                                        <Input
                                            className="w-1/2"
                                            aria-label={t('MetricLabel', { key })}
                                            value={selected.label ?? key}
                                            maxLength={300}
                                            onChange={event =>
                                                setDraft({ ...draft, yKeys: series.map(item => (item.key === key ? { ...item, label: event.target.value } : item)) })
                                            }
                                        />
                                    )}
                                </div>
                            );
                        })}
                </fieldset>
                <ChartResultCard result={{ ...result, ...draft }} interactive={false} variant="bare" />
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>
                        {t('Reset')}
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button disabled={busy} onClick={() => void save()}>
                        {busy ? t('Saving') : t('Save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
