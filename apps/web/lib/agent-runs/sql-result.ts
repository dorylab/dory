import type { SqlResultPart } from '@/components/@dory/ui/ai/sql-result/type';

export function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Unwrap both SDK model messages and persisted UI tool parts. */
export function toolResultValue(value: unknown): Record<string, unknown> {
    const part = record(value);
    const output = part.output ?? part.result ?? (part.type === 'data' ? part.data : part.value);
    const wrapped = record(output);
    return record(wrapped.type === 'json' ? wrapped.value : output);
}

export function isSqlToolPart(value: unknown): boolean {
    const part = record(value);
    return ['sqlRunner', 'dory_run_readonly_sql'].includes(String(part.toolName ?? String(part.type ?? '').replace(/^tool-/, ''))) || toolResultValue(part).type === 'sql-result';
}

/** Read both the chat SQL envelope and the persisted multi-connection tool output. */
export function getSqlResultFromPart(value: unknown, fallbackMessage = ''): SqlResultPart | null {
    const part = record(value);
    const candidate = toolResultValue(part);
    const name = part.toolName ?? (typeof part.type === 'string' ? part.type.replace(/^tool-/, '') : '');
    const savedQuery = ['sqlRunner', 'dory_run_readonly_sql'].includes(String(name)) && Array.isArray(candidate.result) && Array.isArray(candidate.columns);
    const failed = isSqlToolPart(part) && (candidate.ok === false || Boolean(candidate.error) || part.state === 'output-error' || Boolean(part.errorText));
    if (candidate.type !== 'sql-result' && !savedQuery && !failed) return null;
    const input = record(part.input ?? part.args);
    const error = record(candidate.error);
    const manual = record(candidate.manualExecution);
    return {
        type: 'sql-result',
        ok: failed ? false : savedQuery ? candidate.ok !== false : candidate.ok === true,
        sql: String(candidate.sql ?? input.sql ?? ''),
        database: typeof candidate.database === 'string' ? candidate.database : typeof input.database === 'string' ? input.database : null,
        manualExecution: candidate.ok === false && manual.required ? { required: true, reason: 'non-readonly-query' } : undefined,
        previewRows: (Array.isArray(candidate.previewRows) ? candidate.previewRows : savedQuery ? (candidate.result as unknown[]) : []).filter(
            (row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row),
        ),
        columns: Array.isArray(candidate.columns)
            ? candidate.columns.map(value => {
                  const column = record(value);
                  return { name: String(column.name ?? ''), type: column.type == null ? null : String(column.type) };
              })
            : [],
        rowCount: typeof candidate.rowCount === 'number' ? candidate.rowCount : undefined,
        truncated: Boolean(candidate.truncated ?? candidate.hasMore),
        durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : typeof candidate.executionTimeMs === 'number' ? candidate.executionTimeMs : undefined,
        error: candidate.ok === false && candidate.error ? { message: String(error.message ?? fallbackMessage) } : undefined,
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : undefined,
    };
}
