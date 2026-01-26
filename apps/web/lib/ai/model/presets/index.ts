import type { ModelRole } from '../types';
import type { Preset } from './shared';
import { ANTHROPIC_MODEL_PRESETS } from './anthropic';
import { COMPATIBLE_MODEL_PRESETS } from './compatible';
import { GOOGLE_MODEL_PRESETS } from './google';
import { META_MODEL_PRESETS } from './meta';
import { OPENAI_MODEL_PRESETS } from './openai';
import { QWEN_MODEL_PRESETS } from './qwen';
import { xAI_MODEL_PRESETS } from './xai';

const PROVIDER_PRESETS: Record<string, Record<ModelRole, Preset>> = {
    qwen: QWEN_MODEL_PRESETS,
    openai: OPENAI_MODEL_PRESETS,
    anthropic: ANTHROPIC_MODEL_PRESETS,
    google: GOOGLE_MODEL_PRESETS,
    xai: xAI_MODEL_PRESETS,
    meta: META_MODEL_PRESETS,
    'openai-compatible': COMPATIBLE_MODEL_PRESETS,
    compatible: COMPATIBLE_MODEL_PRESETS,
};

const PROVIDER_FAST_MODELS: Record<string, string | undefined> = {
    qwen: 'qwen-turbo',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    google: 'gemini-1.5-flash-latest',
    xai: 'grok-2-mini',
    meta: 'llama-3.1-8b-instruct',
    'openai-compatible': process.env.DORY_AI_MODEL ?? 'gpt-4o-mini',
    compatible: process.env.DORY_AI_MODEL ?? 'gpt-4o-mini',
};

function getProviderKey(providerKey?: string) {
    return (providerKey ?? process.env.DORY_AI_PROVIDER ?? 'openai').toLowerCase();
}

export function getProviderModelPresets(providerKey?: string) {
    const key = getProviderKey(providerKey);
    return PROVIDER_PRESETS[key] ?? OPENAI_MODEL_PRESETS;
}

export function resolveModelName(
    role: ModelRole,
    options?: { providerKey?: string; variant?: 'default' | 'fast' },
) {
    const envModel = process.env.DORY_AI_MODEL;
    if (envModel) {
        return envModel;
    }

    const providerKey = getProviderKey(options?.providerKey);
    const fastModel = PROVIDER_FAST_MODELS[providerKey];
    if (options?.variant === 'fast' && fastModel) {
        return fastModel;
    }

    const presets = getProviderModelPresets(providerKey);
    return presets[role]?.model ?? QWEN_MODEL_PRESETS[role].model;
}

export const MODEL_PRESETS = getProviderModelPresets();
