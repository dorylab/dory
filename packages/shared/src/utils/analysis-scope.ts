import type { AnalysisScope } from '../types/work-document';

/** Undefined means automatic database selection; an empty list never means unrestricted. */
export function getAnalysisDatabases(scope: AnalysisScope | undefined, connectionId: string): string[] | undefined {
    const selections = scope?.databasesByConnection;
    if (!selections || !Object.hasOwn(selections, connectionId)) return undefined;
    const value = selections[connectionId];
    return typeof value === 'string' ? [value] : value;
}

export function isAnalysisDatabaseAllowed(scope: AnalysisScope | undefined, connectionId: string, database: string | null | undefined): boolean {
    const databases = getAnalysisDatabases(scope, connectionId);
    return databases === undefined || (typeof database === 'string' && databases.includes(database));
}
