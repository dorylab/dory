import type { PromptMessage } from './types';

export const MAX_HISTORY_MESSAGES = 16;

export function composeMessages(
    messages: Array<PromptMessage | null | undefined | false>,
): PromptMessage[] {
    const normalized: PromptMessage[] = [];

    for (const message of messages) {
        if (!message) continue;
        normalized.push({
            role: message.role,
            content: message.content,
            name: message.name,
        });
    }

    return normalized;
}

export function systemMessage(content: string): PromptMessage {
    return { role: 'system', content };
}

export function userMessage(content: string): PromptMessage {
    return { role: 'user', content };
}
