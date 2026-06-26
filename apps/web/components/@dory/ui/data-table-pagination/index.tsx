'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@dory/web-utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { useTranslations } from 'next-intl';

export type DataTablePaginationProps = {
    /** 总记录数 */
    total: number;
    /** 当前页索引，从 0 开始 */
    pageIndex: number;
    /** 每页条数 */
    pageSize: number;
    /** 页码变更（传入新的 pageIndex） */
    onPageChange: (pageIndex: number) => void;
    /** 每页条数变更（可选） */
    onPageSizeChange?: (pageSize: number) => void;
    /** 可选的 pageSize 列表 */
    pageSizeOptions?: number[];
    /** 外层容器 className */
    className?: string;
};

type PaginationItem = number | 'start-ellipsis' | 'end-ellipsis';

function getPaginationItems(pageIndex: number, totalPages: number): PaginationItem[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index);
    }

    const currentPage = pageIndex + 1;
    const showStartEllipsis = currentPage > 4;
    const showEndEllipsis = currentPage < totalPages - 3;

    if (!showStartEllipsis && showEndEllipsis) {
        return [0, 1, 2, 3, 4, 'end-ellipsis', totalPages - 1];
    }

    if (showStartEllipsis && !showEndEllipsis) {
        return [0, 'start-ellipsis', totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1];
    }

    return [0, 'start-ellipsis', pageIndex - 1, pageIndex, pageIndex + 1, 'end-ellipsis', totalPages - 1];
}

export function DataTablePagination({ total, pageIndex, pageSize, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100], className }: DataTablePaginationProps) {
    const t = useTranslations('DoryUI');
    const totalPages = Math.max(1, total > 0 ? Math.ceil(total / pageSize) : 1);
    const currentPageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    const pageItems = getPaginationItems(currentPageIndex, totalPages);
    const isFirstPage = currentPageIndex === 0;
    const isLastPage = currentPageIndex >= totalPages - 1;

    const handleChangePageSize = (value: string) => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        // 交给上层决定是否重置 pageIndex
        onPageSizeChange?.(next);
    };

    const handleSelectPage = (value: string) => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        goToPage(next);
    };

    const goToPage = (target: number) => {
        const clamped = Math.max(0, Math.min(target, totalPages - 1));
        onPageChange(clamped);
    };

    return (
        <div className={cn('flex flex-col gap-3 px-4 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between', className)}>
            <div>{t('Pagination.Total', { total })}</div>

            <div className="flex flex-wrap items-center gap-2">
                {onPageSizeChange && (
                    <div className="mr-8 flex items-center gap-2">
                        {t('Pagination.PerPage')}
                        <Select value={String(pageSize)} onValueChange={handleChangePageSize}>
                            <SelectTrigger size="sm">
                                <SelectValue placeholder={t('Pagination.PageSizePlaceholder')} />
                            </SelectTrigger>
                            <SelectContent align="end">
                                {pageSizeOptions.map(size => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {t('Pagination.Records')}
                    </div>
                )}

                {/* 翻页按钮 */}
                <div className="flex flex-wrap items-center gap-1">
                    <Button variant="outline" size="icon-sm" onClick={() => goToPage(0)} disabled={isFirstPage} aria-label={t('Pagination.First')}>
                        <ChevronsLeft />
                        <span className="sr-only">{t('Pagination.First')}</span>
                    </Button>

                    <Button variant="outline" size="icon-sm" onClick={() => goToPage(currentPageIndex - 1)} disabled={isFirstPage} aria-label={t('Pagination.Previous')}>
                        <ChevronLeft />
                        <span className="sr-only">{t('Pagination.Previous')}</span>
                    </Button>

                    {pageItems.map(item =>
                        typeof item === 'number' ? (
                            <Button
                                key={item}
                                variant={item === currentPageIndex ? 'outline' : 'ghost'}
                                size="icon-sm"
                                onClick={() => goToPage(item)}
                                aria-current={item === currentPageIndex ? 'page' : undefined}
                                aria-label={t('Pagination.GoToPage', { page: item + 1 })}
                                className="tabular-nums"
                            >
                                {item + 1}
                            </Button>
                        ) : (
                            <span key={item} className="flex size-8 items-center justify-center text-muted-foreground" aria-hidden="true">
                                <MoreHorizontal />
                            </span>
                        ),
                    )}

                    <Button variant="outline" size="icon-sm" onClick={() => goToPage(currentPageIndex + 1)} disabled={isLastPage} aria-label={t('Pagination.Next')}>
                        <ChevronRight />
                        <span className="sr-only">{t('Pagination.Next')}</span>
                    </Button>

                    <Button variant="outline" size="icon-sm" onClick={() => goToPage(totalPages - 1)} disabled={isLastPage} aria-label={t('Pagination.Last')}>
                        <ChevronsRight />
                        <span className="sr-only">{t('Pagination.Last')}</span>
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <span>{t('Pagination.GoTo')}</span>
                    <Select value={String(currentPageIndex)} onValueChange={handleSelectPage}>
                        <SelectTrigger size="sm" className="min-w-22">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end" className="max-h-64">
                            {Array.from({ length: totalPages }, (_, index) => (
                                <SelectItem key={index} value={String(index)}>
                                    {t('Pagination.PageOption', { page: index + 1 })}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <span>{t('Pagination.PageStatus', { current: currentPageIndex + 1, total: totalPages })}</span>
            </div>
        </div>
    );
}
