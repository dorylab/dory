import type { AnalysisScope } from '@dory/shared/types/work-document';

/** Apply the user's database context before schema/query tools reach a driver. */
export function applyAnalysisDatabase(scope: AnalysisScope | undefined, toolName: string, input: Record<string, unknown>): Record<string, unknown> {
    if (!scope || !['dory_run_readonly_sql', 'dory_explore_schema', 'dory_get_schema_graph'].includes(toolName)) return input;
    const connectionId = typeof input.connectionId === 'string' ? input.connectionId : '';
    const database = scope.databasesByConnection?.[connectionId];
    if (!database || !Object.hasOwn(scope.databasesByConnection ?? {}, connectionId)) return input;
    if (input.database != null && input.database !== database) {
        throw new Error(`Database does not match the selected database for ${connectionId}. Use ${database} or ask the user to change the selection.`);
    }
    return { ...input, database };
}
