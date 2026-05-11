import type { ResultContext, ResultContextColumnInput, ResultContextStatsInput, TableRef } from './types';
import { toResultContextColumns } from './types';

export function extractTableRefs(sqlText?: string | null, databaseName?: string | null): TableRef[] {
    const sql = sqlText?.trim();
    if (!sql) return [];

    const matches = [...sql.matchAll(/\b(?:from|join)\s+([a-zA-Z0-9_."]+)/gi)];
    const refs = matches
        .map(match => match[1]?.replace(/"/g, '').trim())
        .filter(Boolean)
        .map(raw => {
            const parts = raw!.split('.');
            if (parts.length >= 2) {
                return {
                    database: parts.slice(0, -1).join('.'),
                    table: parts[parts.length - 1]!,
                    confidence: 'medium' as const,
                };
            }

            return {
                database: databaseName ?? undefined,
                table: raw!,
                confidence: 'medium' as const,
            };
        });

    return refs.filter((ref, index) => refs.findIndex(candidate => candidate.database === ref.database && candidate.table === ref.table) === index);
}

export function buildResultContext(params: {
    sessionId: string;
    setIndex: number;
    sqlText?: string | null;
    databaseName?: string | null;
    rowCount?: number | null;
    columns?: ResultContextColumnInput[] | null;
    stats?: ResultContextStatsInput;
}): ResultContext {
    return {
        resultSetId: {
            sessionId: params.sessionId,
            setIndex: params.setIndex,
        },
        sqlText: params.sqlText ?? undefined,
        databaseName: params.databaseName ?? null,
        tableRefs: extractTableRefs(params.sqlText, params.databaseName),
        rowCount: params.rowCount ?? 0,
        columns: toResultContextColumns(params.columns, params.stats),
    };
}
