import { canonicalChatToolName } from '@/lib/agent-runs/chat-tool-activity';
import { chatToolFailure } from '@dory/shared/types/chat-tool-error';
import type { ChatCompletion } from '@dory/shared/types/chat-completion';
import type { CheckpointAction } from '@dory/shared/types/chat-checkpoints';
import type { UIMessage } from 'ai';

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function getAssistantResponseError(message: UIMessage): string | undefined {
    const error = asRecord(message.metadata)?.responseError;
    return typeof error === 'string' && error.trim() ? error : undefined;
}

export function getReportSaveError(message: UIMessage): string | undefined {
    const save = asRecord(asRecord(message.metadata)?.reportSave);
    if (save?.status === 'failed') return typeof save.error === 'string' && save.error.trim() ? save.error : 'The report was not saved.';
    // Older report failures were stored as response errors even when the answer exists.
    const reason = getAssistantResponseError(message);
    return reason && /^(Create and save the requested report before completing|The report is still a draft\.)/.test(reason) ? reason : undefined;
}

export function buildChatResponseMetadata(metadata: unknown, finishReason: string | undefined, responseError: string | null) {
    return {
        ...asRecord(metadata),
        finishReason: responseError ? 'error' : (finishReason ?? null),
        ...(responseError ? { responseError } : {}),
    };
}

export function buildChatCompletionMetadata(options: {
    message: UIMessage;
    finishReason?: string;
    responseError: string | null;
    progressError: string | null;
    isAborted: boolean;
}) {
    const { message, finishReason, isAborted } = options;
    // A text fallback does not recover a turn whose tools were forcibly stopped.
    const error = options.progressError ?? (finishReason !== 'error' && hasUsableAssistantResponse(message) ? null : options.responseError);
    return {
        ...buildChatResponseMetadata(message.metadata, finishReason, error),
        responseStatus: isAborted ? 'aborted' : finishReason === 'error' || error ? 'failed' : 'completed',
    };
}

export function hasUsableAssistantResponse(message: UIMessage): boolean {
    if (message.role !== 'assistant' || getAssistantResponseError(message) || asRecord(message.metadata)?.finishReason === 'error') return false;
    return (message.parts ?? []).some(part => {
        const value = asRecord(part);
        if (!value) return false;
        if (value.type === 'text') return typeof value.text === 'string' && Boolean(value.text.trim());
        const output = value.output ?? value.result;
        const isToolOutput = value.state === 'output-available' || value.type === 'tool-result' || value.type === 'tool_result';
        return isToolOutput && output != null && asRecord(output)?.ok !== false;
    });
}

export function hasLaterAssistantResponse(messages: UIMessage[], messageIndex: number, status: string): boolean {
    return messages.some((message, index) => {
        if (index <= messageIndex) return false;
        if (index === messages.length - 1 && status !== 'ready') return false;
        return hasUsableAssistantResponse(message);
    });
}

export function getChatCompletion(message: UIMessage): ChatCompletion | undefined {
    const value = asRecord(asRecord(message.metadata)?.completion);
    if (!value || !['completed', 'partial', 'failed', 'aborted'].includes(String(value.status)) || !Array.isArray(value.completed) || !Array.isArray(value.unfinished))
        return undefined;
    return value as ChatCompletion;
}

export function summarizeChatCompletion(input: {
    message: UIMessage;
    actions: CheckpointAction[];
    aborted: boolean;
    error?: string | null;
    report?: ChatCompletion['report'];
    chartRequired?: boolean;
}): ChatCompletion {
    const actions = input.actions.map(action => ({ ...action, toolName: canonicalChatToolName(action.toolName) }));
    const recordedNames = new Set(actions.map(action => action.toolName));
    // Include preflight/schema failures that happened before a server action was reserved.
    for (const part of input.message.parts) {
        const value = asRecord(part);
        if (!value || typeof value.type !== 'string' || !(value.type.startsWith('tool-') || value.type === 'dynamic-tool')) continue;
        const name = canonicalChatToolName(String(value.toolName ?? value.type.slice(5)));
        if (name === 'publishProgress' || recordedNames.has(name)) continue;
        if (value.state === 'output-error' || value.state === 'output-denied' || asRecord(value.output)?.ok === false)
            actions.push({
                id: String(value.toolCallId),
                toolName: name,
                state: 'failed',
                failure: chatToolFailure(value.state === 'output-denied' ? 'Access denied' : (value.errorText ?? asRecord(value.output)?.error), name),
            });
        else if (value.state === 'output-available' && asRecord(value.output)?.ok !== false && !asRecord(value.output)?.control)
            actions.push({ id: String(value.toolCallId), toolName: name, state: 'completed' });
    }
    const completed = [...new Set(actions.filter(action => action.state === 'completed').map(action => action.toolName))];
    const unfinished: string[] = actions
        .filter(
            (action, index) =>
                action.state !== 'completed' &&
                !(
                    input.report?.saved &&
                    (['createWorkReport', 'updateWorkReport', 'finishAnalysis'].includes(action.toolName) || (input.chartRequired && action.toolName === 'chartBuilder'))
                ) &&
                !actions.slice(index + 1).some(next => next.toolName === action.toolName && next.state === 'completed'),
        )
        .map(action => action.failure?.code ?? 'TOOL_FAILED');
    if (input.report && !input.report.saved) unfinished.push('REPORT_NOT_SAVED');
    if (input.chartRequired && !input.report?.saved && !completed.includes('chartBuilder')) unfinished.push('CHART_NOT_CREATED');
    if (input.error) unfinished.push('EXECUTION_INTERRUPTED');
    const hasContent = input.message.parts.some(part => part.type === 'text' && part.text.trim()) || completed.length > 0 || input.report?.saved;
    const status = input.aborted ? 'aborted' : unfinished.length ? (hasContent ? 'partial' : 'failed') : hasContent ? 'completed' : 'failed';
    return { status, completed, unfinished: [...new Set(unfinished)], report: input.report, canContinue: status !== 'completed' && !unfinished.includes('ACCESS_DENIED') };
}

/** Resume the root user request even after multiple interrupted continuation turns. */
export function getChatResumeRequest<T extends { id: string; role: string; metadata?: unknown }>(messages: T[], responseId: string) {
    const response = messages.find(message => message.id === responseId && message.role === 'assistant');
    if (!response || !getChatCompletion({ ...response, role: 'assistant', parts: [] })?.canContinue) return null;
    const metadata = asRecord(response.metadata);
    const userMessageId = metadata?.resumeUserMessageId ?? metadata?.userMessageId;
    return messages.find(message => message.role === 'user' && message.id === userMessageId) ?? null;
}
