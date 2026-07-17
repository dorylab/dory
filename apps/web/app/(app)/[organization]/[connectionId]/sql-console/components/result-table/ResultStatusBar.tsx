'use client';

import { AlertTriangle, CheckCircle2, History, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/registry/new-york-v4/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';

import type { ExecMeta } from './Toolbar';
import { formatBytes, formatCompactDuration } from './utils/format';

function Separator() {
    return <span aria-hidden="true">·</span>;
}

export const ResultStatusBar: React.FC<
    { meta?: ExecMeta } & {
        shouldShowLimitNotice: boolean;
        className?: string;
    }
> = ({ meta, shouldShowLimitNotice, className }) => {
    const t = useTranslations('SqlConsole');
    const locale = useLocale();

    if (!meta) {
        return <div className="flex flex-wrap items-center gap-2 border-t bg-card px-3 py-1.5 text-xs text-muted-foreground" />;
    }

    const { runningRemote, runningLocal, executionMs, rowsReturned, rowsAffected, byteSize, limitValue, truncated, errorMessage, source } = meta;
    const isRunning = runningRemote || runningLocal;
    const isQueryHistoryResult = source === 'query-history';
    const metrics: Array<{ key: string; value: React.ReactNode }> = [];

    if (!isRunning && typeof executionMs === 'number') {
        metrics.push({ key: 'duration', value: formatCompactDuration(executionMs) });
    }
    if (!isRunning && typeof rowsReturned === 'number') {
        metrics.push({ key: 'rows', value: t('ResultStatus.Rows', { value: rowsReturned.toLocaleString(locale) }) });
    } else if (!isRunning && typeof rowsAffected === 'number' && rowsAffected >= 0) {
        metrics.push({ key: 'affected', value: t('ResultStatus.Affected', { value: rowsAffected.toLocaleString(locale) }) });
    }
    if (!isRunning && typeof byteSize === 'number') {
        metrics.push({ key: 'size', value: formatBytes(byteSize) });
    }

    return (
        <div className={cn('flex w-full flex-wrap items-center gap-2 border-t bg-card px-3 py-1.5 text-xs text-muted-foreground', className)}>
            {isRunning ? (
                <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>{runningRemote ? t('ResultStatus.Running') : t('ResultStatus.Displaying')}…</span>
                </span>
            ) : errorMessage ? (
                <TooltipProvider delayDuration={150}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help items-center gap-1.5 text-red-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span>{t('ResultStatus.Failed')}</span>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[80vw] whitespace-pre-wrap break-words">
                            {errorMessage}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : isQueryHistoryResult ? (
                <span className="inline-flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    <span>{t('ResultStatus.HistorySource')}</span>
                </span>
            ) : (
                <span className="inline-flex items-center gap-1.5 text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{t('ResultStatus.Finished')}</span>
                </span>
            )}

            {metrics.map(metric => (
                <span key={metric.key} className="contents">
                    <Separator />
                    <span>{metric.value}</span>
                </span>
            ))}

            {shouldShowLimitNotice ? (
                <>
                    <Separator />
                    <span className="inline-flex items-center gap-1.5 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t('ResultStatus.LimitNotice', { value: limitValue?.toLocaleString(locale) || t('Common.NotAvailable') })}
                    </span>
                </>
            ) : null}
            {truncated ? (
                <>
                    <Separator />
                    <span className="text-amber-600">{t('ResultStatus.Truncated')}</span>
                </>
            ) : null}
        </div>
    );
};
