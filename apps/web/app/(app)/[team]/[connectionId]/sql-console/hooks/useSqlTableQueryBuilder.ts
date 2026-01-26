'use client';

import { useCallback } from 'react';
import { SQLTab } from '@/types/tabs';

const DEFAULT_TABLE_PREVIEW_LIMIT = 1000;

export function useSqlTableQueryBuilder() {
    const buildTableQuery = useCallback((tab: SQLTab) => {
        if (tab.tabType !== 'table' || !tab.tableName) return '';
        const hasDbInName = tab.tableName.includes('.');
        const prefix = tab.databaseName && !hasDbInName ? `${tab.databaseName}.` : '';
        const limit = tab.dataView?.limit ?? DEFAULT_TABLE_PREVIEW_LIMIT;
        return `SELECT * FROM ${prefix}${tab.tableName} LIMIT ${limit}`;
    }, []);

    return { buildTableQuery };
}

export { DEFAULT_TABLE_PREVIEW_LIMIT };

