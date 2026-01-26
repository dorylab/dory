import { createGoogleGenerativeAI } from '@ai-sdk/google';

export type GoogleProviderOptions = {
    apiKey?: string;
    baseURL?: string;
};

export function createGoogleProvider(options: GoogleProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.DORY_AI_API_KEY;
    if (!apiKey) {
        throw new Error('DORY_AI_API_KEY is required');
    }

    const baseURL = options.baseURL ?? process.env.DORY_AI_URL;

    const provider = createGoogleGenerativeAI({
        apiKey,
        baseURL,
    });

    return {
        chatModel: (modelName: string) => provider.chat(modelName),
    };
}
