'use client';

import { AlertTriangle, CheckCircle2, EllipsisVerticalIcon, RefreshCw, Square } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@dory/web-utils';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/registry/new-york-v4/ui/accordion';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';

import type { OverviewItem } from './types';
import { formatBytes, formatCompactDuration, formatRelativeTimestamp, getResultSetStorageLabel } from './utils/format';

function StatusBadge({ status }: { status: OverviewItem['status'] }) {
    const t = useTranslations('SqlConsole');

    if (status === 'running') {
        return (
            <Badge variant="outline" className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {t('Overview.StatusRunning')}
            </Badge>
        );
    }
    if (status === 'error') {
        return (
            <Badge className="gap-1.5 bg-red-600/10 text-red-700 dark:bg-red-900/40 dark:text-red-100">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('Overview.StatusError')}
            </Badge>
        );
    }
    if (status === 'canceled') {
        return (
            <Badge className="gap-1.5 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <Square className="h-3.5 w-3.5" />
                {t('Overview.StatusCanceled')}
            </Badge>
        );
    }

    return (
        <Badge className="gap-1.5 bg-green-600/10 text-green-700 dark:bg-green-900/40 dark:text-green-100">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('Overview.StatusSuccess')}
        </Badge>
    );
}

function MetadataItem({ label, value, title }: { label: string; value: string; title?: string }) {
    return (
        <div className="min-w-0 rounded-md border bg-muted/20 px-3 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 truncate text-sm font-medium text-foreground" title={title ?? value}>
                {value}
            </div>
        </div>
    );
}

export function OverviewTable(props: { items: OverviewItem[]; onOpenResultById?: (id: string) => void; onOpenResultBySetIndex?: (setIndex: number) => void }) {
    const { items, onOpenResultById, onOpenResultBySetIndex } = props;
    const t = useTranslations('SqlConsole');
    const locale = useLocale();
    const now = Date.now();

    if (!items.length) {
        return <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">{t('Overview.Empty')}</div>;
    }

    return (
        <div className="h-full overflow-auto bg-card p-3">
            <Accordion type="single" collapsible className="space-y-2">
                {items.map(item => {
                    const durationMs = item.durationMs ?? (item.startedAt != null && item.finishedAt != null ? Math.max(0, item.finishedAt - item.startedAt) : null);
                    const rows =
                        typeof item.rowsReturned === 'number'
                            ? item.rowsReturned.toLocaleString(locale)
                            : typeof item.rowsAffected === 'number'
                              ? t('Overview.RowsAffected', { value: item.rowsAffected.toLocaleString(locale) })
                              : t('Common.EmptyValue');
                    const createdRelative = formatRelativeTimestamp(item.createdAt, locale, now) ?? t('Common.EmptyValue');
                    const expiresRelative =
                        item.expiresAt == null
                            ? t('Common.EmptyValue')
                            : item.expiresAt <= now
                              ? t('Overview.Expired')
                              : (formatRelativeTimestamp(item.expiresAt, locale, now) ?? t('Common.EmptyValue'));
                    const storageLabel = getResultSetStorageLabel(item);
                    return (
                        <AccordionItem key={item.id} value={item.id} className="overflow-hidden rounded-lg border bg-background last:border-b">
                            <div className="flex w-full items-start gap-2 px-4 [&>h3]:min-w-0 [&>h3]:flex-1">
                                <AccordionTrigger className="min-w-0 cursor-pointer py-3 hover:no-underline">
                                    <div className="flex min-w-0 flex-1 items-start gap-3 pr-2">
                                        <StatusBadge status={item.status} />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-xs font-semibold text-foreground">{t('Results.ResultTab', { index: item.setIndex + 1 })}</div>
                                            <div
                                                className={cn(
                                                    'mt-1 line-clamp-2 font-mono text-xs font-normal text-muted-foreground',
                                                    item.status === 'error' && 'text-red-600 dark:text-red-400',
                                                )}
                                            >
                                                {item.sql}
                                            </div>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="ml-auto mt-2.5 size-7 shrink-0 cursor-pointer" aria-label={t('Overview.Actions')}>
                                            <EllipsisVerticalIcon className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {onOpenResultById ? <DropdownMenuItem onClick={() => onOpenResultById(item.id)}>{t('Overview.ViewResult')}</DropdownMenuItem> : null}
                                        {onOpenResultBySetIndex ? (
                                            <DropdownMenuItem onClick={() => onOpenResultBySetIndex(item.setIndex)}>{t('Overview.OpenResult')}</DropdownMenuItem>
                                        ) : null}
                                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(item.sql)}>{t('Overview.CopySql')}</DropdownMenuItem>
                                        {item.status === 'error' && item.errorMessage ? (
                                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(item.errorMessage!)}>{t('Overview.CopyError')}</DropdownMenuItem>
                                        ) : null}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <AccordionContent className="border-t px-4 pt-4">
                                {item.status === 'error' && item.errorMessage ? (
                                    <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">{item.errorMessage}</div>
                                ) : null}
                                {item.status !== 'error' ? (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <MetadataItem label={t('Overview.Rows')} value={rows} />
                                        <MetadataItem label={t('Overview.Size')} value={formatBytes(item.byteSize)} />
                                        <MetadataItem label={t('Overview.Storage')} value={t(`Overview.StorageValues.${storageLabel}`)} />
                                        <MetadataItem
                                            label={t('Overview.Created')}
                                            value={createdRelative}
                                            title={item.createdAt == null ? undefined : new Date(item.createdAt).toLocaleString(locale)}
                                        />
                                        <MetadataItem label={t('Overview.QueryDuration')} value={formatCompactDuration(durationMs)} />
                                        <MetadataItem
                                            label={t('Overview.Expires')}
                                            value={expiresRelative}
                                            title={item.expiresAt == null ? undefined : new Date(item.expiresAt).toLocaleString(locale)}
                                        />
                                    </div>
                                ) : null}
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>
        </div>
    );
}
