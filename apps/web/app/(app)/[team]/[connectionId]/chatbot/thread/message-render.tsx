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
        if (part.type === 'tool-call') {
            const toolName = part.toolName ?? part.name ?? t('Errors.UnknownTool');
            const args = part.args ?? part.arguments ?? {};
            contentItems.push(
                <Card key={`${message.id}-tool-call-${i}`} className="mt-3 border-primary/40 bg-muted/20">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold">{t('Tools.Call', { name: toolName })}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="whitespace-pre-wrap wrap-break-word text-xs">{JSON.stringify(args, null, 2)}</pre>
                    </CardContent>
                </Card>,
            );
            return;
        }

        // tool-error
        if (part.type === 'tool-error') {
            contentItems.push(
                <Card key={`${message.id}-tool-error-${i}`} className="mt-3 border-destructive/40 bg-destructive/10">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold text-destructive">{t('Tools.Failed')}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                        <div className="space-y-1">
                            <div>
                                <b>{t('Tools.ToolLabel')}:</b> {part.toolName ?? t('Errors.UnknownTool')}
                            </div>
                            <div>
                                <b>{t('Tools.MessageLabel')}:</b> {part.error ?? t('Errors.ToolErrorUnknown')}
                            </div>
                        </div>
                    </CardContent>
                </Card>,
            );
            return;
        }

        
        if (part.type === 'tool-result') {
            const result = part.result ?? part.output ?? part.data;
            const isKnown = result && typeof result === 'object' && (result.type === 'sql-result' || result.type === 'chart');

            if (!isKnown) {
                contentItems.push(
                    <Card key={`${message.id}-tool-result-raw-${i}`} className="mt-3 bg-muted/10">
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">{t('Tools.ResultRaw')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <pre className="whitespace-pre-wrap wrap-break-word text-xs">{JSON.stringify(result, null, 2)}</pre>
                        </CardContent>
                    </Card>,
                );
            }
            
        }

        
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
                <div key={`${message.id}-sql-${i}`} className="space-y-2">
                    <SqlResultCard result={sqlResult} onCopy={onCopySql} onManualExecute={onManualExecute} mode={mode} />

                    {showCopilotSqlActions && sqlResult.sql?.trim() ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => onExecuteAction?.({ type: 'sql.replace', sql: sqlResult.sql })}
                            >
                                {t('Tools.ReplaceSql')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onExecuteAction?.({ type: 'sql.newTab', sql: sqlResult.sql })}
                            >
                                {t('Tools.NewTab')}
                            </Button>
                        </div>
                    ) : null}
                </div>,
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

    
    if (assistantMessage && contentItems.length === 0 && (!isLatestAssistant || !isStreaming)) {
        contentItems.push(<AssistantFallbackCard key={`${message.id}-fallback`} />);
    }

    
    const showActions = assistantMessage && message.parts?.some((p: any) => p.type === 'text');
    const isAssistant = message.role === 'assistant';

    return (
        <div key={message.id} className="space-y-2 w-full">
            <Message from={message.role} className={isAssistant ? 'w-full' : undefined}>
                <MessageContent className={isAssistant ? 'w-full max-w-none bg-transparent' : undefined}>
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
