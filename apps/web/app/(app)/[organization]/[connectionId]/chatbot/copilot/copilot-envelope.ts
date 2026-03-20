import type { CopilotContextSQL } from './types/copilot-context-types';
import type { CopilotFixInput } from './types/copilot-fix-input';
import type { CopilotEnvelopeMeta, CopilotEnvelopeV1 } from './types/copilot-envelope';
import { inferSqlDraftContext } from './infer-sql-context';
import { ConnectionDialect } from '@/types';
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
    meta?: CopilotEnvelopeMeta;
    updatedAt?: number;
}): Promise<CopilotEnvelopeV1> {
    const dialect = params.dialect ?? 'unknown';
    const inferred = await inferSqlDraftContext({
        dialect,
        editorText: params.editorText,
        baselineDatabase: params.baselineDatabase ?? null,
    });

    console.log('Inferred SQL context:', inferred); 

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
    dialect?: string;
    occurredAt?: number;
    meta?: CopilotEnvelopeMeta;
}): CopilotFixInput {
    const normalizedDialect = normalizeDialect(execution.dialect);

    return {
        surface: 'sql',
        meta: cloneMeta(execution.meta),
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
