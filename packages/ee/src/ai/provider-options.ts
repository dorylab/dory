import type { OrganizationAiProviderType } from '@dory/database/postgres/impl/organization-ai-providers';

export type AiProviderModelOption = {
    value: string;
    label: string;
};

export type AiProviderOption = {
    value: OrganizationAiProviderType;
    label: string;
    iconSrc: string;
};

export const AI_PROVIDER_DEFAULT_BASE_URLS: Partial<Record<OrganizationAiProviderType, string>> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    xai: 'https://api.x.ai/v1',
    meta: 'https://api.llama.com/compat/v1',
    'azure-openai': '',
    openrouter: 'https://openrouter.ai/api/v1',
};

export const AI_PROVIDER_ICON_SRCS: Partial<Record<OrganizationAiProviderType, string>> = {
    openai: '/images/logos/ai-providers/openai.svg',
    anthropic: '/images/logos/ai-providers/anthropic.svg',
    'azure-openai': '/images/logos/ai-providers/azure-openai.svg',
    openrouter: '/images/logos/ai-providers/openrouter.svg',
    google: '/images/logos/ai-providers/google.svg',
    qwen: '/images/logos/ai-providers/qwen.svg',
    xai: '/images/logos/ai-providers/xai.svg',
    meta: '/images/logos/ai-providers/meta.svg',
    'openai-compatible': '/images/logos/ai-providers/openai-compatible.svg',
    cloudflare: '/images/logos/ai-providers/cloudflare.svg',
    'cloudflare-gateway': '/images/logos/ai-providers/cloudflare-gateway.svg',
};

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
    { value: 'openai', label: 'OpenAI', iconSrc: AI_PROVIDER_ICON_SRCS.openai! },
    { value: 'anthropic', label: 'Anthropic', iconSrc: AI_PROVIDER_ICON_SRCS.anthropic! },
    { value: 'azure-openai', label: 'Azure OpenAI', iconSrc: AI_PROVIDER_ICON_SRCS['azure-openai']! },
    { value: 'openrouter', label: 'OpenRouter', iconSrc: AI_PROVIDER_ICON_SRCS.openrouter! },
    { value: 'google', label: 'Google Gemini', iconSrc: AI_PROVIDER_ICON_SRCS.google! },
    { value: 'qwen', label: 'Qwen', iconSrc: AI_PROVIDER_ICON_SRCS.qwen! },
    { value: 'xai', label: 'xAI', iconSrc: AI_PROVIDER_ICON_SRCS.xai! },
    { value: 'meta', label: 'Meta', iconSrc: AI_PROVIDER_ICON_SRCS.meta! },
    { value: 'openai-compatible', label: 'OpenAI Compatible', iconSrc: AI_PROVIDER_ICON_SRCS['openai-compatible']! },
];

export const AI_PROVIDER_MODEL_OPTIONS: Partial<Record<OrganizationAiProviderType, AiProviderModelOption[]>> = {
    openai: [
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
        { value: 'gpt-5.5', label: 'GPT-5.5' },
        { value: 'gpt-5.4', label: 'GPT-5.4' },
        { value: 'gpt-5-mini', label: 'GPT-5 mini' },
        { value: 'gpt-5-nano', label: 'GPT-5 nano' },
        { value: 'gpt-5', label: 'GPT-5' },
        { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
        { value: 'gpt-4.1', label: 'GPT-4.1' },
        { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { value: 'gpt-4o', label: 'GPT-4o' },
    ],
    anthropic: [
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
        { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
        { value: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
        { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
    ],
    google: [
        { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
        { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
        { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
        { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
    qwen: [
        { value: 'qwen3.7-max', label: 'Qwen3.7 Max' },
        { value: 'qwen3.7-plus', label: 'Qwen3.7 Plus' },
        { value: 'qwen3.7-max-preview', label: 'Qwen3.7 Max Preview' },
        { value: 'qwen3.7-plus-preview', label: 'Qwen3.7 Plus Preview' },
        { value: 'qwen3.6-max-preview', label: 'Qwen3.6 Max Preview' },
        { value: 'qwen3.6-plus', label: 'Qwen3.6 Plus' },
        { value: 'qwen3.6-35b-a3b', label: 'Qwen3.6 35B A3B' },
        { value: 'qwen3.6-27b', label: 'Qwen3.6 27B' },
        { value: 'qwen3.5-max-preview', label: 'Qwen3.5 Max Preview' },
        { value: 'qwen3.5-plus', label: 'Qwen3.5 Plus' },
        { value: 'qwen3.5-35b-a3b', label: 'Qwen3.5 35B A3B' },
        { value: 'qwen3.5-27b', label: 'Qwen3.5 27B' },
        { value: 'qwen3-max', label: 'Qwen3 Max' },
        { value: 'qwen3.5-flash', label: 'Qwen3.5 Flash' },
        { value: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus' },
        { value: 'qwen3-coder-flash', label: 'Qwen3 Coder Flash' },
        { value: 'qwen-plus', label: 'Qwen Plus' },
        { value: 'qwen-flash', label: 'Qwen Flash' },
        { value: 'qwen-turbo', label: 'Qwen Turbo' },
        { value: 'qwen3-coder-480b-a35b-instruct', label: 'Qwen3 Coder 480B A35B' },
        { value: 'qwen2.5-coder-32b-instruct', label: 'Qwen2.5 Coder 32B' },
    ],
    xai: [
        { value: 'grok-4.3', label: 'Grok 4.3' },
        { value: 'grok-4.3-latest', label: 'Grok 4.3 latest' },
        { value: 'grok-2-mini', label: 'Grok 2 mini' },
        { value: 'grok-2-latest', label: 'Grok 2' },
    ],
    meta: [
        { value: 'llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B Instruct' },
        { value: 'llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B Instruct' },
        { value: 'llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct' },
        { value: 'llama-3.1-405b-instruct', label: 'Llama 3.1 405B Instruct' },
        { value: 'llama-3.1-70b-instruct', label: 'Llama 3.1 70B Instruct' },
        { value: 'llama-3.1-8b-instruct', label: 'Llama 3.1 8B Instruct' },
    ],
    'azure-openai': [],
    openrouter: [],
    'openai-compatible': [
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
        { value: 'gpt-5.5', label: 'GPT-5.5' },
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
        { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
        { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
        { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
        { value: 'qwen3-max', label: 'Qwen3 Max' },
        { value: 'qwen-plus', label: 'Qwen Plus' },
        { value: 'llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B' },
        { value: 'llama-3.1-70b-instruct', label: 'Llama 3.1 70B Instruct' },
        { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
    ],
};

export function getAiProviderModelOptions(provider: OrganizationAiProviderType): AiProviderModelOption[] {
    return AI_PROVIDER_MODEL_OPTIONS[provider] ?? AI_PROVIDER_MODEL_OPTIONS.openai ?? [];
}

export function getDefaultAiProviderModel(provider: OrganizationAiProviderType): string {
    if (isAiProviderModelManual(provider)) return '';
    return getAiProviderModelOptions(provider)[0]?.value ?? 'gpt-4o-mini';
}

export function getDefaultAiProviderBaseUrl(provider: OrganizationAiProviderType): string {
    return AI_PROVIDER_DEFAULT_BASE_URLS[provider] ?? '';
}

export function getAiProviderIconSrc(provider?: string | null): string | null {
    const normalizedProvider = provider?.trim().toLowerCase();
    if (!normalizedProvider) return null;
    return AI_PROVIDER_ICON_SRCS[normalizedProvider as OrganizationAiProviderType] ?? null;
}

export function isAiProviderAvailable(provider: OrganizationAiProviderType): boolean {
    return AI_PROVIDER_OPTIONS.some(option => option.value === provider);
}

export function isAiProviderModelManual(provider: OrganizationAiProviderType): boolean {
    return provider === 'azure-openai' || provider === 'openrouter' || provider === 'openai-compatible';
}

export function isAiProviderModelAllowed(provider: OrganizationAiProviderType, model: string): boolean {
    const normalizedModel = model.trim();
    if (isAiProviderModelManual(provider)) return normalizedModel.length > 0;
    return getAiProviderModelOptions(provider).some(option => option.value === normalizedModel);
}

export function isAiProviderApiKeyRequired(provider: OrganizationAiProviderType): boolean {
    return provider !== 'openai-compatible';
}

export function isAiProviderBaseUrlRequired(provider: OrganizationAiProviderType): boolean {
    return provider === 'azure-openai' || provider === 'openrouter' || provider === 'openai-compatible';
}
