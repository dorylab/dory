import { createAnthropicProvider } from './anthropic';
import { createQwenProvider } from './qwen';
import { createGoogleProvider } from './google';
import { createMetaProvider } from './meta';
import { createOpenAICompatibleProvider } from './openai-compatible';
import { createOpenAIProvider } from './openai';
import { createXaiProvider } from './xai';
import { createCloudflareGatewayProvider } from './cloudflare';

type ChatProvider = {
    chatModel: (modelName: string) => any;
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

const providerFactories: Record<string, (options?: ProviderFactoryOptions) => ChatProvider> = {
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
    const envProvider = (process.env.DORY_AI_PROVIDER ?? 'openai').toLowerCase();
    const isCloudflareProvider = envProvider === 'cloudflare' || envProvider === 'cloudflare-gateway';

    if (rest && providerFactories[prefix.toLowerCase()]) {
        // For Cloudflare Gateway, model prefixes like "openai/gpt-4o-mini"
        // are upstream model IDs, not local provider selectors.
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

/**
 * Create chatModel in one place
 */
export function getChatModel(modelName: string) {
    const { providerKey, model } = resolveProviderAndModel(modelName);
    const provider = getProvider(providerKey);
    return provider.chatModel(model);
}

export function getChatModelForProviderConfig(options: { providerKey: string; modelName: string; apiKey?: string | null; baseURL?: string | null }) {
    const providerKey = options.providerKey.trim().toLowerCase();
    const factory = providerFactories[providerKey];
    if (!factory) {
        throw new Error(`Unknown AI provider: ${options.providerKey}`);
    }

    const trimmedModel = options.modelName.trim();
    const [prefix, rest] = trimmedModel.split('/', 2);
    const model = rest && prefix.toLowerCase() === providerKey ? rest : trimmedModel;
    const provider = factory({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
        name: providerKey,
    });

    return provider.chatModel(model);
}
