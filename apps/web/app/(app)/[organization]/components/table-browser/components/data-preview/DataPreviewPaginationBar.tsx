'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000];

type DataPreviewPaginationBarProps = {
    pageIndex: number;
    pageSize: number;
    totalRowEstimate: number | null;
    currentPageRowCount: number;
    loading: boolean;
    onPageChange: (pageIndex: number) => void;
    onPageSizeChange: (pageSize: number) => void;
};

export function DataPreviewPaginationBar({ pageIndex, pageSize, totalRowEstimate, currentPageRowCount, loading, onPageChange, onPageSizeChange }: DataPreviewPaginationBarProps) {
    const t = useTranslations('TableBrowser');

    const hasPrevious = pageIndex > 0;
    const totalPages = totalRowEstimate != null && totalRowEstimate > 0 ? Math.ceil(totalRowEstimate / pageSize) : null;
    const hasNext = totalPages != null ? pageIndex + 1 < totalPages : currentPageRowCount >= pageSize;

    const start = pageIndex * pageSize + 1;
    const end = pageIndex * pageSize + currentPageRowCount;

    const pageLabel = totalPages != null ? t('Pagination.PageOf', { current: pageIndex + 1, total: totalPages }) : t('Pagination.PageUnknown', { current: pageIndex + 1 });

    const rowsLabel =
        currentPageRowCount > 0
            ? totalRowEstimate != null
                ? `${start.toLocaleString()}–${end.toLocaleString()}`
                : t('Pagination.ShowingCount', { count: currentPageRowCount.toLocaleString() })
            : null;
    const totalRowsLabel = totalRowEstimate != null ? t('Pagination.TotalRows', { total: totalRowEstimate.toLocaleString() }) : null;

    return (
        <div className="flex-none flex items-center justify-between border-t bg-card px-3 py-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={!hasPrevious || loading}
                        onClick={() => onPageChange(pageIndex - 1)}
                        aria-label={t('Pagination.Previous')}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-1 tabular-nums">{pageLabel}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={!hasNext || loading}
                        onClick={() => onPageChange(pageIndex + 1)}
                        aria-label={t('Pagination.Next')}
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <div className="flex items-center gap-1.5">
                    <span>{t('Pagination.RowsPerPage')}</span>
                    <Select value={String(pageSize)} onValueChange={value => onPageSizeChange(Number(value))}>
                        <SelectTrigger className="h-6 min-w-22 shrink-0 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZE_OPTIONS.map(size => (
                                <SelectItem key={size} value={String(size)} className="text-xs">
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {(rowsLabel || totalRowsLabel) && (
                <div className="flex min-w-0 items-center gap-2 tabular-nums">
                    {rowsLabel && <span>{rowsLabel}</span>}
                    {rowsLabel && totalRowsLabel && <span className="text-border">|</span>}
                    {totalRowsLabel && <span>{totalRowsLabel}</span>}
                </div>
            )}
        </div>
    );
}
