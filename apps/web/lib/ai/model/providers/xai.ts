import { createXai } from '@ai-sdk/xai';

export type XaiProviderOptions = {
    apiKey?: string;
    baseURL?: string;
};

export function createXaiProvider(options: XaiProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.DORY_AI_API_KEY;
    if (!apiKey) {
        throw new Error('DORY_AI_API_KEY is required');
    }

    const baseURL = options.baseURL ?? process.env.DORY_AI_URL;

    const provider = createXai({
        apiKey,
        baseURL,
    });

    return {
        // Keep Chat Completions semantics instead of V7's Responses API default.
        chatModel: (modelName: string) => provider.chat(modelName),
    };
}
