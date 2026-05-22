import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type OpenAICompatibleProviderOptions = {
    apiKey?: string | null;
    baseURL?: string | null;
    name?: string;
};

function normalizeBaseURL(baseURL: string) {
    const trimmed = baseURL.trim().replace(/\/+$/, '');
    return trimmed.replace(/\/chat\/completions$/i, '');
}

export function createOpenAICompatibleProvider(options: OpenAICompatibleProviderOptions = {}) {
    const apiKey = options.apiKey === undefined ? process.env.DORY_AI_API_KEY : options.apiKey;

    const rawBaseURL = options.baseURL === undefined ? process.env.DORY_AI_URL : options.baseURL;
    if (!rawBaseURL) {
        throw new Error('DORY_AI_URL is required');
    }
    const baseURL = normalizeBaseURL(rawBaseURL);

    const provider = createOpenAICompatible({
        apiKey: apiKey || 'not-needed',
        baseURL,
        name: options.name ?? 'openai-compatible',
        includeUsage: true,
    });

    return {
        chatModel: (modelName: string) => provider.chatModel(modelName),
    };
}
