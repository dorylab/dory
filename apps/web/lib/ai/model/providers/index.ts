import { createAnthropicProvider } from './anthropic';
import { createQwenProvider } from './qwen';
import { createGoogleProvider } from './google';
import { createMetaProvider } from './meta';
import { createOpenAICompatibleProvider } from './openai-compatible';
import { createOpenAIProvider } from './openai';
import { createXaiProvider } from './xai';

type ChatProvider = {
    chatModel: (modelName: string) => any;
};

const providerFactories: Record<string, () => ChatProvider> = {
    qwen: () => createQwenProvider(),
    openai: () => createOpenAIProvider(),
    anthropic: () => createAnthropicProvider(),
    google: () => createGoogleProvider(),
    xai: () => createXaiProvider(),
    meta: () => createMetaProvider(),
    'openai-compatible': () => createOpenAICompatibleProvider(),
    compatible: () => createOpenAICompatibleProvider(),
};

const providerCache = new Map<string, ChatProvider>();

function getProvider(providerKey: string): ChatProvider {
    const normalized = providerKey.toLowerCase();
    const cached = providerCache.get(normalized);
    if (cached) return cached;

    const factory = providerFactories[normalized];
    if (!factory) {
        throw new Error(`Unknown AI provider: ${providerKey}`);
    }

    const provider = factory();
    providerCache.set(normalized, provider);
    return provider;
}

function resolveProviderAndModel(modelName: string) {
    const trimmed = modelName.trim();
    const [prefix, rest] = trimmed.split('/', 2);
    if (rest && providerFactories[prefix.toLowerCase()]) {
        return { providerKey: prefix, model: rest };
    }

    return {
        providerKey: process.env.DORY_AI_PROVIDER ?? 'openai',
        model: trimmed || process.env.DORY_AI_MODEL || trimmed,
    };
}

/**
 * Create chatModel in one place
 */
export function getChatModel(modelName: string) {
    const { providerKey, model } = resolveProviderAndModel(modelName);
    const provider = getProvider(providerKey);
    return provider.chatModel(model);
}
