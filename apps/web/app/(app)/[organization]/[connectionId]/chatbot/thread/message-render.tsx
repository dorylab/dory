'use client';

import { ReactNode } from 'react';
import type { UIMessage } from 'ai';
import { CopyIcon, RefreshCcwIcon } from 'lucide-react';

import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { ChartResultPart, ChartResultCard } from '@/components/@dory/ui/ai/charts-result';
import { SqlResultCard } from '@/components/@dory/ui/ai/sql-result';
import { AssistantFallbackCard } from '@/components/@dory/ui/ai/assistant-fallback';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenuItem } from '@/registry/new-york-v4/ui/dropdown-menu';
import { buildAutoChartFromSql } from '@/components/@dory/ui/ai/utils/auto-charts';
import { useTranslations } from 'next-intl';

import type { CopilotActionExecutor } from '../copilot/action-bridge'; 
import { SqlResultPart } from '@/components/@dory/ui/ai/sql-result/type';
import { ChatMode } from '../core/types';

type MessageRendererProps = {
    message: UIMessage;
    messageIndex: number;
    messages: UIMessage[];
    status: string;

    onCopySql: (sql: string) => Promise<void> | void;
    onManualExecute: (payload: { sql: string; database: string | null }) => void;

    
    mode?: ChatMode;
    onExecuteAction?: CopilotActionExecutor;
};

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
                    message: String(candidate.error?.message ?? fallbackMessage ?? 'SQL execution failed'),
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

const MessageRenderer = ({
    message,
    messageIndex,
    messages,
    status,
    onCopySql,
    onManualExecute,
    mode = 'global',
    onExecuteAction,
}: MessageRendererProps) => {
    const t = useTranslations('Chatbot');
    const contentItems: ReactNode[] = [];
    const sqlResults: SqlResultPart[] = [];
    const chartResults: ChartResultPart[] = [];

    const assistantMessage = message.role === 'assistant';
    const isLatestAssistant = assistantMessage && messageIndex === messages.length - 1;
    const isStreaming = status !== 'ready';

    const userRequestedChart = didUserRequestChart(messages, messageIndex);

    const showCopilotSqlActions = mode === 'copilot' && typeof onExecuteAction === 'function';
    const getToolCallId = (part: any) => {
        if (!part || typeof part !== 'object') return null;
        if (typeof part.callId === 'string') return part.callId;
        if (typeof part.toolCallId === 'string') return part.toolCallId;
        return null;
    };
    const isToolCallPart = (part: any) => {
        if (!part || typeof part !== 'object') return false;
        if (part.type === 'tool_call' || part.type === 'tool-call') return true;
        if (
            typeof part.type === 'string' &&
            part.type.startsWith('tool-') &&
            part.state === 'input-available'
        ) {
            return true;
        }
        return false;
    };
    const toolCallFirstIndex = new Map<string, number>();
    messages.forEach((msg, index) => {
        (msg.parts ?? []).forEach((part: any) => {
            const id = getToolCallId(part);
            if (id && isToolCallPart(part) && !toolCallFirstIndex.has(id)) {
                toolCallFirstIndex.set(id, index);
            }
        });
    });
    const shouldRenderToolCall = (part: any) => {
        const id = getToolCallId(part);
        if (!id) return true;
        return toolCallFirstIndex.get(id) === messageIndex;
    };
    const toolCallIdsPresent = new Set(
        messages
            .flatMap(msg => (Array.isArray(msg.parts) ? msg.parts : []))
            .filter((part: any) => isToolCallPart(part))
            .map((part: any) => getToolCallId(part))
            .filter((id: any): id is string => typeof id === 'string'),
    );
    const getToolResultId = (part: any) => {
        if (!part || typeof part !== 'object') return null;
        if (typeof part.callId === 'string') return part.callId;
        if (typeof part.toolCallId === 'string') return part.toolCallId;
        return null;
    };
    const toolResultFirstIndex = new Map<string, number>();
    messages.forEach((msg, index) => {
        (msg.parts ?? []).forEach((part: any) => {
            if (
                part?.type === 'tool_result' ||
                part?.type === 'tool-result' ||
                (typeof part?.type === 'string' && part.type.startsWith('tool-') && part.output)
            ) {
                const id = getToolResultId(part);
                if (id && !toolResultFirstIndex.has(id)) {
                    toolResultFirstIndex.set(id, index);
                }
            }
        });
    });
    const shouldRenderToolResult = (part: any) => {
        const id = getToolResultId(part);
        if (!id) return true;
        return toolResultFirstIndex.get(id) === messageIndex;
    };
    const inferToolNameFromResult = (part: any) => {
        const result = part?.result ?? part?.output ?? part?.data;
        if (result?.type === 'sql-result') return 'sqlRunner';
        if (result?.type === 'chart') return 'chartBuilder';
        return t('Errors.UnknownTool');
    };
    const inferToolArgsFromResult = (part: any) => {
        const result = part?.result ?? part?.output ?? part?.data;
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
        return { toolCallId: getToolResultId(part) };
    };
    const renderToolCallCard = (_toolName: string, _args: unknown, _key: string) => {
        // Tool-call UI is intentionally suppressed for now.
    };
    const maybeRenderFallbackToolCall = (part: any, index: number) => {
        const id = getToolResultId(part);
        if (!id) return;
        if (toolCallIdsPresent.has(id)) return;
        if (renderedToolCallIds.has(id)) return;
        const toolName = inferToolNameFromResult(part);
        const args = inferToolArgsFromResult(part);
        renderedToolCallIds.add(id);
        renderToolCallCard(toolName, args, `${message.id}-tool-call-fallback-${index}`);
    };
    const toolPartCallIds = new Set(
        messages
            .flatMap(msg => (Array.isArray(msg.parts) ? msg.parts : []))
            .filter(
                (part: any) =>
                    typeof part?.type === 'string' &&
                    part.type.startsWith('tool-') &&
                    typeof part.toolCallId === 'string',
            )
            .map((part: any) => part.toolCallId as string),
    );
    const renderedToolCallIds = new Set(
        messages
            .flatMap(msg => (Array.isArray(msg.parts) ? msg.parts : []))
            .filter((part: any) => part?.type === 'tool_call' && typeof part.callId === 'string')
            .map((part: any) => part.callId as string),
    );

    
    if (assistantMessage && message.parts?.some((part: any) => part.type === 'source-url')) {
        const sourceParts = message.parts.filter((part: any) => part.type === 'source-url');
        contentItems.push(
            <Sources key={`${message.id}-sources`}>
                <SourcesTrigger count={sourceParts.length} />
                {sourceParts.map((part: any, i: number) => (
                    <SourcesContent key={`${message.id}-source-${i}`}>
                        <Source href={part.url} title={part.url} />
                    </SourcesContent>
                ))}
            </Sources>,
        );
    }

    message.parts?.forEach((part: any, i: number) => {
        // tool-call
        if (part.type === 'tool-call' || part.type === 'tool_call') {
            return;
        }

        if (typeof part.type === 'string' && part.type.startsWith('tool-') && part.input && part.state === 'input-available') {
            return;
        }

        // tool-error
        if (part.type === 'tool-error') {
            return;
        }

        
        if (!shouldRenderToolResult(part)) {
            return;
        }

        // Tool-call UI suppressed; skip fallback tool-call rendering.

        const chartResult = getChartResultFromPart(part);
        if (chartResult) {
            chartResults.push(chartResult);
            contentItems.push(<ChartResultCard key={`${message.id}-chart-${i}`} result={chartResult} source="tool" />);
            return;
        }

        
        const sqlResult = getSqlResultFromPart(part, t('Errors.SqlExecutionFailed'));
        if (sqlResult) {
            sqlResults.push(sqlResult);

            
            contentItems.push(
                <SqlResultCard
                    key={`${message.id}-sql-${i}`}
                    result={sqlResult}
                    onCopy={onCopySql}
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
                            <DropdownMenuItem onClick={() => onExecuteAction?.({ type: 'sql.newTab', sql: sqlResult.sql })}>
                                {t('Tools.NewTab')}
                            </DropdownMenuItem>
                        ) : undefined
                    }
                    footerActions={
                        showCopilotSqlActions && !sqlResult.manualExecution?.required && sqlResult.sql?.trim() ? (
                            <>
                                <Button
                                    size="sm"
                                    className="h-9 rounded-full px-4 text-sm font-medium"
                                    onClick={() => onExecuteAction?.({ type: 'sql.replace', sql: sqlResult.sql })}
                                >
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
                />,
            );
            return;
        }

        
        if (part.type === 'text') {
            contentItems.push(<MessageResponse key={`${message.id}-text-${i}`}>{part.text}</MessageResponse>);
            return;
        }

        // reasoning
        if (part.type === 'reasoning') {
            contentItems.push(
                <Reasoning
                    key={`${message.id}-reasoning-${i}`}
                    className="w-full"
                    isStreaming={status === 'streaming' && i === message.parts.length - 1 && message.id === messages.at(-1)?.id}
                >
                    <ReasoningTrigger />
                    <ReasoningContent>{part.text}</ReasoningContent>
                </Reasoning>,
            );
            return;
        }

        
    });

    
    if (userRequestedChart && chartResults.length === 0 && sqlResults.length > 0) {
        const autoChart = buildAutoChartFromSql(sqlResults[0]);
        if (autoChart) {
            contentItems.push(<ChartResultCard key={`${message.id}-auto-chart`} result={autoChart} source="auto" />);
        }
    }

    
    const hasToolParts = !!message.parts?.some((part: any) => {
        if (!part || typeof part !== 'object') return false;
        if (part.type === 'tool-call' || part.type === 'tool_call') return false;
        if (part.type === 'tool-error') return true;
        if (part.type === 'tool-result' || part.type === 'tool_result') return true;
        return typeof part.type === 'string' && part.type.startsWith('tool-');
    });

    if (
        assistantMessage &&
        contentItems.length === 0 &&
        (!isLatestAssistant || !isStreaming) &&
        !hasToolParts
    ) {
        contentItems.push(<AssistantFallbackCard key={`${message.id}-fallback`} />);
    }

    if (contentItems.length === 0) {
        return null;
    }

    
    const showActions = assistantMessage && message.parts?.some((p: any) => p.type === 'text');
    const isAssistant = message.role === 'assistant';

    return (
        <div key={message.id} className="space-y-2 w-full">
            <Message from={message.role} className={isAssistant ? 'w-full' : undefined}>
                <MessageContent className={isAssistant ? 'w-full max-w-none bg-transparent' : 'w-full'}>
                    {contentItems}
                </MessageContent>
            </Message>

            {/* {showActions && (
                <ResponseActions>
                    <Action
                        label={t('Actions.Copy')}
                        onClick={() => {
                            
                            const lastTextPart: any = (message.parts ?? []).filter((p: any) => p?.type === 'text' && p.text)?.at(-1);
                            const text = lastTextPart?.text?.toString?.() ?? '';
                            if (text) navigator.clipboard.writeText(text);
                        }}
                    >
                        <CopyIcon className="size-3" />
                    </Action>

                    <Action label={t('Actions.Retry')}>
                        <RefreshCcwIcon className="size-3" />
                    </Action>
                </Actions>
            )} */}
        </div>
    );
};

export default MessageRenderer;
