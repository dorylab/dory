export type ChatCompletion = {
    status: 'completed' | 'partial' | 'failed' | 'aborted';
    completed: string[];
    unfinished: string[];
    report?: { documentId: string; revision?: number; version?: number; saved: boolean };
    canContinue: boolean;
};
