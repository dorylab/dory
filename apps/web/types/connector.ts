export type RawResult = {
    [key: string]: any;
};

export interface ExecutionResult {
    rawResult: RawResult[];
    affectedRows?: number;
    error?: string;
}

export interface DashboardConnection {
    id: string;
    enterApp?: boolean;
}
