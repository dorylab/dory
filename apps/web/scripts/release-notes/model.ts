import type { LanguageModelV3 } from '@ai-sdk/provider';

import { createAnthropicProvider } from '../../lib/ai/model/providers/anthropic';
import { createCloudflareGatewayProvider } from '../../lib/ai/model/providers/cloudflare';
import { createGoogleProvider } from '../../lib/ai/model/providers/google';
import { createMetaProvider } from '../../lib/ai/model/providers/meta';
import { createOpenAIProvider } from '../../lib/ai/model/providers/openai';
import { createOpenAICompatibleProvider } from '../../lib/ai/model/providers/openai-compatible';
import { createQwenProvider } from '../../lib/ai/model/providers/qwen';
import { createXaiProvider } from '../../lib/ai/model/providers/xai';

type ChatProvider = {
    chatModel: (modelName: string) => LanguageModelV3;
};

type ProviderFactoryOptions = {
    apiKey?: string | null;
    baseURL?: string | null;
    name?: string;
};

function withRequiredKeyOptions(options?: ProviderFactoryOptions) {
    return {
        ...options,
        apiKey: options?.apiKey ?? undefined,
        baseURL: options?.baseURL ?? undefined,
    };
}

const releaseNotesProviderFactories: Record<string, (options?: ProviderFactoryOptions) => ChatProvider> = {
    qwen: options => createQwenProvider(withRequiredKeyOptions(options)),
    openai: options => createOpenAIProvider(withRequiredKeyOptions(options)),
    anthropic: options => createAnthropicProvider(withRequiredKeyOptions(options)),
    google: options => createGoogleProvider(withRequiredKeyOptions(options)),
    xai: options => createXaiProvider(withRequiredKeyOptions(options)),
    meta: options => createMetaProvider(withRequiredKeyOptions(options)),
    'azure-openai': options => createOpenAICompatibleProvider(withRequiredKeyOptions(options)),
    openrouter: options => createOpenAICompatibleProvider(withRequiredKeyOptions(options)),
    'openai-compatible': options => createOpenAICompatibleProvider(options),
    cloudflare: options => createCloudflareGatewayProvider(withRequiredKeyOptions(options)),
    'cloudflare-gateway': options => createCloudflareGatewayProvider(withRequiredKeyOptions(options)),
};

const providerCache = new Map<string, ChatProvider>();

function getProvider(providerKey: string): ChatProvider {
    const normalized = providerKey.toLowerCase();
    const cached = providerCache.get(normalized);
    if (cached) return cached;

    const factory = releaseNotesProviderFactories[normalized];
    if (!factory) {
        throw new Error(`Unknown release notes AI provider: ${providerKey}`);
    }

    const provider = factory();
    providerCache.set(normalized, provider);
    return provider;
}

function resolveProviderAndModel(modelName: string) {
    const trimmed = modelName.trim();
    const [prefix, rest] = trimmed.split('/', 2);
    const envProvider = (process.env.DORY_AI_PROVIDER ?? 'openai').toLowerCase();
    const isCloudflareProvider = envProvider === 'cloudflare' || envProvider === 'cloudflare-gateway';

    if (rest && releaseNotesProviderFactories[prefix.toLowerCase()]) {
        if (isCloudflareProvider && prefix.toLowerCase() !== 'cloudflare' && prefix.toLowerCase() !== 'cloudflare-gateway') {
            return { providerKey: envProvider, model: trimmed };
        }
        return { providerKey: prefix, model: rest };
    }

    return {
        providerKey: envProvider,
        model: trimmed || process.env.DORY_AI_MODEL || trimmed,
    };
}

export function getReleaseNotesChatModel(modelName: string) {
    const { providerKey, model } = resolveProviderAndModel(modelName);
    const provider = getProvider(providerKey);
    return provider.chatModel(model);
}
