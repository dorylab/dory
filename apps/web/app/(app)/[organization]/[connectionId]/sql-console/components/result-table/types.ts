import type { MutableRefObject } from 'react';
import type { MetaState } from '@/types/sql-console';

export type ResultRow = { tabId: string; rid: number; rowData: any };

export type SessionStatus = 'running' | 'success' | 'error' | 'canceled' | null;

export type CacheEntry = {
    results: ResultRow[];
    meta?: Partial<MetaState> & { truncated?: boolean };
    sessionStatus?: SessionStatus;
    fullyLoaded?: boolean;
    dataVersion?: number;
    lastUpdated: number; // for LRU eviction
};

export type HydrateSetters = {
    setResults: (r: ResultRow[]) => void;
    resultsRef: MutableRefObject<ResultRow[]>;
    setMeta: (updater: (prev: MetaState) => MetaState) => void;
    setSessionStatus: (s: SessionStatus) => void;
    setLoading: (b: boolean) => void;
};

export type ApiExecStatus = 'idle' | 'running' | 'success' | 'error' | 'canceled';

export interface ApiResultItem {
    id: string; 
    tabId?: string | null; 
    sql?: string; 
    status: ApiExecStatus; 
    error?: string | null; 
    info?: string | null; 
    rowCount?: number; 
    startedAt?: number; 
    endedAt?: number; 
    truncated?: boolean; 
    setIndex?: number; 
}


export interface ResultBarProps {
    status: ApiExecStatus; 
    rowCount?: number;
    truncated?: boolean;
    indices: number[]; 
    activeSet: number; 
    onSetActiveSet: (n: number) => void;
}

export interface OverviewProps {
    items: ApiResultItem[]; 
}


export type OverviewItem = {
    id: string; 
    setIndex: number; 
    sql: string; 
    status: 'running' | 'success' | 'error' | 'canceled';
    startedAt?: number; 
    finishedAt?: number; 
    errorMessage?: string; 
    rowsReturned?: number; 
    rowsAffected?: number; 
};
