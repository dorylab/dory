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
import { DoryToolContent } from './dory-tool-content';
import {
    buildToolCompatibilityIndex,
    buildTypedToolPreferredIndex,
    getToolCallId,
    getToolErrorText,
    getToolName,
    getToolOutput,
    getToolState,
    inferToolArgsFromResult,
    isFinalToolState,
    isLegacyToolCallPart,
    isLegacyToolResultPart,
    isTypedToolPart,
    mergeLegacyToolResult,
} from './message-tool-compat';
import {
    didUserRequestChart,
    extractStandaloneSqlText,
    formatToolName,
    getChartResultFromPart,
    getSqlResultFromPart,
    getSqlStepLabel,
    removeUnavailableImageMarkdown,
    summarizeSqlStep,
} from './message-render-utils';

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
    const { toolResultById, toolCallLocationById } = buildToolCompatibilityIndex(messages);
    const typedToolPreferredIndexById = buildTypedToolPreferredIndex((message.parts ?? []) as any[]);

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
                        <div className="pt-3">
                            <DoryToolContent part={part} state={state} input={input} output={output} errorText={errorText} />
                        </div>
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
                const pairedResult = id && !isFinalToolState(part) ? toolResultById.get(id) : null;
                return renderToolPart(mergeLegacyToolResult(part, pairedResult), index);
            }

            if (isLegacyToolCallPart(part)) {
                const id = getToolCallId(part);
                const pairedResult = id ? toolResultById.get(id) : null;
                if (id && pairedResult) {
                    renderedLegacyResultIds.add(id);
                }
                return renderToolPart(mergeLegacyToolResult(part, pairedResult), index);
            }

            if (isLegacyToolResultPart(part)) {
                const id = getToolCallId(part);
                const pairedCallLocation = id ? toolCallLocationById.get(id) : null;
                if (id && (renderedLegacyResultIds.has(id) || (pairedCallLocation && pairedCallLocation.messageIndex <= messageIndex))) {
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
