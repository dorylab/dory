import { executeActionClient } from '@/lib/actions/client';
import type { WorkScope, WorkType } from './types';

export type DatabaseOption = {
    label?: string;
    value?: string;
    name?: string;
};

export type TableOption = {
    label?: string;
    value?: string;
    name?: string;
};

export type SchemaPreview = {
    databaseCount: number;
    tableCount: number;
    tableNames: string[];
    scannedDatabaseNames: string[];
};

export const workTypeOptions: Array<{ value: WorkType; label: string; description: string }> = [
    { value: 'investigation', label: 'Investigation', description: 'Find the cause and build an evidence chain.' },
    { value: 'analysis', label: 'Analysis', description: 'Analyze trends and compare metrics.' },
    { value: 'monitoring', label: 'Monitoring', description: 'Keep watching a recurring issue.' },
    { value: 'data_qa', label: 'Data QA', description: 'Check quality, anomalies, and reliability.' },
    { value: 'sql_workspace', label: 'SQL Workspace', description: 'Start from SQL exploration.' },
];

export const timeRangeOptions = ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'This month', 'Custom'];
export const safetyConstraintOptions = ['Do not modify data', 'Prefer SQL evidence', 'Ask before running expensive queries'];

export function optionName(item: DatabaseOption | TableOption) {
    return item.name ?? item.value ?? item.label ?? '';
}

export function parseList(value: string) {
    return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

export function serializeList(value: string[] | undefined) {
    return (value ?? []).join(', ');
}

export function buildScope(input: { timeRange: string; tablesMode: 'auto' | 'selected'; selectedTablesText?: string; selectedTables?: string[]; metricsText: string; constraints: string[] }): WorkScope {
    return {
        timeRange: input.timeRange,
        tablesMode: input.tablesMode,
        selectedTables: input.tablesMode === 'selected' ? (input.selectedTables ?? parseList(input.selectedTablesText ?? '')) : [],
        metrics: parseList(input.metricsText),
        constraints: input.constraints,
    };
}

export async function fetchSchemaPreview(connectionId: string): Promise<SchemaPreview> {
    const databasesResponse = await executeActionClient<{ databases?: DatabaseOption[] }>('schema.listDatabases', { connectionId }, { currentConnectionId: connectionId });
    const databases = databasesResponse.databases ?? [];
    const databaseNames = databases.map(optionName).filter(Boolean);
    const scannedDatabaseNames = databaseNames.slice(0, 3);
    const tableResults = await Promise.all(
        scannedDatabaseNames.map(database =>
            executeActionClient<{ tables?: TableOption[] }>('schema.listTables', { connectionId, database }, { currentConnectionId: connectionId }).catch(() => ({ tables: [] })),
        ),
    );
    const tableNames = Array.from(
        new Set(
            tableResults
                .flatMap(result => result.tables ?? [])
                .map(optionName)
                .filter(Boolean),
        ),
    ).slice(0, 8);
    const tableCount = tableResults.reduce((count, result) => count + (result.tables?.length ?? 0), 0);

    return {
        databaseCount: databaseNames.length,
        tableCount,
        tableNames,
        scannedDatabaseNames,
    };
}

export async function fetchWorkGoalSuggestions(input: { connectionId: string; workType: WorkType }): Promise<{ suggestions: string[] }> {
    return executeActionClient<{ suggestions: string[] }>('work.suggestGoals', input, { currentConnectionId: input.connectionId });
}
