import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type MetaProviderOptions = {
    apiKey?: string;
    baseURL?: string;
};

export function createMetaProvider(options: MetaProviderOptions = {}) {
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
        name: 'meta',
    });

    return {
        chatModel: (modelName: string) => provider.chatModel(modelName),
    };
}
