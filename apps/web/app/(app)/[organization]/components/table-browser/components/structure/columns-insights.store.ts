'use client';

import { createJSONStorage, atomWithStorage } from 'jotai/utils';
import { ColumnInfo } from '../../type';

export type ColumnInsightCache = {
    hash: string;
    tags: Record<string, string[]>;
    summaries: Record<string, string | null>;
    updatedAt: number;
};

const storage = createJSONStorage<Record<string, ColumnInsightCache>>(() => localStorage);

export const columnInsightsCacheAtom = atomWithStorage<Record<string, ColumnInsightCache>>(
    'sqlConsole.columnInsights',
    {},
    storage,
);


export function applyColumnCache(columns: ColumnInfo[], cache?: ColumnInsightCache | null) {
    if (!cache) return columns;

    const tags = cache.tags || {};
    const summaries = cache.summaries || {};

    return columns.map(col => {
        const key = col.name.toLowerCase();
        return {
            ...col,
            semanticTags: tags[key] ?? col.semanticTags ?? [],
            semanticSummary: summaries[key] ?? col.semanticSummary ?? null,
        };
    });
}
