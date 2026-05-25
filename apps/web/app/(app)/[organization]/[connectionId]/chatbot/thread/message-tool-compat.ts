import type { UIMessage } from 'ai';

export type ToolCompatibilityIndex = {
    toolResultById: Map<string, any>;
    toolCallLocationById: Map<string, { messageIndex: number; partIndex: number; part: any }>;
};

export function getToolCallId(part: any) {
    if (!part || typeof part !== 'object') return null;
    if (typeof part.toolCallId === 'string') return part.toolCallId;
    if (typeof part.callId === 'string') return part.callId;
    return null;
}

export function isLegacyToolCallPart(part: any) {
    return part?.type === 'tool-call' || part?.type === 'tool_call';
}

export function isLegacyToolResultPart(part: any) {
    return part?.type === 'tool-result' || part?.type === 'tool_result' || part?.type === 'tool-error';
}

export function isTypedToolPart(part: any) {
    return typeof part?.type === 'string' && part.type.startsWith('tool-') && !isLegacyToolCallPart(part) && !isLegacyToolResultPart(part);
}

export function isFinalToolState(part: any) {
    return part?.state === 'output-available' || part?.state === 'output-error' || part?.state === 'output-denied' || Boolean(part?.output);
}

export function getToolOutput(part: any) {
    return part?.output ?? part?.result ?? part?.data ?? null;
}

export function getToolErrorText(part: any) {
    return part?.errorText ?? part?.error?.message ?? (part?.type === 'tool-error' && typeof part?.message === 'string' ? part.message : undefined);
}

export function getToolName(part: any) {
    if (typeof part?.toolName === 'string') return part.toolName;
    if (typeof part?.type === 'string' && part.type.startsWith('tool-')) {
        return part.type.replace(/^tool-/, '');
    }

    const result = getToolOutput(part);
    if (result?.type === 'sql-result') return 'sqlRunner';
    if (result?.type === 'chart') return 'chartBuilder';
    return null;
}

export function getToolState(part: any): any {
    if (part?.state) return part.state;
    if (part?.type === 'tool-error') return 'output-error';
    if (isLegacyToolResultPart(part) || part?.output) return 'output-available';
    return 'input-available';
}

export function mergeLegacyToolResult(callPart: any, resultPart: any | null) {
    if (!resultPart) return callPart;

    return {
        ...callPart,
        state: resultPart.type === 'tool-error' ? 'output-error' : 'output-available',
        output: getToolOutput(resultPart),
        errorText: getToolErrorText(resultPart),
    };
}

export function inferToolArgsFromResult(part: any) {
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
}

export function buildToolCompatibilityIndex(messages: UIMessage[]): ToolCompatibilityIndex {
    const toolResultById = new Map<string, any>();
    const toolCallLocationById = new Map<string, { messageIndex: number; partIndex: number; part: any }>();

    messages.forEach((candidateMessage: any, candidateMessageIndex) => {
        (candidateMessage.parts ?? []).forEach((candidatePart: any, candidatePartIndex: number) => {
            const id = getToolCallId(candidatePart);
            if (!id) return;

            if (isLegacyToolResultPart(candidatePart) && !toolResultById.has(id)) {
                toolResultById.set(id, candidatePart);
            }

            if ((isLegacyToolCallPart(candidatePart) || (isTypedToolPart(candidatePart) && !isFinalToolState(candidatePart))) && !toolCallLocationById.has(id)) {
                toolCallLocationById.set(id, {
                    messageIndex: candidateMessageIndex,
                    partIndex: candidatePartIndex,
                    part: candidatePart,
                });
            }
        });
    });

    return {
        toolResultById,
        toolCallLocationById,
    };
}

export function buildTypedToolPreferredIndex(parts: any[]) {
    const typedToolPreferredIndexById = new Map<string, number>();

    parts.forEach((part: any, index: number) => {
        const id = getToolCallId(part);
        if (!id) return;

        if (isTypedToolPart(part)) {
            const preferredIndex = typedToolPreferredIndexById.get(id);
            if (preferredIndex === undefined || isFinalToolState(part)) {
                typedToolPreferredIndexById.set(id, index);
            }
        }
    });

    return typedToolPreferredIndexById;
}
