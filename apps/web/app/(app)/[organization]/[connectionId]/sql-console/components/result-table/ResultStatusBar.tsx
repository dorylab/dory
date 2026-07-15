"use client";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, History } from 'lucide-react';
import { ExecMeta } from './Toolbar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { useLocale, useTranslations } from 'next-intl';

export const ResultStatusBar: React.FC<
    { meta?: ExecMeta } & {
        shouldShowLimitNotice: boolean;
        className?: string;
    }
> = ({ meta, shouldShowLimitNotice, className }) => {
    const t = useTranslations('SqlConsole');
    const locale = useLocale();
    if (!meta) return (
        <div className="flex items-center gap-4 flex-wrap">
            <span className="text-muted-foreground"></span>
        </div>
    );
    const { runningRemote, runningLocal, executionMs, sqlText, rowsAffected, shownRows, limitApplied, limitValue, truncated, errorMessage, startedAt, finishedAt, source } = meta;

    const isRunning = runningRemote || runningLocal;
    const isQueryHistoryResult = source === 'query-history';
    const formatTime = (value?: number) => {
        if (typeof value !== 'number') return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toLocaleString(locale);
    };
    const startedAtText = formatTime(startedAt);
    const finishedAtText = formatTime(finishedAt);

    return (
        <div className={cn('w-full justify-between bg-card border-t px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-3', className)}>
            <div className="flex items-center gap-4 flex-wrap">

                {isRunning ? (
                    <span className="inline-flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>{runningRemote ? t('ResultStatus.Running') : t('ResultStatus.Displaying')}…</span>
                    </span>
                ) : errorMessage ? (
                    <TooltipProvider delayDuration={150}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1.5 text-red-500 cursor-help">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    <span className="truncate max-w-[30vw] md:max-w-[40vw] lg:max-w-[48vw]">{t('ResultStatus.Failed')}</span>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[80vw] whitespace-pre-wrap break-words">
                                {errorMessage}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{t('ResultStatus.Finished')}</span>
                    </span>
                )}


                {!isRunning && typeof executionMs === 'number' && (
                    <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{t('ResultStatus.ExecMs', { value: Math.max(0, Math.round(executionMs)).toLocaleString(locale) })}</span>
                    </span>
                )}


                {shouldShowLimitNotice ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>{t('ResultStatus.LimitNotice', { value: limitValue?.toLocaleString(locale) || t('Common.NotAvailable') })}</span>
                    </span>
                ) : (
                    <>
                        {/* {typeof rowsReturned === 'number' && <span>{t('ResultStatus.Returned', { value: rowsReturned.toLocaleString(locale) })}</span>} */}
                        {typeof rowsAffected === 'number' && rowsAffected >= 0 && <span>{t('ResultStatus.Affected', { value: rowsAffected.toLocaleString(locale) })}</span>}
                        {typeof shownRows === 'number' && (
                            <span>
                                {t('ResultStatus.Shown', { value: shownRows.toLocaleString(locale) })}
                                {limitApplied && typeof limitValue === 'number' && (
                                    <span className="ml-1 text-muted-foreground">{t('ResultStatus.LimitSuffix', { value: limitValue.toLocaleString(locale) })}</span>
                                )}
                            </span>
                        )}
                    </>
                )}
                {truncated && <span className="text-amber-600">{t('ResultStatus.Truncated')}</span>}
                {isQueryHistoryResult && (
                    <TooltipProvider delayDuration={150}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex cursor-help items-center gap-1.5 text-muted-foreground">
                                    <History className="h-3.5 w-3.5" />
                                    <span>{t('ResultStatus.HistorySource')}</span>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[520px] space-y-1 whitespace-pre-wrap break-words text-xs">
                                <div>{t('ResultStatus.HistorySourceTooltip')}</div>
                                {startedAtText ? <div>{t('ResultStatus.HistorySourceStarted', { value: startedAtText })}</div> : null}
                                {finishedAtText ? <div>{t('ResultStatus.HistorySourceFinished', { value: finishedAtText })}</div> : null}
                                {typeof executionMs === 'number' ? (
                                    <div>{t('ResultStatus.HistorySourceDuration', { value: Math.max(0, Math.round(executionMs)).toLocaleString(locale) })}</div>
                                ) : null}
                                {sqlText ? <div className="mt-2 border-t pt-2 font-mono text-[11px] leading-snug">{sqlText}</div> : null}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            {sqlText && (
                <TooltipProvider delayDuration={150}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span
                                className="
                                    text-muted-foreground
                                    inline-block align-middle
                                    overflow-hidden text-ellipsis whitespace-nowrap
                                    cursor-help
                                    max-w-75
                                "
                                aria-label={t('ResultStatus.SqlPreviewAria')}
                            >
                                {/* {t('ResultStatus.SqlPreviewLabel')} */}
                                <span className="ml-1">{sqlText}</span>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[80vw] whitespace-pre-wrap wrap-break-word">
                            {sqlText}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </div>
    );
};
