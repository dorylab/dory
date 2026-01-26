'use client';

import React from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, EllipsisVerticalIcon, Square } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { OverviewItem } from './types';
import { useLocale, useTranslations } from 'next-intl';

export function OverviewTable(props: {
    items: OverviewItem[];
    onOpenResultById?: (id: string) => void;
    onOpenResultBySetIndex?: (setIndex: number) => void; // 0-based
}) {
    const { items, onOpenResultById, onOpenResultBySetIndex } = props;
    const t = useTranslations('SqlConsole');
    const locale = useLocale();

    return (
        <Table>
            <TableHeader className="bg-muted/50">
                <TableRow className="!border-0">
                    <TableHead className="w-[120px]">{t('Overview.Status')}</TableHead>
                    <TableHead>{t('Overview.Sql')}</TableHead>
                    <TableHead>{t('Overview.Message')}</TableHead>
                    <TableHead className="w-[160px] text-right">{t('Overview.Duration')}</TableHead>
                    <TableHead className="w-[160px] text-right">{t('Overview.Rows')}</TableHead>
                    {/* <TableHead className="w-[240px]">Time</TableHead> */}
                    <TableHead className="rounded-r-lg w-[80px]" />
                </TableRow>
            </TableHeader>
            <TableBody className="**:data-[slot=table-cell]:py-2.5">
                {(!items || items.length === 0) && (
                    <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                            {t('Overview.Empty')}
                        </TableCell>
                    </TableRow>
                )}

                {items?.map((it, idx) => {
                    const dur = it.startedAt && it.finishedAt ? Math.max(0, it.finishedAt - it.startedAt) : undefined;
                    const isErr = it.status === 'error';
                    const isRun = it.status === 'running';
                    const isOk = it.status === 'success';
                    const isCanceled = it.status === 'canceled';

                    return (
                        <TableRow key={it.id ?? idx}>
                            <TableCell>
                                <div className="flex items-center gap-1.5">
                                    {isRun && (
                                        <Badge variant="outline" className="gap-1.5">
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                            {t('Overview.StatusRunning')}
                                        </Badge>
                                    )}
                                    {isOk && (
                                        <Badge className="gap-1.5 bg-green-600/10 text-green-700 dark:bg-green-900/40 dark:text-green-100">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            {t('Overview.StatusSuccess')}
                                        </Badge>
                                    )}
                                    {isErr && (
                                        <Badge className="gap-1.5 bg-red-600/10 text-red-700 dark:bg-red-900/40 dark:text-red-100">
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            {t('Overview.StatusError')}
                                        </Badge>
                                    )}
                                    {isCanceled && (
                                        <Badge className="gap-1.5 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                            <Square className="h-3.5 w-3.5" />
                                            {t('Overview.StatusCanceled')}
                                        </Badge>
                                    )}
                                </div>
                            </TableCell>

                            <TableCell>
                                <div className={cn('text-xs leading-5 whitespace-pre-wrap break-words', isErr && 'text-red-600 dark:text-red-400')}>
                                    <span className="line-clamp-2" title={it.sql}>
                                        {it.sql}
                                    </span>
                                </div>
                            </TableCell>

                            <TableCell>
                                <div className={cn('text-xs leading-5 whitespace-pre-wrap break-words', isErr && 'text-red-600 dark:text-red-400')}>
                                    {isErr && it.errorMessage ? (
                                        <div className="mt-1 text-[11px] opacity-80 line-clamp-1" title={it.errorMessage}>
                                            {it.errorMessage}
                                        </div>
                                    ) : (
                                        <div className="mt-1 text-[11px] opacity-80 line-clamp-1" title={isCanceled ? t('Overview.StatusCanceled') : t('Overview.StatusSuccess')}>
                                            {isCanceled ? t('Overview.StatusCanceled') : t('Overview.StatusSuccess')}
                                        </div>
                                    )}
                                </div>
                            </TableCell>

                            <TableCell className="text-right">{typeof dur === 'number' ? t('Overview.DurationMs', { value: dur.toLocaleString(locale) }) : t('Common.EmptyValue')}</TableCell>

                            <TableCell className="text-right">
                                {typeof it.rowsReturned === 'number'
                                    ? it.rowsReturned.toLocaleString(locale)
                                    : typeof it.rowsAffected === 'number'
                                      ? t('Overview.RowsAffected', { value: it.rowsAffected.toLocaleString(locale) })
                                      : t('Common.EmptyValue')}
                            </TableCell>

                            {/* <TableCell>
                                <div className="text-xs text-muted-foreground">
                                    {it.startedAt ? new Date(it.startedAt).toLocaleString() : '--'}
                                    {it.finishedAt ? `  →  ${new Date(it.finishedAt).toLocaleString()}` : ''}
                                </div>
                            </TableCell> */}

                            <TableCell className='text-right'>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="size-6">
                                            <EllipsisVerticalIcon />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {onOpenResultById && <DropdownMenuItem onClick={() => onOpenResultById(it.id)}>{t('Overview.ViewResult')}</DropdownMenuItem>}
                                        {onOpenResultBySetIndex && (
                                            <DropdownMenuItem onClick={() => onOpenResultBySetIndex(it.setIndex)}>
                                                {t('Overview.OpenResult', { index: it.setIndex + 1 })}
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(it.sql)}>{t('Overview.CopySql')}</DropdownMenuItem>
                                        {isErr && it.errorMessage && (
                                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(it.errorMessage!)}>{t('Overview.CopyError')}</DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
