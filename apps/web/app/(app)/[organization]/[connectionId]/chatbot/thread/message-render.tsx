'use client';

import { ReactNode } from 'react';
import type { ChatTimelineItem } from '@/lib/agent-runs/chat-timeline';
import Image from 'next/image';
import { chatReferenceSchema, referenceKey } from '@/lib/chat-context/types';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenuItem } from '@/registry/new-york-v4/ui/dropdown-menu';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { getAssistantResponseError, getReportSaveError, hasLaterAssistantResponse } from '@/lib/ai/chat-response-state';

import { buildChatChartLayout } from '@/lib/agent-runs/chat-chart-layout';
import { getChatResponseText } from '@/lib/agent-runs/chat-response';
import { getAgentActivityTitleKey } from '@/lib/agent-runs/summary';
import { AssistantFallbackCard } from '@/components/@dory/ui/ai/assistant-fallback';
import { ChartResultCard, ChartResultPart } from '@/components/@dory/ui/ai/charts-result';
import { SqlResultBody, SqlStatementBlock } from '@/components/@dory/ui/ai/sql-result';
import { SqlResultManualExecutionMode, SqlResultPart } from '@/components/@dory/ui/ai/sql-result/type';
import { buildAutoChartFromSql } from '@/components/@dory/ui/ai/utils/auto-charts';
import { ChatAnalysisProcess, ChatRunActivity, ChatTimeline } from '@/components/agent-runs/chat-run-activity';
import { type ChatMessageToolRow } from '@/components/agent-runs/chat-tool-activity';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';

import type { CopilotActionExecutor } from '../copilot/action-bridge';
import { ChatMode } from '../core/types';
import { DoryToolContent } from './dory-tool-content';
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

type MessageRendererProps = {
    message: UIMessage;
    messageIndex: number;
    messages: UIMessage[];
    status: string;

    onCopySql: (sql: string) => Promise<void> | void;
    onManualExecute?: (payload: { sql: string; database: string | null; mode?: SqlResultManualExecutionMode }) => void;

    showRunLinks?: boolean;
    mode?: ChatMode;
    onExecuteAction?: CopilotActionExecutor;
};

const MessageRenderer = ({ message, messageIndex, messages, status, onCopySql, onManualExecute, mode = 'global', onExecuteAction, showRunLinks = true }: MessageRendererProps) => {
    const t = useTranslations('Chatbot');
    const composerT = useTranslations('ChatComposer');
    const runsT = useTranslations('AgentRuns');
    const metadata = message.metadata as
        | { agentRunId?: string; requestId?: string; summarySave?: { status: string; error?: string }; responseStatus?: string; analysisDurationMs?: number }
        | undefined;
    const assistantMessage = message.role === 'assistant';
    const isLatestAssistant = assistantMessage && messageIndex === messages.length - 1;
    const isStreaming = status === 'streaming' || status === 'submitted';
    const showCopilotSqlActions = mode === 'copilot' && typeof onExecuteAction === 'function';
    const sourceParts = assistantMessage ? (message.parts ?? []).filter((part: any) => part?.type === 'source-url') : [];
    const sqlResults: SqlResultPart[] = [];
    const chartResults: ChartResultPart[] = [];
    const processItems: ReactNode[] = [];
    const timeline: ChatTimelineItem[] = [];
    const toolRows: ChatMessageToolRow[] = [];
    const finishParts = (message.parts ?? []).filter(part => getToolName(part) === 'finishAnalysis');
    const savedAnswer = finishParts.find(part => getToolOutput(part)?.ok === true);
    const hasReplyAfterSave = (message.parts ?? [])
        .slice((message.parts ?? []).findLastIndex(part => getToolName(part) === 'finishAnalysis') + 1)
        .some(part => part.type === 'text' && part.text.trim());
    const finalAnswer = savedAnswer ? getChatResponseText([savedAnswer]) : !hasReplyAfterSave && (!isLatestAssistant || !isStreaming) ? getChatResponseText(finishParts) : '';
    const unsavedAnswer = !savedAnswer && !hasReplyAfterSave && (!isLatestAssistant || !isStreaming) ? getChatResponseText(finishParts) : '';
    const unsavedAnswerKey = `${message.id}-unsaved-answer`;
    const hasProcess =
        assistantMessage &&
        Boolean(
            metadata?.agentRunId ||
            (message.parts ?? []).some(
                part => isTypedToolPart(part) || isLegacyToolCallPart(part) || isLegacyToolResultPart(part) || part.type === 'reasoning' || part.type === 'reasoning-file',
            ),
        );
    const lastTextIndex = (message.parts ?? []).findLastIndex(part => part.type === 'text' && part.text.trim());
    const hasMessageTools = message.parts.some(part => isTypedToolPart(part) || isLegacyToolCallPart(part) || isLegacyToolResultPart(part));
    const renderedLegacyResultIds = new Set<string>();
    let didRenderSources = false;
    const { toolResultById, toolCallLocationById } = buildToolCompatibilityIndex(messages);
    const typedToolPreferredIndexById = buildTypedToolPreferredIndex((message.parts ?? []) as any[]);
    const inlineCharts = new Map<string, ChartResultPart>();
    const chartByPartIndex = new Map<number, { id: string; result: ChartResultPart }>();
    message.parts.forEach((part, index) => {
        const callId = getToolCallId(part);
        const merged = mergeLegacyToolResult(part, callId ? toolResultById.get(callId) : undefined);
        let result = getChartResultFromPart(merged);
        if (!result) return;
        if (!result.data.length && !result.dataState) {
            result = getChartResultFromPart(merged, [...messages.slice(0, messageIndex), { ...message, parts: message.parts.slice(0, index) }])!;
        }
        const id = callId ?? `part-${index}`;
        inlineCharts.set(id, result);
        chartByPartIndex.set(index, { id, result });
    });
    const hasInlineCharts = inlineCharts.size > 0;
    const lastActionIndex = message.parts.findLastIndex(part => isTypedToolPart(part) || isLegacyToolCallPart(part) || isLegacyToolResultPart(part));
    const chartTexts =
        assistantMessage && hasInlineCharts
            ? message.parts.flatMap((part, index) => {
                  if (part.type === 'text' && !(finalAnswer && part.text.trim() === finalAnswer.trim())) return [{ id: `${message.id}-text-${index}`, text: part.text }];
                  if (getToolName(part) === 'finishAnalysis' && getToolOutput(part)?.ok === true && typeof getToolOutput(part).finalAnswer === 'string') {
                      return [{ id: `${message.id}-tool-${getToolCallId(part) ?? index}`, text: getToolOutput(part).finalAnswer as string }];
                  }
                  return [];
              })
            : [];
    if (unsavedAnswer) chartTexts.push({ id: unsavedAnswerKey, text: unsavedAnswer });
    const fallbackChartTextId = savedAnswer
        ? `${message.id}-tool-${getToolCallId(savedAnswer) ?? message.parts.indexOf(savedAnswer)}`
        : lastTextIndex > lastActionIndex
          ? `${message.id}-text-${lastTextIndex}`
          : unsavedAnswer
            ? unsavedAnswerKey
            : undefined;
    const chartLayout = buildChatChartLayout([...inlineCharts.keys()], chartTexts, isLatestAssistant && isStreaming ? undefined : fallbackChartTextId);

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

        const activityKey = getAgentActivityTitleKey(toolName);
        if (activityKey) return runsT(`Timeline.Titles.${activityKey}`);
        return toolName ? formatToolName(toolName, t) : t('Tools.Steps.RunTool');
    };

    const getToolDisplayTitle = (part: any) => {
        const summary = getToolStepSummary(part);
        const toolName = getToolName(part);
        if (toolName === 'sqlRunner' || getAgentActivityTitleKey(toolName)) return summary;

        const toolLabel = formatToolName(toolName, t);
        return summary === toolLabel ? summary : `${summary} · ${toolLabel}`;
    };

    const renderTextPart = (text: string, key: string, resolveCharts = true): ReactNode => {
        const layout = resolveCharts ? chartLayout.layouts.get(key) : undefined;
        if (layout?.some(part => part.type === 'chart')) {
            return (
                <div key={key} className="space-y-3" data-testid="chat-answer-body">
                    {layout.map((part, index) =>
                        part.type === 'text' ? (
                            renderTextPart(part.text, `${key}-prose-${index}`, false)
                        ) : (
                            <ChartResultCard key={`${key}-chart-${part.chartId}`} result={inlineCharts.get(part.chartId)!} source="tool" />
                        ),
                    )}
                </div>
            );
        }
        // The layout also removes duplicate or unavailable chart references.
        if (layout)
            text = layout
                .filter(part => part.type === 'text')
                .map(part => part.text)
                .join('\n');
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
            onManualExecute={onManualExecute ?? (() => undefined)}
            mode={mode}
            manualPrimaryAction={
                !onManualExecute ? (
                    <></>
                ) : showCopilotSqlActions && sqlResult.manualExecution?.required && sqlResult.sql?.trim() ? (
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
                !onManualExecute ? (
                    <></>
                ) : showCopilotSqlActions && sqlResult.manualExecution?.required && sqlResult.sql?.trim() ? (
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

        toolRows.push({
            toolCallId: getToolCallId(part) ?? key,
            toolName: getToolName(part) ?? '',
            title: getToolDisplayTitle(part),
            state,
            input,
            output,
            noResults: getToolName(part) === 'search_assets' && Array.isArray(output?.assets) && output.assets.length === 0,
            content: resultContent ? (
                <div className="space-y-3">
                    {inputContent}
                    {resultContent}
                </div>
            ) : (
                <DoryToolContent part={part} state={state} input={input} output={output} errorText={errorText} />
            ),
        });
        return null;
    };
    const renderToolPart = (part: any, index: number) => {
        const key = `${message.id}-tool-${getToolCallId(part) ?? index}`;
        const toolName = getToolName(part);
        const output = getToolOutput(part);
        if (output?.control) return null;
        if (toolName === 'publishProgress') {
            const text = part.input?.text;
            return output?.published && !output.duplicate && typeof text === 'string' && text.trim() ? <MessageResponse key={key}>{text}</MessageResponse> : null;
        }
        if (toolName === 'finishAnalysis' && output?.ok === true && typeof output.finalAnswer === 'string') {
            renderToolStateCard({ part, key });
            return renderTextPart(output.finalAnswer, key);
        }
        const sqlResult = getSqlResultFromPart(part, t('Errors.SqlExecutionFailed'));

        if (sqlResult) {
            sqlResults.push(sqlResult);
            return renderToolStateCard({
                part,
                key,
                fallbackInput: inferToolArgsFromResult(part),
                inputContent: sqlResult.sql ? <SqlStatementBlock sql={sqlResult.sql} onCopy={onCopySql} /> : undefined,
                resultContent: renderSqlResultBody(sqlResult, `${key}-result`),
            });
        }
        const chart = chartByPartIndex.get(index);
        if (chart) {
            const chartResult = chart.result;
            chartResults.push(chartResult);
            renderToolStateCard({ part, key, fallbackInput: inferToolArgsFromResult(part) });
            if (chartLayout.placed.has(chart.id) || (isLatestAssistant && isStreaming)) return null;
            return <ChartResultCard key={`${key}-chart`} result={chartResult} source="tool" />;
        }
        if (!toolName) return null;
        return renderToolStateCard({ part, key, fallbackInput: inferToolArgsFromResult(part) });
    };

    const renderPart = (part: any, index: number) => {
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

        if (part.type === 'reasoning-file') {
            if (typeof part.url !== 'string' || !part.url) return null;
            return (
                <a
                    key={`${message.id}-reasoning-file-${index}`}
                    className="text-sm text-muted-foreground underline underline-offset-4"
                    href={part.url}
                    rel="noreferrer"
                    target="_blank"
                >
                    {part.mediaType || 'Reasoning attachment'}
                </a>
            );
        }

        if (part.type === 'file') {
            const safeImage =
                /^data:image\/(png|jpeg|webp);base64,/.test(part.url) ||
                (/^image\/(png|jpeg|webp)$/.test(part.mediaType) && /^\/api\/chat\/attachments\/[a-f0-9-]{36}$/.test(part.url));
            return (
                <div key={`${message.id}-file-${index}`} className="my-2 max-w-sm rounded-md border p-2 text-sm">
                    {safeImage && <Image unoptimized width={384} height={192} src={part.url} alt={part.filename ?? ''} className="mb-2 max-h-48 rounded object-contain" />}
                    <span className="break-all">{part.filename ?? part.mediaType}</span>
                </div>
            );
        }
        if (part.type === 'source-document' || part.type === 'step-start') {
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
    };
    const contentItems: ReactNode[] = [];
    if (message.role === 'user') {
        if ((message.metadata as { outputIntent?: string } | undefined)?.outputIntent === 'report')
            contentItems.push(
                <span key="report-intent" className="mb-2 inline-block rounded-md border px-2 py-1 text-xs">
                    {composerT('ReportMode')}
                </span>,
            );
        const rawReferences = (message.metadata as { references?: unknown } | undefined)?.references;
        const references = chatReferenceSchema.array().safeParse(rawReferences);
        if (references.success && references.data.length)
            contentItems.push(
                <div key="references" className="mb-2 flex flex-wrap gap-1">
                    {references.data.map(reference => (
                        <span
                            key={referenceKey(reference)}
                            title={reference.kind === 'table' ? `${reference.connectionId} / ${reference.database} / ${reference.table}` : reference.kind}
                            className="rounded-md border px-2 py-1 text-xs"
                        >
                            @{reference.title}
                            {reference.kind === 'report' && reference.revision ? ` · v${reference.revision}` : ''}
                        </span>
                    ))}
                </div>,
            );
    }
    (message.parts ?? []).forEach((part, index) => {
        const before = toolRows.length;
        const chartsBefore = chartResults.length;
        const item = renderPart(part, index);
        for (const row of toolRows.slice(before)) timeline.push({ id: `tool:${row.toolCallId}`, kind: 'tool', toolCallId: row.toolCallId });
        if (!item) return;
        const completedAnswer = getToolName(part) === 'finishAnalysis' && getToolOutput(part)?.ok === true;
        if (part.type === 'text' && finalAnswer && part.text.trim() === finalAnswer.trim()) return;
        if (hasInlineCharts) {
            // Keep prose and charts under stable, ordered parents throughout the
            // stream. Only explicit progress, reasoning and tool rows collapse.
            processItems.push(item);
            timeline.push({
                id: `part:${index}`,
                kind: 'content',
                content: item,
                relatedToolCallId: getToolCallId(part) ?? undefined,
                persistent: part.type === 'text' || completedAnswer || chartResults.length > chartsBefore || part.type === 'source-url' || part.type === 'file',
            });
            return;
        }
        const intermediate =
            hasProcess &&
            !completedAnswer &&
            (part.type === 'reasoning' ||
                part.type === 'reasoning-file' ||
                (part.type === 'text' && ((isLatestAssistant && isStreaming && hasMessageTools) || Boolean(finalAnswer) || index < lastActionIndex || index !== lastTextIndex)) ||
                isTypedToolPart(part) ||
                isLegacyToolCallPart(part) ||
                isLegacyToolResultPart(part));
        if (intermediate) {
            processItems.push(item);
            timeline.push({ id: `part:${index}`, kind: 'content', content: item, relatedToolCallId: getToolCallId(part) ?? undefined });
        } else contentItems.push(item);
    });

    if (!didRenderSources) {
        const sources = renderSources(`${message.id}-sources`);
        if (sources) contentItems.unshift(sources);
    }

    if ((!isLatestAssistant || !isStreaming) && didUserRequestChart(messages, messageIndex) && chartResults.length === 0 && sqlResults.length > 0) {
        const autoChart = buildAutoChartFromSql(sqlResults[0]);
        if (autoChart) {
            contentItems.push(
                <div key={`${message.id}-auto-chart`} className="py-1.5">
                    <ChartResultCard result={autoChart} source="auto" />
                </div>,
            );
        }
    }

    if (assistantMessage && unsavedAnswer) {
        contentItems.push(renderTextPart(unsavedAnswer, unsavedAnswerKey));
    }

    if (
        assistantMessage &&
        (getReportSaveError(message) || getAssistantResponseError(message) || (contentItems.length === 0 && processItems.length === 0 && toolRows.length === 0)) &&
        (!isLatestAssistant || !isStreaming)
    ) {
        contentItems.push(
            <AssistantFallbackCard
                key={`${message.id}-fallback`}
                reason={getReportSaveError(message) ?? getAssistantResponseError(message)}
                reportSaveFailed={Boolean(getReportSaveError(message))}
                historical={hasLaterAssistantResponse(messages, messageIndex, status)}
            />,
        );
    }

    if (contentItems.length === 0 && processItems.length === 0 && toolRows.length === 0 && !hasProcess) return null;

    const isAssistant = message.role === 'assistant';

    return (
        <div key={message.id} className="w-full space-y-1.5">
            <Message from={message.role} className={isAssistant ? 'w-full' : undefined}>
                <MessageContent className={isAssistant ? 'w-full max-w-none bg-transparent' : undefined}>
                    {isAssistant && metadata?.agentRunId && metadata.requestId ? (
                        <ChatRunActivity
                            showLinks={showRunLinks}
                            summarySave={metadata.summarySave}
                            durationMs={metadata.analysisDurationMs}
                            workId={metadata.agentRunId}
                            requestId={metadata.requestId}
                            streaming={isLatestAssistant && isStreaming}
                            tools={toolRows}
                            timeline={timeline}
                            answer={contentItems}
                            inlineResults={hasInlineCharts}
                            responseError={getAssistantResponseError(message)}
                            failed={
                                Boolean(getAssistantResponseError(message)) ||
                                (isLatestAssistant && status === 'error') ||
                                metadata.summarySave?.status === 'failed' ||
                                metadata.responseStatus === 'aborted' ||
                                metadata.responseStatus === 'failed'
                            }
                            onCopySql={onCopySql}
                            onManualExecute={onManualExecute}
                        >
                            {processItems}
                        </ChatRunActivity>
                    ) : processItems.length || toolRows.length ? (
                        <ChatAnalysisProcess
                            streaming={isLatestAssistant && isStreaming}
                            failed={Boolean(getAssistantResponseError(message)) || metadata?.responseStatus === 'aborted' || metadata?.responseStatus === 'failed'}
                            renderTimeline={
                                hasInlineCharts
                                    ? expanded => (
                                          <ChatTimeline
                                              items={timeline}
                                              tools={toolRows}
                                              events={[]}
                                              ended={!isLatestAssistant || !isStreaming}
                                              collapsed={!expanded}
                                              onCopySql={onCopySql}
                                              onManualExecute={onManualExecute}
                                          />
                                      )
                                    : undefined
                            }
                        >
                            <ChatTimeline
                                items={timeline}
                                tools={toolRows}
                                events={[]}
                                ended={!isLatestAssistant || !isStreaming}
                                onCopySql={onCopySql}
                                onManualExecute={onManualExecute}
                            />
                        </ChatAnalysisProcess>
                    ) : null}
                    {!(isAssistant && metadata?.agentRunId && metadata.requestId) && contentItems}
                </MessageContent>
            </Message>
        </div>
    );
};

export default MessageRenderer;
