export type ChatToolFailure = {
    code: 'ACCESS_DENIED' | 'SOURCE_UNAVAILABLE' | 'EVIDENCE_REQUIRED' | 'REPORT_CONFLICT' | 'INVALID_FIELDS' | 'EMPTY_RESULT' | 'TRANSIENT' | 'TOOL_FAILED';
    message: string;
    retryable: boolean;
    recovery: string;
    affectedTool: string;
};

/** Tool errors cross SDK/history boundaries as either objects or JSON strings. */
export function readChatToolFailure(error: unknown): ChatToolFailure | null {
    let value = error instanceof Error ? error.message : error;
    for (let depth = 0; depth < 3; depth++) {
        if (typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch {
                return null;
            }
        }
        if (!value || typeof value !== 'object') return null;
        const entry = value as Record<string, unknown>;
        if (
            ['ACCESS_DENIED', 'SOURCE_UNAVAILABLE', 'EVIDENCE_REQUIRED', 'REPORT_CONFLICT', 'INVALID_FIELDS', 'EMPTY_RESULT', 'TRANSIENT', 'TOOL_FAILED'].includes(
                String(entry.code),
            ) &&
            typeof entry.message === 'string' &&
            typeof entry.retryable === 'boolean' &&
            typeof entry.recovery === 'string' &&
            typeof entry.affectedTool === 'string'
        )
            return entry as ChatToolFailure;
        value = entry.message ?? entry.error;
    }
    return null;
}

/** Public diagnostics must not distinguish missing private resources from denied ones. */
export function chatToolFailure(error: unknown, toolName: string): ChatToolFailure {
    const parsed = readChatToolFailure(error);
    if (parsed) return { ...parsed, affectedTool: toolName };
    const value = error && typeof error === 'object' ? (error as { message?: string; code?: unknown; status?: number }) : {};
    const raw = value.message ?? String(error);
    const anchorConflict = /(?:edit|empty) anchor|anchor (?:not found|matches)/i.test(raw);
    const denied =
        value.code === 403 ||
        value.status === 403 ||
        /access denied|outside.*scope|another conversation|unavailable\.$|not authorized/i.test(raw) ||
        (!anchorConflict && /not found/i.test(raw));
    const code: ChatToolFailure['code'] = denied
        ? 'ACCESS_DENIED'
        : /WORK_REFERENCE_INVALID|TOOL_INPUT_INVALID|InvalidToolInput|JSONParseError|invalid input|Chart columns do not match its evidence|Repeated X values/i.test(raw)
          ? 'INVALID_FIELDS'
          : /changed|version|revision|anchor/i.test(raw)
            ? 'REPORT_CONFLICT'
            : /expired|no longer available|checksum|upload.*again|attachment unavailable/i.test(raw)
              ? 'SOURCE_UNAVAILABLE'
              : /no unique|no successful|no.*query result|evidence.*required/i.test(raw)
                ? 'EVIDENCE_REQUIRED'
                : /column|field|pie requires|numeric|positive total/i.test(raw)
                  ? 'INVALID_FIELDS'
                  : /no rows|no data to chart/i.test(raw)
                    ? 'EMPTY_RESULT'
                    : /timeout|timed out|temporar|ECONNRESET|429|503/i.test(raw)
                      ? 'TRANSIENT'
                      : 'TOOL_FAILED';
    const recovery = {
        ACCESS_DENIED: 'Ask the user to select an accessible source. Do not bypass permissions or search unrelated sources.',
        SOURCE_UNAVAILABLE:
            'If the original attachment is still accessible, inspect it and rerun the relevant queryAttachment query. Otherwise ask the user to restore the source.',
        EVIDENCE_REQUIRED: 'Select the relevant returned artifactId. Use queryAttachment for attachment data, sqlRunner only for database data. Ask if several sources match.',
        REPORT_CONFLICT: 'Read the latest report and its saved receipt before retrying. Reconcile the requested change; preserve human edits.',
        INVALID_FIELDS: /Repeated X values/i.test(raw)
            ? 'Rerun the selected source query with one row per X value and a separate column per metric. Inspect the reported varying dimensions; filter to comparable periods and pivot long-form metrics in SQL. Then call chartBuilder with the NEW artifactId. Do not repeat the failed chart on the same result or silently sum/discard rows.'
            : /WORK_REFERENCE_INVALID/.test(raw)
              ? 'Read the existing draft if a document ID was returned. Use the available evidence columns in the diagnostic to correct visual keys, or rerun the query if the required data is missing. Save the corrected report with verified artifact references.'
              : 'Read the selected evidence columns and correct the chart or query. Never invent rows or silently change the requested chart type.',
        EMPTY_RESULT: 'Explain that the selected query returned no data. Do not claim a chart was created.',
        TRANSIENT: 'Check current source or report state before retrying. Do not repeat a write whose outcome is unknown.',
        TOOL_FAILED: 'Inspect the failure. Stop this step if it cannot be repaired; preserve successful results.',
    }[code];
    return {
        code,
        message: denied ? 'The requested resource is unavailable or access is denied.' : raw,
        retryable: !['ACCESS_DENIED', 'EMPTY_RESULT', 'TOOL_FAILED'].includes(code),
        recovery,
        affectedTool: toolName,
    };
}
