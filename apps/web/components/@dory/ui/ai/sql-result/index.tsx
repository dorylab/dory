'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { AlertCircle, ChevronsUpDown, MoreHorizontal } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';

import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';

import { ChartResultCard, ChartResultPart } from '../charts-result';
import { buildAutoChartFromSql } from '../utils/auto-charts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { useTranslations } from 'next-intl';
import { SqlResultPart, SqlResultBodyProps, SqlResultCardProps } from './type';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { getSqlResultActionStyles } from './style';
import { cn } from '@dory/web-utils';

export function SqlStatementBlock({ sql, onCopy, actions, className }: { sql: string; onCopy: (sql: string) => void; actions?: React.ReactNode; className?: string }) {
    if (!sql.trim()) return null;

    return (
        <div className={cn('w-full', className)}>
            <SmartCodeBlock value={sql} maxHeightClassName="max-h-36" variant="bare" onCopy={() => onCopy(sql)} actions={actions} />
        </div>
    );
}

function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function escapeCsvValue(value: string) {
    const escaped = value.replace(/"/g, '""');
    if (/[,\"\n]/.test(escaped)) {
        return `"${escaped}"`;
    }
    return escaped;
}

function buildCsvFromPreview(displayColumns: string[], rows: Array<Record<string, unknown>>) {
    if (!displayColumns.length || !rows.length) return null;

    const header = displayColumns.map(col => escapeCsvValue(col)).join(',');
    const body = rows.map(row => displayColumns.map(col => escapeCsvValue(formatCellValue((row as any)[col]))).join(','));

    return [header, ...body].join('\n');
}

function computeDisplayColumns(
    columns: Array<{ name: string; type: string | null }> | undefined,
    previewRows: Array<Record<string, unknown>> | undefined,
    fallbackLabel: string,
): string[] {
    if (columns && columns.length > 0) {
        return columns.map(col => col.name || fallbackLabel);
    }
    if (previewRows && previewRows.length > 0) {
        const keySet = new Set<string>();
        for (const row of previewRows) {
            Object.keys(row).forEach(key => keySet.add(key));
        }
        return Array.from(keySet);
    }
    return [];
}

function formatTimestamp(timestamp?: string) {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
}

function buildFollowUpPrompt(result: SqlResultPart, t: (key: string, values?: Record<string, unknown>) => string) {
    const { sql, database, rowCount, durationMs, ok, error } = result;

    const meta: string[] = [];
    if (database) meta.push(t('SqlResult.Meta.Database', { database }));
    if (typeof rowCount === 'number') meta.push(t('SqlResult.Meta.RowCount', { rowCount }));
    if (typeof durationMs === 'number') meta.push(t('SqlResult.Meta.Duration', { durationMs }));

    const metaLine = meta.length ? `\n${t('SqlResult.Meta.Line', { meta: meta.join(t('SqlResult.Meta.Separator')) })}` : '';

    if (!ok) {
        return t('SqlResult.FollowUp.ErrorPrompt', {
            sql,
            error: error?.message ?? t('SqlResult.UnknownError'),
            metaLine,
        });
    }

    return t('SqlResult.FollowUp.SuccessPrompt', { sql, metaLine });
}

export const SqlResultBody = React.memo(function SqlResultBody({
    result,
    onManualExecute,
    onFollowUp,
    footerActions,
    manualPrimaryAction,
    manualMenuActions,
    mode = 'global',
    embedded = false,
}: SqlResultBodyProps) {
    const t = useTranslations('DoryUI');
    const { sql, database, ok, manualExecution, previewRows = [], columns, rowCount, truncated, durationMs, error, timestamp } = result;
    const requiresManualExecution = manualExecution?.required === true;
    const [chartResult, setChartResult] = useState<ChartResultPart | null>(null);
    const [chartError, setChartError] = useState<string | null>(null);

    const displayColumns = useMemo(() => computeDisplayColumns(columns, previewRows, t('SqlResult.ColumnPlaceholder')), [columns, previewRows, t]);

    const csvPreview = useMemo(() => buildCsvFromPreview(displayColumns, previewRows), [displayColumns, previewRows]);
    const canExportCsv = Boolean(csvPreview);
    const canVisualize = ok && previewRows.length > 0;
    const formattedTimestamp = useMemo(() => formatTimestamp(timestamp), [timestamp]);
    const handleDownloadCsv = useCallback(() => {
        if (!csvPreview) return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `sql-result-${timestamp}.csv`;
        const blob = new Blob([csvPreview], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
    }, [csvPreview]);

    const handleCopyResults = useCallback(async () => {
        if (!csvPreview) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(csvPreview);
            } else {
                const ta = document.createElement('textarea');
                ta.value = csvPreview;
                ta.setAttribute('readonly', 'true');
                ta.style.position = 'fixed';
                ta.style.top = '0';
                ta.style.left = '0';
                ta.style.opacity = '0';
                ta.style.pointerEvents = 'none';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                } finally {
                    document.body.removeChild(ta);
                }
            }
            toast.success(t('SqlResult.Actions.ResultsCopied'));
        } catch (error) {
            console.error(error);
            toast.error(t('Errors.CopySqlFailed'));
        }
    }, [csvPreview, t]);

    useEffect(() => {
        setChartResult(null);
        setChartError(null);
    }, [result]);

    const handleGenerateChart = () => {
        const nextChart = buildAutoChartFromSql(result, {
            title: t('SqlResult.AutoChart.Title'),
            description: t('SqlResult.AutoChart.Description'),
        });
        if (!nextChart) {
            setChartResult(null);
            setChartError(t('SqlResult.ChartUnavailable'));
            return;
        }
        setChartResult(nextChart);
        setChartError(null);
    };

    const handleFollowUpClick = () => {
        if (!onFollowUp) return;
        const prompt = buildFollowUpPrompt(result, t as any);
        onFollowUp(prompt);
    };

    const actionStyles = useMemo(() => getSqlResultActionStyles(mode), [mode]);

    const resultBody = (
        <CardContent className={embedded ? 'space-y-2.5 px-0 pb-0 pt-0' : 'space-y-2.5 px-0 pb-0 pt-1'}>
            {ok ? (
                previewRows.length > 0 ? (
                    <div
                        className={
                            embedded ? 'overflow-hidden rounded-lg border border-border/45 bg-background/70' : 'overflow-hidden rounded-xl border border-border/35 bg-muted/16'
                        }
                    >
                        <div className="h-[15rem] w-full overflow-auto">
                            <table className="w-full min-w-max text-sm">
                                <thead>
                                    <tr>
                                        {displayColumns.map(col => (
                                            <th
                                                key={col}
                                                className={cn(
                                                    'sticky top-0 z-10 h-10 border-b border-border/45 px-4 py-0 text-left text-[12px] font-medium text-muted-foreground',
                                                    embedded ? 'bg-background' : 'bg-card',
                                                )}
                                            >
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>

                                <tbody className="[&_tr:last-child_td]:border-b-0">
                                    {previewRows.map((row, rowIndex) => (
                                        <tr key={rowIndex} className="even:bg-muted/[0.16]">
                                            {displayColumns.map(col => (
                                                <td key={col} className="h-10 border-b border-border/35 px-4 py-0 align-middle">
                                                    <span className="text-[12px] font-mono leading-6 text-foreground/80">{formatCellValue((row as any)[col])}</span>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {truncated && (
                            <div className="border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">{t('SqlResult.Truncated', { count: previewRows.length })}</div>
                        )}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">{t('SqlResult.NoRows')}</div>
                )
            ) : (
                <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive/60" />
                        <span>
                            {requiresManualExecution
                                ? t('SqlResult.Notice.ReadOnlyRestriction')
                                : t('SqlResult.ExecutionFailed', { error: error?.message ?? t('SqlResult.UnknownError') })}
                        </span>
                    </div>
                </div>
            )}

            {requiresManualExecution || (!requiresManualExecution && footerActions) ? (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {requiresManualExecution
                        ? (manualPrimaryAction ?? (
                              <Button
                                  type="button"
                                  size="sm"
                                  className="h-9 rounded-full px-4 text-sm font-medium"
                                  onClick={() => onManualExecute({ sql, database, mode: 'editor' })}
                              >
                                  {t('SqlResult.Actions.OpenInEditor')}
                              </Button>
                          ))
                        : null}
                    {!requiresManualExecution ? footerActions : null}
                </div>
            ) : null}

            {!requiresManualExecution && !footerActions && onFollowUp ? (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <Button type="button" size="sm" variant="secondary" className="h-9 rounded-full px-4 text-sm font-medium" onClick={handleFollowUpClick}>
                        {t('SqlResult.FollowUp.Button')}
                    </Button>
                </div>
            ) : null}

            {!requiresManualExecution && footerActions && onFollowUp ? (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <Button type="button" size="sm" variant="secondary" className="h-9 rounded-full px-4 text-sm font-medium" onClick={handleFollowUpClick}>
                        {t('SqlResult.FollowUp.Button')}
                    </Button>
                </div>
            ) : null}

            {chartError && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/70" />
                    {chartError}
                </div>
            )}
        </CardContent>
    );

    return (
        <>
            {resultBody}
            {chartResult && <ChartResultCard result={chartResult} source="auto" onFollowUp={onFollowUp} />}
        </>
    );
});

export const SqlResultCard = React.memo(function SqlResultCard({
    result,
    onCopy,
    onManualExecute,
    onFollowUp,
    footerActions,
    manualPrimaryAction,
    manualMenuActions,
    mode = 'global',
    hideHeader = false,
    codeActions,
    embedded = false,
}: SqlResultCardProps) {
    const t = useTranslations('DoryUI');
    const { sql, database, ok, manualExecution, rowCount, durationMs, timestamp, previewRows = [], columns } = result;
    const requiresManualExecution = manualExecution?.required === true;
    const shouldDefaultOpen = !ok || requiresManualExecution;
    const [open, setOpen] = useState(shouldDefaultOpen);
    const actionStyles = useMemo(() => getSqlResultActionStyles(mode), [mode]);
    const statusText = ok ? t('SqlResult.Status.Success') : requiresManualExecution ? t('SqlResult.Status.Blocked') : t('SqlResult.Status.Failed');
    const statusDotClass = ok ? 'text-muted-foreground' : 'text-destructive/70';
    const formattedTimestamp = useMemo(() => formatTimestamp(timestamp), [timestamp]);
    const displayColumns = useMemo(() => computeDisplayColumns(columns, previewRows, t('SqlResult.ColumnPlaceholder')), [columns, previewRows, t]);
    const csvPreview = useMemo(() => buildCsvFromPreview(displayColumns, previewRows), [displayColumns, previewRows]);
    const canExportCsv = Boolean(csvPreview);
    const canVisualize = ok && previewRows.length > 0;
    const metaInfoItems = useMemo(() => {
        const items: string[] = [];
        if (database) {
            items.push(t('SqlResult.Meta.Database', { database }));
        }
        if (typeof rowCount === 'number') {
            items.push(t('SqlResult.Meta.RowCount', { rowCount }));
        }
        if (typeof durationMs === 'number') {
            items.push(t('SqlResult.Meta.Duration', { durationMs }));
        }
        if (formattedTimestamp) {
            items.push(t('SqlResult.Meta.Timestamp', { timestamp: formattedTimestamp }));
        }
        return items;
    }, [database, durationMs, formattedTimestamp, rowCount, t]);
    const runLabel = t('SqlResult.Actions.Run');

    const handleGenerateChart = useCallback(() => {
        const nextChart = buildAutoChartFromSql(result, {
            title: t('SqlResult.AutoChart.Title'),
            description: t('SqlResult.AutoChart.Description'),
        });
        if (!nextChart) {
            toast.error(t('SqlResult.ChartUnavailable'));
            return;
        }
    }, [result, t]);

    const handleFollowUpClick = useCallback(() => {
        if (!onFollowUp) return;
        const prompt = buildFollowUpPrompt(result, t as any);
        onFollowUp(prompt);
    }, [onFollowUp, result, t]);

    const handleDownloadCsv = useCallback(() => {
        if (!csvPreview) return;
        const timestampValue = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `sql-result-${timestampValue}.csv`;
        const blob = new Blob([csvPreview], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
    }, [csvPreview]);

    const handleCopyResults = useCallback(async () => {
        if (!csvPreview) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(csvPreview);
            } else {
                const ta = document.createElement('textarea');
                ta.value = csvPreview;
                ta.setAttribute('readonly', 'true');
                ta.style.position = 'fixed';
                ta.style.top = '0';
                ta.style.left = '0';
                ta.style.opacity = '0';
                ta.style.pointerEvents = 'none';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                } finally {
                    document.body.removeChild(ta);
                }
            }
            toast.success(t('SqlResult.Actions.ResultsCopied'));
        } catch (error) {
            console.error(error);
            toast.error(t('Errors.CopySqlFailed'));
        }
    }, [csvPreview, t]);

    useEffect(() => {
        setOpen(shouldDefaultOpen);
    }, [result, shouldDefaultOpen]);

    if (hideHeader) {
        return (
            <div className={embedded ? 'space-y-2' : 'mt-1 space-y-2'}>
                <SqlResultBody
                    result={result}
                    onManualExecute={onManualExecute}
                    onFollowUp={onFollowUp}
                    footerActions={footerActions}
                    manualPrimaryAction={manualPrimaryAction}
                    manualMenuActions={manualMenuActions}
                    mode={mode}
                    embedded={embedded}
                />
            </div>
        );
    }

    return (
        <>
            <Collapsible open={open} onOpenChange={setOpen} className="mt-1">
                <Card className="gap-0 border-0 bg-transparent py-0 shadow-none">
                    <CardHeader className="space-y-2 px-0 py-0">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                                <Badge
                                    variant="secondary"
                                    className="rounded-full border-0 bg-muted/55 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                                >
                                    {t('SqlResult.Title')}
                                </Badge>
                                {metaInfoItems.length > 0 ? (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <span className={statusDotClass} aria-hidden>
                                                        ●
                                                    </span>
                                                    <span>{statusText}</span>
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" className="max-w-xs">
                                                <div className="flex flex-col gap-1">
                                                    {metaInfoItems.map(item => (
                                                        <span key={item} className="text-[11px]">
                                                            {item}
                                                        </span>
                                                    ))}
                                                </div>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <span className={statusDotClass} aria-hidden>
                                            ●
                                        </span>
                                        <span>{statusText}</span>
                                    </span>
                                )}
                            </CardTitle>
                            <div className="flex items-center">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className={actionStyles.iconBtn} type="button">
                                            <MoreHorizontal className={actionStyles.icon} />
                                            <span className={actionStyles.srOnly}>{t('SqlResult.Actions.More')}</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" side="bottom" className={actionStyles.menu}>
                                        <DropdownMenuItem onClick={() => onManualExecute({ sql, database, mode: 'editor' })}>
                                            {t('SqlResult.Actions.OpenInEditor')}
                                        </DropdownMenuItem>
                                        {manualMenuActions}
                                        {requiresManualExecution ? (
                                            <DropdownMenuItem onClick={() => onManualExecute({ sql, database, mode: 'run' })}>{runLabel}</DropdownMenuItem>
                                        ) : null}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleGenerateChart} disabled={!canVisualize}>
                                            {t('SqlResult.ChartTooltip')}
                                        </DropdownMenuItem>
                                        {onFollowUp ? <DropdownMenuItem onClick={handleFollowUpClick}>{t('SqlResult.FollowUp.Button')}</DropdownMenuItem> : null}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleDownloadCsv} disabled={!canExportCsv}>
                                            {t('SqlResult.Actions.DownloadCsv')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleCopyResults} disabled={!canExportCsv}>
                                            {t('SqlResult.Actions.CopyResults')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <CollapsibleTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className={actionStyles.iconBtn}
                                                    aria-label={open ? t('SqlResult.Collapse') : t('SqlResult.Expand')}
                                                >
                                                    <ChevronsUpDown className={actionStyles.icon} />
                                                </Button>
                                            </CollapsibleTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom">{open ? t('SqlResult.Collapse') : t('SqlResult.Expand')}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>

                        <CollapsibleContent className="space-y-2">
                            <SqlStatementBlock sql={sql} onCopy={onCopy} actions={codeActions} />
                        </CollapsibleContent>
                    </CardHeader>

                    <CollapsibleContent>
                        <SqlResultBody
                            result={result}
                            onManualExecute={onManualExecute}
                            onFollowUp={onFollowUp}
                            footerActions={footerActions}
                            manualPrimaryAction={manualPrimaryAction}
                            manualMenuActions={manualMenuActions}
                            mode={mode}
                            embedded={embedded}
                        />
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </>
    );
});
