import { createAnthropic } from '@ai-sdk/anthropic';

export type AnthropicProviderOptions = {
    apiKey?: string;
    baseURL?: string;
};

export function createAnthropicProvider(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.DORY_AI_API_KEY;
    if (!apiKey) {
        throw new Error('DORY_AI_API_KEY is required');
    }

    const baseURL = options.baseURL ?? process.env.DORY_AI_URL;

    const provider = createAnthropic({
        apiKey,
        baseURL,
    });

    return {
        chatModel: (modelName: string) => provider.chat(modelName),
    };
}
