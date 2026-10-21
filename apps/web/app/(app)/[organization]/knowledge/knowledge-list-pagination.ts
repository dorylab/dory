'use client';

import { useEffect, useRef } from 'react';
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
    const pageIndex = Math.min(Math.max(page - 1, 0), totalPages - 1);
    const handledFocus = useRef<string | null>(null);

    useEffect(() => {
        if (total !== undefined && page !== pageIndex + 1) void setPagination({ page: pageIndex + 1 });
    }, [page, pageIndex, setPagination, total]);

    useEffect(() => {
        if (tab === 'definitions') console.log('PAGINATION_EFFECT', { page, total, focus, pageIndex, pageSize });
        if (!focus?.id) {
            handledFocus.current = null;
            return;
        }
        if (focus.index < 0) return;
        const focusKey = focus.id;
        if (handledFocus.current === focusKey) return;
        handledFocus.current = focusKey;
        const focusedPage = Math.floor(focus.index / pageSize) + 1;
        if (focusedPage !== pageIndex + 1) void setPagination({ page: focusedPage });
    }, [focus?.id, focus?.index, pageSize, pageIndex, setPagination]);

    return {
        pageIndex,
        pageSize,
        pageSizeOptions: KNOWLEDGE_PAGE_SIZE_OPTIONS,
        onPageChange: (nextPageIndex: number) => void setPagination({ page: nextPageIndex + 1 }),
        onPageSizeChange: (nextPageSize: number) => void setPagination({ page: 1, knowledgePageSize: nextPageSize }),
    };
}
