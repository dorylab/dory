'use client';

import { useEffect } from 'react';
import { parseAsInteger, useQueryStates } from 'nuqs';

export const KNOWLEDGE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

type ListTab = 'definitions' | 'queries' | 'sources' | 'rules' | 'review';

export function useKnowledgeListPagination(tab: ListTab, total: number | undefined, focus?: { id: string | null; index: number }) {
    const [{ page, knowledgePageSize }, setPagination] = useQueryStates(
        { page: parseAsInteger.withDefault(1), knowledgePageSize: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE) },
        { urlKeys: { page: `${tab}Page` }, history: 'replace' },
    );
    const pageSize = KNOWLEDGE_PAGE_SIZE_OPTIONS.includes(knowledgePageSize) ? knowledgePageSize : DEFAULT_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize));
    const pageIndex = focus?.id && focus.index >= 0 ? Math.floor(focus.index / pageSize) : Math.min(Math.max(page - 1, 0), totalPages - 1);

    useEffect(() => {
        if (total !== undefined && page !== pageIndex + 1) void setPagination({ page: pageIndex + 1 });
    }, [page, pageIndex, setPagination, total]);

    return {
        pageIndex,
        pageSize,
        pageSizeOptions: KNOWLEDGE_PAGE_SIZE_OPTIONS,
        onPageChange: (nextPageIndex: number) => void setPagination({ page: nextPageIndex + 1 }),
        onPageSizeChange: (nextPageSize: number) => void setPagination({ page: 1, knowledgePageSize: nextPageSize }),
    };
}
