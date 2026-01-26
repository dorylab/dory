'use client';

import * as React from 'react';
import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
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

export function DataTablePagination({ total, pageIndex, pageSize, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100], className }: DataTablePaginationProps) {
    const t = useTranslations('DoryUI');
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex >= totalPages - 1;

    const handleChangePageSize = (value: string) => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        // 交给上层决定是否重置 pageIndex
        onPageSizeChange?.(next);
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
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToPage(0)} disabled={isFirstPage}>
                        <IconChevronsLeft className="h-4 w-4" />
                        <span className="sr-only">{t('Pagination.First')}</span>
                    </Button>

                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToPage(pageIndex - 1)} disabled={isFirstPage}>
                        <IconChevronLeft className="h-4 w-4" />
                        <span className="sr-only">{t('Pagination.Previous')}</span>
                    </Button>

                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToPage(pageIndex + 1)} disabled={isLastPage}>
                        <IconChevronRight className="h-4 w-4" />
                        <span className="sr-only">{t('Pagination.Next')}</span>
                    </Button>

                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToPage(totalPages - 1)} disabled={isLastPage}>
                        <IconChevronsRight className="h-4 w-4" />
                        <span className="sr-only">{t('Pagination.Last')}</span>
                    </Button>
                </div>

                <span>
                    {t('Pagination.PageStatus', { current: totalPages === 0 ? 0 : pageIndex + 1, total: totalPages })}
                </span>
            </div>
        </div>
    );
}
