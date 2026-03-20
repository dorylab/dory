'use client';

import React from 'react';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { Database, Timer, HardDrive, ShieldAlert, RefreshCw, Clipboard, CheckCheck } from 'lucide-react';
import { formatDuration } from 'date-fns';
import { formatNumber, formatTime, formatBytes } from '../utils/format';
import { useTranslations } from 'next-intl';

export type ResultStatus = 'running' | 'success' | 'error' | 'canceled' | 'idle';

export interface ResultMeta {
    setIndex: number;
    rowsReturned?: number;
    rowsAffected?: number;
    durationMs?: number;
    truncated?: boolean;
    fromCache?: boolean;
    source?: string;
    scannedRows?: number;
    scannedBytes?: number;
    startedAt?: Date | string | number;
    finishedAt?: Date | string | number;
    status?: ResultStatus;
    errorMessage?: string;
}

export function ResultMetaBar({ meta, compact = false, className }: { meta: ResultMeta; compact?: boolean; className?: string }) {
    const t = useTranslations('SqlConsole');
    const [copied, setCopied] = React.useState(false);

    const {
        setIndex,
        rowsReturned,
        rowsAffected,
        durationMs,
        truncated,
        fromCache,
        source,
        scannedRows,
        scannedBytes,
        startedAt,
        finishedAt,
        status = 'idle',
        errorMessage,
    } = meta;

    const copy = async () => {
        try {
            await navigator.clipboard?.writeText(JSON.stringify(meta, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            /* ignore */
        }
    };

    const statusColor: Record<ResultStatus, string> = {
        idle: 'bg-muted text-muted-foreground',
        running: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
        success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        error: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
        canceled: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    };

    const rowInfo =
        typeof rowsReturned === 'number'
            ? t('ResultMeta.RowsReturned', { value: formatNumber(rowsReturned) })
            : typeof rowsAffected === 'number'
              ? t('ResultMeta.RowsAffected', { value: formatNumber(rowsAffected) })
              : t('Common.EmptyValue');

    return (
        <div
            className={`w-full border-t px-3 ${compact ? 'py-1' : 'py-1.5'} text-xs text-muted-foreground flex items-center gap-3 flex-wrap ${className ?? ''}`}
            data-result-set={setIndex}
            role="contentinfo"
            aria-label={t('ResultMeta.AriaLabel', { index: setIndex + 1 })}
        >
            {/* Result index + status */}
            <Badge className={`${statusColor[status]} border-0`} variant="secondary">
                {t('ResultMeta.Title', { index: setIndex + 1, status })}
            </Badge>

            {/* Duration */}
            <span className="inline-flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" />
                <b className="text-foreground">
                    {typeof durationMs === 'number'
                        ? formatDuration(require('date-fns').intervalToDuration({ start: 0, end: durationMs }))
                        : t('Common.EmptyValue')}
                </b>
            </span>

            {/* Time range */}
            {!compact && (
                <>
                    <span>
                        {t('ResultMeta.Started')}: <b className="text-foreground">{formatTime(startedAt)}</b>
                    </span>
                    <span>
                        {t('ResultMeta.Finished')}: <b className="text-foreground">{formatTime(finishedAt)}</b>
                    </span>
                </>
            )}

            {/* Rows / affected */}
            <span className="inline-flex items-center gap-1">
                <Database className="h-3.5 w-3.5" />
                <b className="text-foreground">{rowInfo}</b>
            </span>

            {/* Scan metrics */}
            {(scannedRows != null || scannedBytes != null) && (
                <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3.5 w-3.5" />
                    {t('ResultMeta.Scan')}: <b className="text-foreground">{formatNumber(scannedRows)}</b>
                    {typeof scannedBytes === 'number' ? (
                        <>
                            {' / '}
                            <b className="text-foreground">{formatBytes(scannedBytes)}</b>
                        </>
                    ) : null}
                </span>
            )}

            {/* Cache */}
            {fromCache != null && (
                <span className="inline-flex items-center gap-1">
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('ResultMeta.Cache')}: <b className="text-foreground">{fromCache ? t('ResultMeta.CacheHit') : t('ResultMeta.CacheMiss')}</b>
                </span>
            )}

            {/* Source */}
            {source && (
                <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3.5 w-3.5" />
                    {t('ResultMeta.Source')}: <b className="text-foreground">{source}</b>
                </span>
            )}

            {/* Truncated */}
            {truncated && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {t('ResultMeta.Truncated')}
                </span>
            )}

            {/* Error tooltip */}
            {status === 'error' && errorMessage && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Badge variant="destructive" className="cursor-default">
                                {t('Common.Error')}
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center" className="max-w-[520px] whitespace-pre-wrap leading-snug">
                            {errorMessage}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            {/* right side actions */}
            <span className="ml-auto" />
            <Button variant="outline" size="sm" className="h-6 px-2 gap-1" onClick={copy} title={t('ResultMeta.CopyTitle')}>
                {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                {copied ? t('ResultMeta.Copied') : t('ResultMeta.CopyMeta')}
            </Button>
        </div>
    );
}
