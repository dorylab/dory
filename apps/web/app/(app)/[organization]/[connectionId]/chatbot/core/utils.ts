// chat/core/utils.ts
import { ChartResultPart } from "@/components/@dory/ui/ai/charts-result";
import type { UIMessage } from 'ai';
import { DEFAULT_TITLE, type ChatSessionItem } from './types';
import { SqlResultPart } from "@/components/@dory/ui/ai/sql-result/type";

export function getSqlResultFromPart(part: any): SqlResultPart | null {
    if (!part || typeof part !== 'object') return null;

    const candidate = (() => {
        if (part?.type === 'tool-result' && part.result) return part.result;
        if (part?.type === 'data' && part.data) return part.data;
        if (part?.type === 'tool-call-output' && part.output) return part.output;
        
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
                    message: String(candidate.error?.message ?? 'SQL execution failed'),
                }
                : undefined,
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : undefined,
    };
}

export function getChartResultFromPart(part: any): ChartResultPart | null {
    if (!part || typeof part !== 'object') return null;

    const candidate = (() => {
        if (part?.type === 'tool-result' && part.result) return part.result;
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

export const normalizeSessionTitle = (title?: string | null, fallback?: string) => {
    const t = title?.trim();
    return t && t.length > 0 ? t : (fallback ?? DEFAULT_TITLE);
};

export const toUIMessage = (message: {
    id: string;
    role: string;
    parts: unknown;
    metadata?: Record<string, unknown> | null;
}): UIMessage => {
    const parts =
        Array.isArray(message.parts)
            ? message.parts
            : typeof message.parts === 'string'
                ? [{ type: 'text', text: message.parts }]
                : [];

    return {
        id: message.id,
        role: message.role as UIMessage['role'],
        parts: parts as UIMessage['parts'],
        ...(message.metadata ? { metadata: message.metadata } : {}),
    };
};

export const normalizeSessionsForDisplay = (sessions: ChatSessionItem[], fallback?: string) =>
    sessions.map(s => ({ ...s, title: normalizeSessionTitle(s.title, fallback) }));
