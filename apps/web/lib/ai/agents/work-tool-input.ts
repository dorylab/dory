import { z } from 'zod';

import { workDraftSchema, workPatchSchema } from '@/lib/work-documents/schema';

const reportInputs = {
    createWorkReport: workDraftSchema,
    readWorkReport: z.object({ documentId: z.string().min(1) }),
    updateWorkReport: z.object({ documentId: z.string().min(1), expectedRevision: z.number().int().positive(), patch: workPatchSchema }),
};

// Only close containers after a complete JSON value. Never repair strings,
// commas, values or field names: those need a new, explicit model decision.
export function repairWorkToolInput(toolName: string, input: string): string | null {
    const schema = reportInputs[toolName as keyof typeof reportInputs];
    if (!schema) return null;
    try {
        JSON.parse(input);
        return null;
    } catch {
        const stack: string[] = [];
        let quoted = false;
        let escaped = false;
        for (const char of input) {
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
            } else if (char === '"') quoted = true;
            else if (char === '{') stack.push('}');
            else if (char === '[') stack.push(']');
            else if ((char === '}' || char === ']') && stack.pop() !== char) return null;
        }
        if (quoted || !stack.length || !/["}\]]$/.test(input.trimEnd())) return null;
        const candidate = input + stack.reverse().join('');
        try {
            return schema.safeParse(JSON.parse(candidate)).success ? candidate : null;
        } catch {
            return null;
        }
    }
}

export function formatChatToolError(error: unknown): string {
    const value = error && typeof error === 'object' ? (error as { name?: unknown; message?: unknown; cause?: unknown }) : null;
    const message = typeof error === 'string' ? error : typeof value?.message === 'string' ? value.message : '';
    const name = typeof value?.name === 'string' ? value.name : '';
    // The SDK emits both Error objects and their serialized strings in a UI stream.
    if (/InvalidToolInputError|TypeValidationError|JSONParseError/.test(name + ' ' + message)) {
        const cause = value?.cause && typeof value.cause === 'object' ? (value.cause as { message?: unknown }) : null;
        const detail = typeof cause?.message === 'string' ? cause.message : message;
        const fields = detail.includes('Error message:') ? detail.slice(detail.lastIndexOf('Error message:') + 'Error message:'.length).trim() : detail;
        return `TOOL_INPUT_INVALID: Tool arguments must be complete JSON and match the input schema. Correct the indicated fields and retry; this is not a service outage. ${fields.slice(0, 1200)}`;
    }
    return message || 'AI_SERVICE_UNAVAILABLE';
}
