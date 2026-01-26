'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { TableIcon, BarChart3, AlertCircle, ChevronsUpDown, MoreHorizontal } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';

import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';

import { ChartResultCard, ChartResultPart } from '../charts-result';
import { buildAutoChartFromSql } from '../utils/auto-charts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { useTranslations } from 'next-intl';
import { SqlResultPart, SqlResultCardProps } from './type';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { getSqlResultActionStyles } from './style';


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
    const body = rows.map(row =>
        displayColumns
            .map(col => escapeCsvValue(formatCellValue((row as any)[col])))
            .join(','),
    );

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

export const SqlResultCard = React.memo(function SqlResultCard({
    result,
    onCopy,
    onManualExecute,
    onFollowUp,
    mode = 'global',
}: SqlResultCardProps) {
    const t = useTranslations('DoryUI');
    const { sql, database, ok, previewRows = [], columns, rowCount, truncated, durationMs, error, timestamp } = result;

    const [chartResult, setChartResult] = useState<ChartResultPart | null>(null);
    const [chartError, setChartError] = useState<string | null>(null);
    const [open, setOpen] = useState(true);

    const displayColumns = useMemo(
        () => computeDisplayColumns(columns, previewRows, t('SqlResult.ColumnPlaceholder')),
        [columns, previewRows, t],
    );

    const csvPreview = useMemo(() => buildCsvFromPreview(displayColumns, previewRows), [displayColumns, previewRows]);
    const canExportCsv = Boolean(csvPreview);
    const runLabel = t('SqlResult.Actions.Run');
    const statusText = ok ? t('SqlResult.Status.Success') : t('SqlResult.Status.Failed');
    const statusDotClass = ok ? 'text-emerald-500' : 'text-destructive';

    const canVisualize = ok && previewRows.length > 0;
    const formattedTimestamp = useMemo(() => formatTimestamp(timestamp), [timestamp]);
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
    const statusDisplay = (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={statusDotClass} aria-hidden>
                ●
            </span>
            <span>{statusText}</span>
        </span>
    );

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
        setOpen(true);
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

    return (
        <>
            <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
                <Card className="border border-border/60 bg-background shadow-sm py-0 pb-3 gap-1">
                    <CardHeader className="space-y-3 py-3 px-3">
                        <div className="flex items-start justify-between gap-2 mb-0">
                            <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                                {/* <TableIcon className="h-4 w-4 text-muted-foreground" /> */}
                                <Badge variant="outline" className="text-[11px] font-semibold uppercase text-muted-foreground">
                                    {t('SqlResult.Title')}
                                </Badge>
                                {metaInfoItems.length > 0 ? (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                {statusDisplay}
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
                                    statusDisplay
                                )}
                            </CardTitle>
                            <div className="flex items-center">
                                {onFollowUp && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className={actionStyles.textBtn}
                                                    type="button"
                                                    onClick={handleFollowUpClick}
                                                >
                                                    {t('SqlResult.FollowUp.Button')}
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">{t('SqlResult.FollowUp.Tooltip')}</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className={actionStyles.iconBtn}
                                                onClick={handleGenerateChart}
                                                disabled={!canVisualize}
                                            >
                                                <BarChart3 className={actionStyles.icon} strokeWidth={2} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom">{t('SqlResult.ChartTooltip')}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
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
                                        <TooltipContent side="bottom">
                                            {open ? t('SqlResult.Collapse') : t('SqlResult.Expand')}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>


                        <CollapsibleContent className="space-y-3">
                            <SmartCodeBlock
                                value={sql}
                                maxHeightClassName="max-h-32"
                                onCopy={() => onCopy(sql)}
                            />
                        </CollapsibleContent>
                    </CardHeader>

                    <CollapsibleContent>
                        <CardContent className="space-y-3 px-3">
                            {ok ? (
                                previewRows.length > 0 ? (
                                    <div className="overflow-hidden rounded-md border border-border/60">
                                        <ScrollArea className="h-56 w-full">
                                            <div className="w-full overflow-x-auto">
                                                <table className="w-full min-w-max text-sm">
                                                    <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
                                                        <tr>
                                                            {displayColumns.map(col => (
                                                                <th
                                                                    key={col}
                                                                    className="border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                                                                >
                                                                    {col}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>

                                                    <tbody>
                                                        {previewRows.map((row, rowIndex) => (
                                                            <tr key={rowIndex} className="even:bg-muted/20">
                                                                {displayColumns.map(col => (
                                                                    <td
                                                                        key={col}
                                                                        className="border-b px-3 py-2 align-top"
                                                                    >
                                                                        <span className="text-[11px] font-mono text-foreground/80">
                                                                            {formatCellValue((row as any)[col])}
                                                                        </span>
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </ScrollArea>

                                        {truncated && (
                                            <div className="border-t border-border/60 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                                                {t('SqlResult.Truncated', { count: previewRows.length })}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground">{t('SqlResult.NoRows')}</div>
                                )
                            ) : (
                                <div className="flex items-start gap-2 text-sm text-destructive">
                                    <AlertCircle className="mt-[2px] h-4 w-4" />
                                    <span>{t('SqlResult.ExecutionFailed', { error: error?.message ?? t('SqlResult.UnknownError') })}</span>
                                </div>
                            )}

                            {chartError && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {chartError}
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {chartResult && <ChartResultCard result={chartResult} source="auto" onFollowUp={onFollowUp} />}
        </>
    );
});
