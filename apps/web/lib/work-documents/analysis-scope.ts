import type { AnalysisScope } from '@dory/shared/types/work-document';
import { getAnalysisDatabases } from '@dory/shared/utils/analysis-scope';

/** Apply the user's database context before schema/query tools reach a driver. */
export function applyAnalysisDatabase(scope: AnalysisScope | undefined, toolName: string, input: Record<string, unknown>): Record<string, unknown> {
    if (!scope || !['dory_run_readonly_sql', 'dory_explore_schema', 'dory_get_schema_graph'].includes(toolName)) return input;
    const connectionId = typeof input.connectionId === 'string' ? input.connectionId : '';
    const databases = getAnalysisDatabases(scope, connectionId);
    if (databases && input.database != null && (typeof input.database !== 'string' || !databases.includes(input.database))) {
        throw new Error(`Database does not match the selected databases for ${connectionId}. Use ${databases.join(', ')} or ask the user to change the selection.`);
    }
    if (databases?.length === 1) return { ...input, database: databases[0] };
    // Search without a database would otherwise inspect every database on the connection.
    const needsDatabase = toolName !== 'dory_explore_schema' || input.operation !== 'list_databases';
    const automaticSearch = !databases && toolName === 'dory_explore_schema' && input.operation === 'search';
    if (databases?.length === 0 || (needsDatabase && !automaticSearch && (typeof input.database !== 'string' || !input.database.trim()))) {
        throw new Error('Choose an explicit database from the selected databases, list_databases or the connection default before querying.');
    }
    return input;
}
