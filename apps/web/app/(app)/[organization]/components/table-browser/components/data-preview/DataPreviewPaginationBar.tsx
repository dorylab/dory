'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

import { cn } from '@dory/web-utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000];

type DataPreviewPaginationBarProps = {
    pageIndex: number;
    pageSize: number;
    totalRowEstimate: number | null;
    currentPageRowCount: number;
    rowsLabel?: string | null;
    loading: boolean;
    variant?: 'footer' | 'inline';
    onPageChange: (pageIndex: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    actions?: ReactNode;
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

export function DataPreviewPaginationBar({
    pageIndex,
    pageSize,
    totalRowEstimate,
    currentPageRowCount,
    rowsLabel: rowsLabelProp,
    loading,
    variant = 'footer',
    onPageChange,
    onPageSizeChange,
    actions,
}: DataPreviewPaginationBarProps) {
    const t = useTranslations('TableBrowser');

    const totalPages = totalRowEstimate != null && totalRowEstimate > 0 ? Math.max(1, Math.ceil(totalRowEstimate / pageSize)) : null;
    const currentPageIndex = totalPages != null ? Math.max(0, Math.min(pageIndex, totalPages - 1)) : Math.max(0, pageIndex);
    const pageItems = totalPages != null ? getPaginationItems(currentPageIndex, totalPages) : [];
    const hasPrevious = currentPageIndex > 0;
    const hasNext = totalPages != null ? currentPageIndex + 1 < totalPages : currentPageRowCount >= pageSize;

    const pageLabel = t('Pagination.PageUnknown', { current: currentPageIndex + 1 });

    const rowsLabel = rowsLabelProp ?? (currentPageRowCount > 0 && totalRowEstimate == null ? t('Pagination.ShowingCount', { count: currentPageRowCount.toLocaleString() }) : null);

    const goToPage = (target: number) => {
        if (totalPages == null) {
            onPageChange(Math.max(0, target));
            return;
        }

        onPageChange(Math.max(0, Math.min(target, totalPages - 1)));
    };

    return (
        <div
            data-testid="data-preview-pagination"
            className={cn(
                'flex flex-nowrap items-center justify-between gap-2 text-xs text-muted-foreground',
                variant === 'footer' ? 'flex-none overflow-x-auto border-t bg-card px-3 py-1.5' : 'min-w-max flex-1',
            )}
        >
            <div className="flex shrink-0 flex-nowrap items-center gap-3">
                <div className="flex shrink-0 flex-nowrap items-center gap-1">
                    <Button variant="ghost" size="icon-xs" disabled={!hasPrevious || loading} onClick={() => goToPage(currentPageIndex - 1)} aria-label={t('Pagination.Previous')}>
                        <ChevronLeft />
                    </Button>

                    {totalPages != null ? (
                        pageItems.map(item =>
                            typeof item === 'number' ? (
                                <Button
                                    key={item}
                                    variant={item === currentPageIndex ? 'outline' : 'ghost'}
                                    size="icon-xs"
                                    disabled={loading}
                                    onClick={() => goToPage(item)}
                                    aria-current={item === currentPageIndex ? 'page' : undefined}
                                    aria-label={t('Pagination.GoToPage', { page: item + 1 })}
                                    className="h-6 w-auto min-w-6 px-1.5 border-border/60 shadow-none tabular-nums"
                                >
                                    {item + 1}
                                </Button>
                            ) : (
                                <span key={item} className="flex h-6 w-4 items-center justify-center text-muted-foreground/70" aria-hidden="true">
                                    <MoreHorizontal />
                                </span>
                            ),
                        )
                    ) : (
                        <span className="px-1 tabular-nums">{pageLabel}</span>
                    )}

                    <Button variant="ghost" size="icon-xs" disabled={!hasNext || loading} onClick={() => goToPage(currentPageIndex + 1)} aria-label={t('Pagination.Next')}>
                        <ChevronRight />
                    </Button>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    <span className="whitespace-nowrap">{t('Pagination.RowsPerPage')}</span>
                    <Select value={String(pageSize)} onValueChange={value => onPageSizeChange(Number(value))}>
                        <SelectTrigger size="control" className="h-6 min-h-6 min-w-22 shrink-0">
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

            <div className="flex shrink-0 items-center gap-2 tabular-nums">
                {rowsLabel ? <span>{rowsLabel}</span> : null}
                {actions}
            </div>
        </div>
    );
}
