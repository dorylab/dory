"use client";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
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
    const { runningRemote, runningLocal, executionMs, sqlText, rowsReturned, rowsAffected, shownRows, limitApplied, limitValue, truncated, errorMessage } = meta;

    const isRunning = runningRemote || runningLocal;

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


                {typeof executionMs === 'number' && (
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
