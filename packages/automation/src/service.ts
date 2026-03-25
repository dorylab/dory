import type { AutomationRuntimeAdapters } from './types';

export class AutomationServiceError extends Error {
    readonly code: 'CONNECTION_NOT_FOUND' | 'INTERNAL_ERROR';
    readonly status: number;

    constructor(code: 'CONNECTION_NOT_FOUND' | 'INTERNAL_ERROR', message: string, status: number) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'AutomationServiceError';
    }
}

export function isAutomationServiceError(error: unknown): error is AutomationServiceError {
    return error instanceof AutomationServiceError;
}

export function createAutomationService(
    adapters: Pick<AutomationRuntimeAdapters, 'listConnections' | 'runQuery' | 'listTables' | 'describeTable'>,
) {
    return {
        listAutomationConnections: adapters.listConnections,
        runAutomationQuery: adapters.runQuery,
        listAutomationTables: adapters.listTables,
        describeAutomationTable: adapters.describeTable,
    };
}
