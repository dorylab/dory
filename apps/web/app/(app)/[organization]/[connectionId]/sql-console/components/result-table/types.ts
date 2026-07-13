export type ResultRow = { tabId: string; rid: number; rowData: any };

export type SessionStatus = 'running' | 'success' | 'error' | 'canceled' | null;

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
