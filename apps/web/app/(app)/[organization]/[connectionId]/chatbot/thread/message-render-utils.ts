import type { UIMessage } from 'ai';

import type { ChartResultPart } from '@/components/@dory/ui/ai/charts-result';
import type { SqlResultPart } from '@/components/@dory/ui/ai/sql-result/type';

export type ChatbotTranslate = (key: string, values?: Record<string, string>) => string;

type SqlStepKey =
    | 'RunSql'
    | 'InspectSchema'
    | 'ListTables'
    | 'ValidateTimestampParsing'
    | 'CheckTimeRange'
    | 'ReviewRecentRows'
    | 'FilterErrorLogs'
    | 'CountRows'
    | 'QueryData'
    | 'InsertData'
    | 'UpdateData'
    | 'DeleteData'
    | 'CreateObject'
    | 'DropObject';

export function getSqlResultFromPart(part: any, fallbackMessage?: string): SqlResultPart | null {
    if (!part || typeof part !== 'object') return null;

    const candidate = (() => {
        if (part?.type === 'tool-result' && part.result) return part.result;
        if (part?.type === 'tool_result' && part.result) return part.result;
        if (part?.type === 'data' && part.data) return part.data;
        if (part?.type === 'tool-call-output' && part.output) return part.output;
        if (part?.type === 'tool-sqlRunner' && part.output) return part.output;
        if (typeof part?.type === 'string' && part.type.startsWith('tool-') && part.output) return part.output;
        return null;
    })();

    if (!candidate || typeof candidate !== 'object') return null;
    if (candidate.type !== 'sql-result') return null;

    return {
        type: 'sql-result',
        ok: Boolean(candidate.ok),
        sql: String(candidate.sql ?? ''),
        database: candidate.database ?? null,
        manualExecution:
            candidate.ok === false && candidate.manualExecution?.required
                ? {
                      required: true,
                      reason: 'non-readonly-query' as const,
                  }
                : undefined,
        previewRows: Array.isArray(candidate.previewRows) ? candidate.previewRows : [],
        columns: Array.isArray(candidate.columns)
            ? candidate.columns.map((col: any) => ({
                  name: String(col?.name ?? ''),
                  type: col?.type != null ? String(col.type) : null,
              }))
            : [],
        rowCount: typeof candidate.rowCount === 'number' ? candidate.rowCount : undefined,
        truncated: Boolean(candidate.truncated),
        durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : undefined,
        error:
            candidate.ok === false && candidate.error
                ? {
                      message: String(candidate.error?.message ?? fallbackMessage ?? ''),
                  }
                : undefined,
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : undefined,
    };
}

export function getChartResultFromPart(part: any): ChartResultPart | null {
    if (!part || typeof part !== 'object') return null;

    const candidate = (() => {
        if (part?.type === 'tool-result' && part.result) return part.result;
        if (part?.type === 'tool_result' && part.result) return part.result;
        if (part?.type === 'data' && part.data) return part.data;
        if (part?.type === 'tool-call-output' && part.output) return part.output;
        if (part?.type === 'tool-chartBuilder' && part.output) return part.output;
        if (typeof part?.type === 'string' && part.type.startsWith('tool-') && part.output) return part.output;
        return null;
    })();

    if (!candidate || typeof candidate !== 'object') return null;
    if (candidate.type !== 'chart') return null;

    return {
        type: 'chart',
        chartType: candidate.chartType,
        title: candidate.title ?? undefined,
        description: candidate.description ?? undefined,
        data: Array.isArray(candidate.data) ? (candidate.data as Array<Record<string, unknown>>) : [],
        xKey: candidate.xKey ?? undefined,
        yKeys: Array.isArray(candidate.yKeys)
            ? (candidate.yKeys as any[])
                  .filter(item => item && typeof item === 'object' && typeof item.key === 'string')
                  .map(item => ({
                      key: item.key,
                      label: item.label ?? undefined,
                      color: item.color ?? undefined,
                  }))
            : undefined,
        categoryKey: candidate.categoryKey ?? undefined,
        valueKey: candidate.valueKey ?? undefined,
        options: candidate.options ?? undefined,
    };
}

export function didUserRequestChart(messages: UIMessage[], messageIndex: number): boolean {
    const previousUserMessage =
        messages
            .slice(0, messageIndex)
            .reverse()
            .find(msg => msg.role === 'user') ?? null;

    return !!previousUserMessage?.parts?.some((part: any) => part?.type === 'text' && /visualization|chart/i.test(part?.text ?? ''));
}

export function removeUnavailableImageMarkdown(text: string) {
    return text
        .replace(/!\[[^\]]*]\([^)]*\)/g, '')
        .replace(/!\[\s*Image not available\s*\]\([^)]*\)/gi, '')
        .replace(/^\s*Image not available\s*$/gim, '')
        .trim();
}

const SQL_TEXT_START_RE = /^(select|with|insert|update|delete|create|alter|drop|truncate|merge|explain|describe|show|pragma)\b/i;

export function extractStandaloneSqlText(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const fencedMatch = trimmed.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
    const candidate = (fencedMatch?.[1] ?? trimmed).trim();
    if (!SQL_TEXT_START_RE.test(candidate)) return null;

    const statements = candidate
        .split(';')
        .map(statement => statement.trim())
        .filter(Boolean);

    if (statements.length > 1 && statements.some(statement => !SQL_TEXT_START_RE.test(statement) && !statement.startsWith('--') && !statement.startsWith('/*'))) {
        return null;
    }

    return candidate;
}

export function formatToolName(toolName: string | null | undefined, t: ChatbotTranslate): string {
    const fallback = t('Tools.Names.Tool');
    if (!toolName) return fallback;

    if (toolName === 'sqlRunner') return t('Tools.Names.SqlRunner');
    if (toolName === 'chartBuilder') return t('Tools.Names.ChartBuilder');

    const normalized = toolName
        .replace(/^tool[-_]/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .trim();

    if (!normalized) return fallback;

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function summarizeSqlStep(sql: string): SqlStepKey {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (!normalized) return 'RunSql';
    if (normalized.includes('pragma table_info') || normalized.includes('information_schema.columns') || normalized.startsWith('describe ')) return 'InspectSchema';
    if (normalized.includes('from sqlite_master')) return 'ListTables';
    if (normalized.includes('datetime(') && normalized.includes('timestamp')) return 'ValidateTimestampParsing';
    if ((normalized.includes('max(timestamp)') || normalized.includes('min(timestamp)')) && normalized.includes('from')) return 'CheckTimeRange';
    if (normalized.includes('order by timestamp desc')) return 'ReviewRecentRows';
    if (/where\s+.*level\s*=\s*['"]?error['"]?/i.test(normalized)) return 'FilterErrorLogs';
    if (normalized.includes('count(*)')) return 'CountRows';
    if (normalized.startsWith('select')) return 'QueryData';
    if (normalized.startsWith('insert')) return 'InsertData';
    if (normalized.startsWith('update')) return 'UpdateData';
    if (normalized.startsWith('delete')) return 'DeleteData';
    if (normalized.startsWith('create')) return 'CreateObject';
    if (normalized.startsWith('drop')) return 'DropObject';
    return 'RunSql';
}

export function getSqlStepLabel(stepKey: SqlStepKey, t: ChatbotTranslate): string {
    return t(`Tools.Steps.${stepKey}`);
}

export function formatToolValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    return JSON.stringify(value);
}

export function getObjectKeys(rows: Array<Record<string, unknown>>, maxColumns = 6) {
    const keys = new Set<string>();
    rows.forEach(row => {
        Object.keys(row).forEach(key => keys.add(key));
    });
    return Array.from(keys).slice(0, maxColumns);
}
