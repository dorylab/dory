import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type OpenAICompatibleProviderOptions = {
    apiKey?: string;
    baseURL?: string;
    name?: string;
};

export function createOpenAICompatibleProvider(options: OpenAICompatibleProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.DORY_AI_API_KEY;
    if (!apiKey) {
        throw new Error('DORY_AI_API_KEY is required');
    }

    const baseURL = options.baseURL ?? process.env.DORY_AI_URL;
    if (!baseURL) {
        throw new Error('DORY_AI_URL is required');
    }

    const provider = createOpenAICompatible({
        apiKey,
        baseURL,
        name: options.name ?? 'openai-compatible',
    });

    return {
        chatModel: (modelName: string) => provider.chatModel(modelName),
    };
}
