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
