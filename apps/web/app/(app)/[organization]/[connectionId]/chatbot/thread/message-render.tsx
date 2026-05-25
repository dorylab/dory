'use client';

import { ReactNode } from 'react';
import type { UIMessage } from 'ai';

import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool';
import { ChartResultPart, ChartResultCard } from '@/components/@dory/ui/ai/charts-result';
import { SqlResultBody, SqlStatementBlock } from '@/components/@dory/ui/ai/sql-result';
import { AssistantFallbackCard } from '@/components/@dory/ui/ai/assistant-fallback';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenuItem } from '@/registry/new-york-v4/ui/dropdown-menu';
import { buildAutoChartFromSql } from '@/components/@dory/ui/ai/utils/auto-charts';
import { useTranslations } from 'next-intl';

import type { CopilotActionExecutor } from '../copilot/action-bridge';
import { SqlResultPart, SqlResultManualExecutionMode } from '@/components/@dory/ui/ai/sql-result/type';
import { ChatMode } from '../core/types';

type MessageRendererProps = {
    message: UIMessage;
    messageIndex: number;
    messages: UIMessage[];
    status: string;

    onCopySql: (sql: string) => Promise<void> | void;
    onManualExecute: (payload: { sql: string; database: string | null; mode?: SqlResultManualExecutionMode }) => void;

    mode?: ChatMode;
    onExecuteAction?: CopilotActionExecutor;
};

type ChatbotTranslate = (key: string, values?: Record<string, string>) => string;
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

function didUserRequestChart(messages: UIMessage[], messageIndex: number): boolean {
    const previousUserMessage =
        messages
            .slice(0, messageIndex)
            .reverse()
            .find(msg => msg.role === 'user') ?? null;

    return !!previousUserMessage?.parts?.some((part: any) => part?.type === 'text' && /visualization|chart/i.test(part?.text ?? ''));
}

function removeUnavailableImageMarkdown(text: string) {
    return text
        .replace(/!\[[^\]]*]\([^)]*\)/g, '')
        .replace(/!\[\s*Image not available\s*\]\([^)]*\)/gi, '')
        .replace(/^\s*Image not available\s*$/gim, '')
        .trim();
}

const SQL_TEXT_START_RE = /^(select|with|insert|update|delete|create|alter|drop|truncate|merge|explain|describe|show|pragma)\b/i;

function extractStandaloneSqlText(text: string): string | null {
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

function formatToolName(toolName: string | null | undefined, t: ChatbotTranslate): string {
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

function summarizeSqlStep(sql: string): SqlStepKey {
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

function getSqlStepLabel(stepKey: SqlStepKey, t: ChatbotTranslate): string {
    return t(`Tools.Steps.${stepKey}`);
}

function formatToolValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    return JSON.stringify(value);
}

function getObjectKeys(rows: Array<Record<string, unknown>>, maxColumns = 6) {
    const keys = new Set<string>();
    rows.forEach(row => {
        Object.keys(row).forEach(key => keys.add(key));
    });
    return Array.from(keys).slice(0, maxColumns);
}

const MessageRenderer = ({ message, messageIndex, messages, status, onCopySql, onManualExecute, mode = 'global', onExecuteAction }: MessageRendererProps) => {
    const t = useTranslations('Chatbot');
    const assistantMessage = message.role === 'assistant';
    const isLatestAssistant = assistantMessage && messageIndex === messages.length - 1;
    const isStreaming = status !== 'ready';
    const showCopilotSqlActions = mode === 'copilot' && typeof onExecuteAction === 'function';
    const sourceParts = assistantMessage ? (message.parts ?? []).filter((part: any) => part?.type === 'source-url') : [];
    const sqlResults: SqlResultPart[] = [];
    const chartResults: ChartResultPart[] = [];
    const renderedLegacyResultIds = new Set<string>();
    let didRenderSources = false;

    const getToolCallId = (part: any) => {
        if (!part || typeof part !== 'object') return null;
        if (typeof part.toolCallId === 'string') return part.toolCallId;
        if (typeof part.callId === 'string') return part.callId;
        return null;
    };
    const isLegacyToolCallPart = (part: any) => part?.type === 'tool-call' || part?.type === 'tool_call';
    const isLegacyToolResultPart = (part: any) => part?.type === 'tool-result' || part?.type === 'tool_result' || part?.type === 'tool-error';
    const isTypedToolPart = (part: any) => typeof part?.type === 'string' && part.type.startsWith('tool-') && !isLegacyToolCallPart(part) && !isLegacyToolResultPart(part);
    const isFinalToolState = (part: any) => part?.state === 'output-available' || part?.state === 'output-error' || part?.state === 'output-denied' || Boolean(part?.output);
    const getToolOutput = (part: any) => part?.output ?? part?.result ?? part?.data ?? null;
    const getToolErrorText = (part: any) =>
        part?.errorText ?? part?.error?.message ?? (part?.type === 'tool-error' && typeof part?.message === 'string' ? part.message : undefined);
    const getToolName = (part: any) => {
        if (typeof part?.toolName === 'string') return part.toolName;
        if (typeof part?.type === 'string' && part.type.startsWith('tool-')) {
            return part.type.replace(/^tool-/, '');
        }

        const result = getToolOutput(part);
        if (result?.type === 'sql-result') return 'sqlRunner';
        if (result?.type === 'chart') return 'chartBuilder';
        return null;
    };
    const getToolStepSummary = (part: any) => {
        const toolName = getToolName(part);
        const input = part?.input ?? getToolOutput(part);

        if (toolName === 'sqlRunner') {
            const sql = typeof part?.input?.sql === 'string' ? part.input.sql : typeof input?.sql === 'string' ? input.sql : '';
            return getSqlStepLabel(summarizeSqlStep(sql), t);
        }

        if (toolName === 'chartBuilder') {
            const chartType = typeof part?.input?.chartType === 'string' ? part.input.chartType : typeof input?.chartType === 'string' ? input.chartType : null;
            return chartType ? t('Tools.Steps.BuildChartWithType', { chartType }) : t('Tools.Steps.BuildChart');
        }

        return toolName ? formatToolName(toolName, t) : t('Tools.Steps.RunTool');
    };
    const getToolDisplayTitle = (part: any) => {
        const summary = getToolStepSummary(part);
        const toolName = getToolName(part);
        if (toolName === 'sqlRunner' || toolName === 'chartBuilder') return summary;

        const toolLabel = formatToolName(toolName, t);
        return summary === toolLabel ? summary : `${summary} · ${toolLabel}`;
    };
    const inferToolArgsFromResult = (part: any) => {
        const result = getToolOutput(part);
        if (result?.type === 'sql-result' && typeof result.sql === 'string') {
            return { sql: result.sql };
        }
        if (result?.type === 'chart') {
            const rawData = Array.isArray(result.data) ? result.data : [];
            const maxPreview = 20;
            const dataPreview = rawData.slice(0, maxPreview);
            return {
                chartType: result.chartType,
                xKey: result.xKey,
                yKeys: result.yKeys,
                categoryKey: result.categoryKey,
                valueKey: result.valueKey,
                data: rawData.length <= maxPreview ? rawData : dataPreview,
                dataCount: rawData.length,
            };
        }
        return { toolCallId: getToolCallId(part) };
    };
    const getToolState = (part: any): any => {
        if (part?.state) return part.state;
        if (part?.type === 'tool-error') return 'output-error';
        if (isLegacyToolResultPart(part) || part?.output) return 'output-available';
        return 'input-available';
    };
    const mergeLegacyToolResult = (callPart: any, resultPart: any | null) => {
        if (!resultPart) return callPart;

        return {
            ...callPart,
            state: resultPart.type === 'tool-error' ? 'output-error' : 'output-available',
            output: getToolOutput(resultPart),
            errorText: getToolErrorText(resultPart),
        };
    };
    const renderMetaItems = (items: Array<[string, unknown]>) => {
        const visibleItems = items.filter(([, value]) => value !== undefined && value !== null && value !== '');
        if (visibleItems.length === 0) return null;

        return (
            <div className="flex flex-wrap gap-1.5">
                {visibleItems.map(([label, value]) => (
                    <span key={label} className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/20 px-2 py-1 text-[12px] text-muted-foreground">
                        <span>{label}</span>
                        <span className="font-medium text-foreground/80">{formatToolValue(value)}</span>
                    </span>
                ))}
            </div>
        );
    };
    const renderCompactRows = (rows: Array<Record<string, unknown>>, columns?: string[]) => {
        if (rows.length === 0) return <p className="text-sm text-muted-foreground">No rows returned.</p>;

        const displayRows = rows.slice(0, 5);
        const displayColumns = (columns?.length ? columns : getObjectKeys(displayRows)).slice(0, 6);

        return (
            <div className="overflow-hidden rounded-lg border border-border/45 bg-background/70">
                <table className="w-full min-w-max text-sm">
                    <thead>
                        <tr>
                            {displayColumns.map(column => (
                                <th key={column} className="h-9 border-b border-border/45 bg-background px-3 text-left text-[12px] font-medium text-muted-foreground">
                                    {column}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="even:bg-muted/[0.16]">
                                {displayColumns.map(column => (
                                    <td key={column} className="h-9 border-b border-border/35 px-3 align-middle text-[12px] text-foreground/80 last:border-b-0">
                                        {formatToolValue(row[column])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length > displayRows.length ? (
                    <div className="border-t border-border/35 px-3 py-2 text-[11px] text-muted-foreground">
                        Showing {displayRows.length} of {rows.length} rows.
                    </div>
                ) : null}
            </div>
        );
    };
    const renderColumnsSummary = (columns: any[]) => (
        <div className="overflow-hidden rounded-lg border border-border/45 bg-background/70">
            <table className="w-full min-w-max text-sm">
                <thead>
                    <tr>
                        <th className="h-9 border-b border-border/45 bg-background px-3 text-left text-[12px] font-medium text-muted-foreground">Column</th>
                        <th className="h-9 border-b border-border/45 bg-background px-3 text-left text-[12px] font-medium text-muted-foreground">Type</th>
                        <th className="h-9 border-b border-border/45 bg-background px-3 text-left text-[12px] font-medium text-muted-foreground">Key</th>
                    </tr>
                </thead>
                <tbody>
                    {columns.slice(0, 12).map((column, index) => (
                        <tr key={`${column?.columnName ?? column?.name ?? index}`} className="even:bg-muted/[0.16]">
                            <td className="h-9 border-b border-border/35 px-3 align-middle text-[12px] font-medium text-foreground/85">
                                {formatToolValue(column?.columnName ?? column?.name)}
                            </td>
                            <td className="h-9 border-b border-border/35 px-3 align-middle text-[12px] text-muted-foreground">
                                {formatToolValue(column?.columnType ?? column?.type)}
                            </td>
                            <td className="h-9 border-b border-border/35 px-3 align-middle text-[12px] text-muted-foreground">{column?.isPrimaryKey ? 'Primary' : '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {columns.length > 12 ? <div className="border-t border-border/35 px-3 py-2 text-[11px] text-muted-foreground">Showing 12 of {columns.length} columns.</div> : null}
        </div>
    );
    const renderDoryToolContent = (part: any, state: string, input: any, output: any, errorText?: string) => {
        const toolName = getToolName(part);

        if (state === 'input-streaming' || state === 'input-available') {
            return (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Running this tool.</p>
                    {renderMetaItems([
                        ['Database', input?.database],
                        ['Table', input?.table],
                        ['Limit', input?.limit],
                        ['Query', input?.query],
                    ])}
                </div>
            );
        }

        if (state === 'output-error') {
            return <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">{errorText || 'Tool failed.'}</div>;
        }

        const result = output && typeof output === 'object' ? output : {};
        const ok = (result as any).ok !== false;
        const toolOutput = (result as any).ok === true ? result : output;

        if (!ok) {
            return (
                <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">
                    {formatToolValue((result as any).error?.message ?? errorText ?? 'Tool failed.')}
                </div>
            );
        }

        if (toolName === 'chartBuilder') {
            const chart = (toolOutput as any)?.type === 'chart' ? (toolOutput as any) : (result as any);
            const rows = Array.isArray(chart?.data) ? chart.data : [];
            const yKeys = Array.isArray(chart?.yKeys) ? chart.yKeys.map((item: any) => item?.label ?? item?.key).filter(Boolean) : [];
            const valueFields = chart?.valueKey ?? (yKeys.length > 0 ? yKeys.join(', ') : undefined);

            return (
                <div className="space-y-2.5">
                    {chart?.title ? <p className="text-sm font-medium text-foreground/85">{formatToolValue(chart.title)}</p> : null}
                    {renderMetaItems([
                        ['Chart', chart?.chartType ?? input?.chartType],
                        ['Rows', rows.length || input?.dataCount],
                        ['Category', chart?.categoryKey],
                        ['X', chart?.categoryKey ? undefined : chart?.xKey],
                        ['Value', valueFields],
                    ])}
                </div>
            );
        }

        if (toolName === 'describeTable') {
            const columns = Array.isArray((toolOutput as any)?.columns) ? (toolOutput as any).columns : [];
            return (
                <div className="space-y-2.5">
                    {renderMetaItems([
                        ['Database', input?.database],
                        ['Table', input?.table],
                        ['Columns', columns.length],
                    ])}
                    {columns.length > 0 ? renderColumnsSummary(columns) : <p className="text-sm text-muted-foreground">No columns returned.</p>}
                </div>
            );
        }

        if (toolName === 'previewTable') {
            const resultSets = Array.isArray((toolOutput as any)?.queryResultSets) ? (toolOutput as any).queryResultSets : [];
            const firstSet = resultSets[0] ?? {};
            const rows = Array.isArray((toolOutput as any)?.results?.[0]) ? (toolOutput as any).results[0] : [];
            const columnNames = Array.isArray(firstSet?.columns) ? firstSet.columns.map((column: any) => column?.name ?? column?.columnName).filter(Boolean) : undefined;

            return (
                <div className="space-y-2.5">
                    {renderMetaItems([
                        ['Database', input?.database ?? (toolOutput as any)?.session?.database],
                        ['Table', input?.table],
                        ['Rows', rows.length],
                        ['Limit', firstSet?.limit ?? input?.limit],
                    ])}
                    {renderCompactRows(rows, columnNames)}
                </div>
            );
        }

        if (toolName === 'listTables') {
            const tables = Array.isArray((toolOutput as any)?.tables) ? (toolOutput as any).tables : [];
            return (
                <div className="space-y-2.5">
                    {renderMetaItems([
                        ['Database', input?.database],
                        ['Tables', tables.length],
                    ])}
                    <div className="flex flex-wrap gap-1.5">
                        {tables.slice(0, 24).map((table: any, index: number) => (
                            <span
                                key={`${table?.name ?? table?.value ?? index}`}
                                className="rounded-md border border-border/50 bg-muted/20 px-2 py-1 text-[12px] text-foreground/80"
                            >
                                {formatToolValue(table?.name ?? table?.label ?? table?.value ?? table)}
                            </span>
                        ))}
                    </div>
                </div>
            );
        }

        if (toolName === 'listConnections') {
            const connections = Array.isArray((toolOutput as any)?.connections) ? (toolOutput as any).connections : [];
            return (
                <div className="space-y-2.5">
                    {renderMetaItems([['Connections', connections.length]])}
                    {renderCompactRows(
                        connections.map((connection: any) => ({
                            name: connection.name,
                            type: connection.type ?? connection.engine,
                            database: connection.database,
                            status: connection.status ?? connection.lastCheckStatus,
                        })),
                        ['name', 'type', 'database', 'status'],
                    )}
                </div>
            );
        }

        if (toolName === 'searchSchema') {
            const results = Array.isArray((toolOutput as any)?.results) ? (toolOutput as any).results : [];
            return (
                <div className="space-y-2.5">
                    {renderMetaItems([
                        ['Query', input?.query],
                        ['Matches', results.length],
                    ])}
                    {renderCompactRows(
                        results.map((item: any) => ({
                            kind: item.kind,
                            database: item.database,
                            table: item.table ?? item.name,
                            column: item.kind === 'column' ? item.name : null,
                            type: item.type ?? null,
                        })),
                        ['kind', 'database', 'table', 'column', 'type'],
                    )}
                </div>
            );
        }

        if (toolName === 'listSavedQueries') {
            const savedQueries = Array.isArray((toolOutput as any)?.savedQueries) ? (toolOutput as any).savedQueries : [];
            return savedQueries.length > 0 ? (
                renderCompactRows(
                    savedQueries.map((query: any) => ({
                        title: query.title,
                        folder: query.folderId,
                        updated: query.updatedAt,
                    })),
                    ['title', 'folder', 'updated'],
                )
            ) : (
                <p className="text-sm text-muted-foreground">No saved queries returned.</p>
            );
        }

        return (
            <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Tool completed.</p>
                {renderMetaItems([
                    ['Database', input?.database],
                    ['Table', input?.table],
                    ['Limit', input?.limit],
                ])}
            </div>
        );
    };

    const legacyResultById = new Map<string, any>();
    const typedToolPreferredIndexById = new Map<string, number>();
    (message.parts ?? []).forEach((part: any, index: number) => {
        const id = getToolCallId(part);
        if (!id) return;

        if (isLegacyToolResultPart(part) && !legacyResultById.has(id)) {
            legacyResultById.set(id, part);
        }

        if (isTypedToolPart(part)) {
            const preferredIndex = typedToolPreferredIndexById.get(id);
            if (preferredIndex === undefined || isFinalToolState(part)) {
                typedToolPreferredIndexById.set(id, index);
            }
        }
    });

    const renderTextPart = (text: string, key: string) => {
        const displayText = assistantMessage ? removeUnavailableImageMarkdown(text) : text;
        if (!displayText.trim()) return null;

        if (message.role === 'user') {
            return (
                <div key={key} className="max-w-full whitespace-pre-wrap break-words leading-7 text-foreground [overflow-wrap:anywhere]">
                    {displayText}
                </div>
            );
        }

        const standaloneSql = extractStandaloneSqlText(displayText);
        if (standaloneSql) {
            return (
                <div key={key} className="py-1.5">
                    <SqlStatementBlock sql={standaloneSql} onCopy={onCopySql} />
                </div>
            );
        }

        return <MessageResponse key={key}>{displayText}</MessageResponse>;
    };
    const renderSources = (key: string) => {
        if (sourceParts.length === 0 || didRenderSources) return null;
        didRenderSources = true;

        return (
            <Sources key={key}>
                <SourcesTrigger count={sourceParts.length} />
                {sourceParts.map((part: any, i: number) => (
                    <SourcesContent key={`${message.id}-source-${i}`}>
                        <Source href={part.url} title={part.title ?? part.url} />
                    </SourcesContent>
                ))}
            </Sources>
        );
    };
    const renderSqlResultBody = (sqlResult: SqlResultPart, key: string) => (
        <SqlResultBody
            key={key}
            result={sqlResult}
            onManualExecute={onManualExecute}
            mode={mode}
            manualPrimaryAction={
                showCopilotSqlActions && sqlResult.manualExecution?.required && sqlResult.sql?.trim() ? (
                    <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-full px-4 text-sm font-medium"
                        onClick={() => onExecuteAction?.({ type: 'sql.replace', sql: sqlResult.sql })}
                    >
                        {t('Tools.ReplaceSql')}
                    </Button>
                ) : undefined
            }
            manualMenuActions={
                showCopilotSqlActions && sqlResult.manualExecution?.required && sqlResult.sql?.trim() ? (
                    <DropdownMenuItem onClick={() => onExecuteAction?.({ type: 'sql.newTab', sql: sqlResult.sql })}>{t('Tools.NewTab')}</DropdownMenuItem>
                ) : undefined
            }
            footerActions={
                showCopilotSqlActions && !sqlResult.manualExecution?.required && sqlResult.sql?.trim() ? (
                    <>
                        <Button size="sm" className="h-9 rounded-full px-4 text-sm font-medium" onClick={() => onExecuteAction?.({ type: 'sql.replace', sql: sqlResult.sql })}>
                            {t('Tools.ReplaceSql')}
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-9 rounded-full border-0 px-4 text-sm font-medium"
                            onClick={() => onExecuteAction?.({ type: 'sql.newTab', sql: sqlResult.sql })}
                        >
                            {t('Tools.NewTab')}
                        </Button>
                    </>
                ) : null
            }
            embedded
        />
    );
    const renderToolStateCard = ({
        part,
        key,
        fallbackInput,
        inputContent,
        resultContent,
    }: {
        part: any;
        key: string;
        fallbackInput?: unknown;
        inputContent?: ReactNode;
        resultContent?: ReactNode;
    }) => {
        const state = getToolState(part);
        const input = part?.input ?? fallbackInput;
        const output = getToolOutput(part);
        const errorText = getToolErrorText(part);

        return (
            <Tool key={`${key}-${state}`} defaultOpen={false} className="mb-0 border-border/60 shadow-none">
                <ToolHeader type="dynamic-tool" state={state} toolName={getToolDisplayTitle(part)} title={getToolDisplayTitle(part)} />
                <ToolContent>
                    {resultContent ? (
                        <div className="space-y-3 pt-3">
                            {inputContent}
                            {resultContent}
                        </div>
                    ) : (
                        <div className="pt-3">{renderDoryToolContent(part, state, input, output, errorText)}</div>
                    )}
                </ToolContent>
            </Tool>
        );
    };
    const renderToolPart = (part: any, index: number) => {
        const key = `${message.id}-tool-${getToolCallId(part) ?? index}`;
        const toolName = getToolName(part);
        const sqlResult = getSqlResultFromPart(part, t('Errors.SqlExecutionFailed'));

        if (sqlResult) {
            sqlResults.push(sqlResult);
            return (
                <div key={key} className="py-1.5">
                    {renderToolStateCard({
                        part,
                        key: `${key}-card`,
                        fallbackInput: inferToolArgsFromResult(part),
                        inputContent: sqlResult.sql ? <SqlStatementBlock sql={sqlResult.sql} onCopy={onCopySql} /> : undefined,
                        resultContent: renderSqlResultBody(sqlResult, `${key}-result`),
                    })}
                </div>
            );
        }

        const chartResult = getChartResultFromPart(part);
        if (chartResult) {
            chartResults.push(chartResult);
            return (
                <div key={key} className="space-y-2 py-1.5">
                    {renderToolStateCard({
                        part,
                        key: `${key}-card`,
                        fallbackInput: inferToolArgsFromResult(part),
                    })}
                    <ChartResultCard key={`${key}-chart`} result={chartResult} source="tool" />
                </div>
            );
        }

        if (!toolName) return null;

        return (
            <div key={key} className="py-1.5">
                {renderToolStateCard({
                    part,
                    key: `${key}-card`,
                    fallbackInput: inferToolArgsFromResult(part),
                })}
            </div>
        );
    };

    const contentItems = (message.parts ?? [])
        .map((part: any, index: number) => {
            if (!part || typeof part !== 'object') return null;

            if (part.type === 'text') {
                return renderTextPart(part.text ?? '', `${message.id}-text-${index}`);
            }

            if (part.type === 'reasoning') {
                const reasoningText = typeof part.text === 'string' ? part.text.trim() : '';
                if (!reasoningText) return null;

                return (
                    <Reasoning
                        key={`${message.id}-reasoning-${index}`}
                        className="w-full"
                        isStreaming={status === 'streaming' && index === message.parts.length - 1 && message.id === messages.at(-1)?.id}
                    >
                        <ReasoningTrigger />
                        <ReasoningContent>{reasoningText}</ReasoningContent>
                    </Reasoning>
                );
            }

            if (part.type === 'source-url') {
                return renderSources(`${message.id}-sources`);
            }

            if (part.type === 'source-document' || part.type === 'file' || part.type === 'step-start') {
                return null;
            }

            if (isTypedToolPart(part)) {
                const id = getToolCallId(part);
                if (id && typedToolPreferredIndexById.get(id) !== index) {
                    return null;
                }
                return renderToolPart(part, index);
            }

            if (isLegacyToolCallPart(part)) {
                const id = getToolCallId(part);
                const pairedResult = id ? legacyResultById.get(id) : null;
                if (id && pairedResult) {
                    renderedLegacyResultIds.add(id);
                }
                return renderToolPart(mergeLegacyToolResult(part, pairedResult), index);
            }

            if (isLegacyToolResultPart(part)) {
                const id = getToolCallId(part);
                if (id && renderedLegacyResultIds.has(id)) {
                    return null;
                }
                return renderToolPart(part, index);
            }

            return null;
        })
        .filter(Boolean) as ReactNode[];

    if (!didRenderSources) {
        const sources = renderSources(`${message.id}-sources`);
        if (sources) contentItems.unshift(sources);
    }

    if (didUserRequestChart(messages, messageIndex) && chartResults.length === 0 && sqlResults.length > 0) {
        const autoChart = buildAutoChartFromSql(sqlResults[0]);
        if (autoChart) {
            contentItems.push(
                <div key={`${message.id}-auto-chart`} className="py-1.5">
                    <ChartResultCard result={autoChart} source="auto" />
                </div>,
            );
        }
    }

    if (assistantMessage && contentItems.length === 0 && (!isLatestAssistant || !isStreaming)) {
        contentItems.push(<AssistantFallbackCard key={`${message.id}-fallback`} />);
    }

    if (contentItems.length === 0) return null;

    const isAssistant = message.role === 'assistant';

    return (
        <div key={message.id} className="w-full space-y-1.5">
            <Message from={message.role} className={isAssistant ? 'w-full' : undefined}>
                <MessageContent className={isAssistant ? 'w-full max-w-none bg-transparent' : undefined}>{contentItems}</MessageContent>
            </Message>
        </div>
    );
};

export default MessageRenderer;
