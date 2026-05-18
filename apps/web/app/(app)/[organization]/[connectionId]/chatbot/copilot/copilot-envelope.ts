import type { CopilotContextSQL, CopilotResultSetContext } from './types/copilot-context-sql';
import type { CopilotFixInput } from './types/copilot-fix-input';
import type { CopilotEnvelopeMeta, CopilotEnvelopeV1 } from './types/copilot-envelope';
import { inferSqlDraftContext } from './infer-sql-context';
import { ConnectionDialect } from '@dory/shared';
import { normalizeSqlDialect } from '@/lib/sql/sql-dialect';

const TRUNCATION_SUFFIX = '…(truncated)';

function cloneMeta(meta?: CopilotEnvelopeMeta): CopilotEnvelopeMeta | undefined {
    if (!meta) return undefined;
    return {
        tabId: meta.tabId,
        tabName: meta.tabName,
        connectionId: meta.connectionId,
        catalog: meta.catalog,
    };
}

function truncateText(value: string, limit: number): string {
    if (value.length <= limit) return value;
    const sliceLength = Math.max(limit - TRUNCATION_SUFFIX.length, 0);
    return `${value.slice(0, sliceLength)}${TRUNCATION_SUFFIX}`;
}

export async function createCopilotSQLContextEnvelope(params: {
    editorText: string;
    selection?: { start: number; end: number } | null;
    baselineDatabase?: string | null;
    dialect?: ConnectionDialect;
    resultSet?: CopilotResultSetContext | null;
    meta?: CopilotEnvelopeMeta;
    updatedAt?: number;
}): Promise<CopilotEnvelopeV1> {
    const dialect = params.dialect ?? 'unknown';
    const inferred = await inferSqlDraftContext({
        dialect,
        editorText: params.editorText,
        baselineDatabase: params.baselineDatabase ?? null,
    });

    const context: CopilotContextSQL = {
        baseline: {
            database: params.baselineDatabase ?? null,
            dialect,
        },
        draft: {
            editorText: params.editorText,
            selection: params.selection ?? null,
            inferred,
        },
        resultSet: params.resultSet ?? null,
    };

    return {
        version: 1,
        surface: 'sql',
        updatedAt: params.updatedAt,
        meta: cloneMeta(params.meta),
        context,
    };
}

export function createCopilotFixInputFromExecution(execution: {
    sql: string;
    error?: { message: string; code?: string | number | null } | null;
    database?: string | null;
    activeSchema?: string | null;
    dialect?: string;
    occurredAt?: number;
    meta?: CopilotEnvelopeMeta;
}): CopilotFixInput {
    const normalizedDialect = normalizeDialect(execution.dialect);

    return {
        surface: 'sql',
        meta: cloneMeta(execution.meta),
        activeSchema: execution.activeSchema ?? null,
        lastExecution: {
            occurredAt: execution.occurredAt,
            dialect: normalizedDialect,
            database: execution.database ?? null,
            sql: execution.sql,
            error: execution.error
                ? {
                      message: execution.error.message,
                      code: execution.error.code ?? null,
                  }
                : null,
        },
    };
}

function normalizeDialect(dialect?: string): ConnectionDialect {
    return normalizeSqlDialect(dialect);
}

export function toPromptContext(envelope: CopilotEnvelopeV1): Record<string, unknown> {
    if (envelope.surface === 'sql') {
        const context = envelope.context;
        const result: Record<string, unknown> = {};

        result.baseline = {
            database: context.baseline.database ?? null,
            dialect: context.baseline.dialect ?? 'unknown',
        };

        result.draft = {
            editorText: truncateText(context.draft.editorText, 4000),
            selection: context.draft.selection ?? null,
            inferred: context.draft.inferred,
        };

        if (context.resultSet) {
            const stats = context.resultSet.stats ?? null;
            result.resultSet = {
                sessionId: context.resultSet.sessionId ?? null,
                setIndex: context.resultSet.setIndex ?? null,
                title: context.resultSet.title ?? null,
                sqlText: truncateText(context.resultSet.sqlText ?? '', 4000),
                status: context.resultSet.status ?? null,
                rowCount: context.resultSet.rowCount ?? stats?.summary.rowCount ?? null,
                limited: context.resultSet.limited ?? stats?.summary.limited ?? null,
                limit: context.resultSet.limit ?? stats?.summary.limit ?? null,
                durationMs: context.resultSet.durationMs ?? null,
                columns: (context.resultSet.columns ?? []).map(column => ({
                    name: column.name,
                    type: column.type ?? column.dbType ?? null,
                    normalizedType: column.normalizedType,
                    semanticRole: column.semanticRole ?? 'unknown',
                })),
                profile: stats
                    ? {
                          summary: stats.summary,
                          sample: stats.sample,
                          columns: Object.values(stats.columns).map(profile => ({
                              name: profile.name,
                              normalizedType: profile.normalizedType,
                              semanticRole: profile.semanticRole,
                              nullCount: profile.nullCount,
                              nonNullCount: profile.nonNullCount,
                              distinctCount: profile.distinctCount ?? null,
                              distinctRatio: profile.distinctRatio ?? null,
                              entropy: profile.entropy ?? null,
                              topValueShare: profile.topValueShare ?? null,
                              informationDensity: profile.informationDensity ?? 'none',
                              sampleValues: profile.sampleValues,
                              topK: profile.topK ?? [],
                              min: profile.min ?? null,
                              max: profile.max ?? null,
                              avg: profile.avg ?? null,
                              p50: profile.p50 ?? null,
                              p95: profile.p95 ?? null,
                              minTime: profile.minTime ?? null,
                              maxTime: profile.maxTime ?? null,
                              inferredTimeGrain: profile.inferredTimeGrain ?? null,
                          })),
                      }
                    : null,
            };
        }

        return result;
    }

    const context = envelope.context;
    const result: Record<string, unknown> = {};

    if (context.database !== undefined) {
        result.database = context.database;
    }

    result.table = {
        schema: context.table.schema,
        name: context.table.name,
        selectedColumn: context.table.selectedColumn ?? null,
        rowCount: context.table.rowCount ?? null,
        engine: context.table.engine ?? null,
        partitionKey: context.table.partitionKey ?? null,
        primaryKey: context.table.primaryKey ?? null,
    };

    return result;
}
