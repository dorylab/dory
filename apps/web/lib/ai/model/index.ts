import { getDBService } from '@dory/database';
import { getOrganizationAiProviderEntitlementModeForServer, resolveOrganizationAiProviderCapabilityForOrganization } from '@dory/ee/ai/organization-ai-providers';
import { MODEL_PRESETS, getProviderModelPresets, resolveModelName } from './presets';
import { getChatModel, getChatModelForProviderConfig } from './providers';
import { isAiProviderApiKeyRequired, isAiProviderBaseUrlRequired } from '@dory/ee/ai/provider-options';
import type { ModelRole } from './types';

export type ModelBundle<R extends ModelRole = ModelRole> = {
    model: ReturnType<typeof getChatModel>;
    preset: (typeof MODEL_PRESETS)[R];
};

export type EffectiveModelBundle<R extends ModelRole = ModelRole> = {
    model: ReturnType<typeof getChatModel>;
    preset: (typeof MODEL_PRESETS)[R];
    modelName: string;
    providerKey?: string | null;
    source?: 'global' | 'organization';
};

/**
 * ✅ Recommended: get model + preset together
 * - App code only cares about role
 * - provider / modelName / temperature are hidden
 */
export function getModelBundle<R extends ModelRole>(role: R): ModelBundle<R> {
    const basePreset = MODEL_PRESETS[role];
    if (!basePreset) {
        throw new Error(`Unknown model role: ${role}`);
    }

    const modelName = resolveModelName(role);
    const preset = { ...basePreset, model: modelName };
    const model = getChatModel(modelName);
    return { model, preset };
}

/**
 * (Optional) get model only
 * - Rarely needed
 */
export function getModel<R extends ModelRole>(role: R) {
    return getModelBundle(role).model;
}

/**
 * (Optional) get preset only
 */
export function getModelPreset<R extends ModelRole>(role: R) {
    return getModelBundle(role).preset;
}

/**
 * (Optional) get preset only without initializing a provider model
 * - Use for cloud-only request paths
 */
export function getModelPresetOnly<R extends ModelRole>(role: R) {
    const basePreset = MODEL_PRESETS[role];
    if (!basePreset) {
        throw new Error(`Unknown model role: ${role}`);
    }

    const modelName = resolveModelName(role);
    return { ...basePreset, model: modelName };
}

/**
 * (Optional) get chatModel by provider model name
 * - Only when a specific model name is required
 */
export function getProviderModel(modelName: string) {
    return getChatModel(modelName);
}

/**
 * ✅ Preferred: get model + preset with optional override modelName
 * - Keeps the "default preset" path as the default
 * - Only hits provider lookup when a non-default modelName is requested
 */
export function getEffectiveModelBundle<R extends ModelRole>(role: R, modelName?: string | null): EffectiveModelBundle<R> {
    const { model: defaultModel, preset } = getModelBundle(role);
    const resolvedModelName = modelName ?? preset.model;
    const model = resolvedModelName === preset.model ? defaultModel : getProviderModel(resolvedModelName);
    return { model, preset, modelName: resolvedModelName, source: 'global' };
}

export async function getEffectiveModelBundleForOrganization<R extends ModelRole>(
    role: R,
    options: {
        organizationId?: string | null;
        modelName?: string | null;
    } = {},
): Promise<EffectiveModelBundle<R>> {
    const organizationId = options.organizationId ?? null;
    if (!organizationId) {
        return getEffectiveModelBundle(role, options.modelName);
    }

    const db = await getDBService();
    const provider = await db.organizationAiProviders.getDefaultResolved(organizationId);
    if (!provider) {
        return getEffectiveModelBundle(role, options.modelName);
    }

    const capability = await resolveOrganizationAiProviderCapabilityForOrganization(db, organizationId, getOrganizationAiProviderEntitlementModeForServer());
    if (!capability.enabled) {
        return getEffectiveModelBundle(role, options.modelName);
    }

    if (
        !provider.provider ||
        !provider.model ||
        (isAiProviderApiKeyRequired(provider.provider) && !provider.apiKey) ||
        (isAiProviderBaseUrlRequired(provider.provider) && !provider.baseUrl)
    ) {
        throw new Error('Organization AI provider is incomplete.');
    }

    const basePreset = getProviderModelPresets(provider.provider)[role] ?? MODEL_PRESETS[role];
    const resolvedModelName = provider.model;
    const preset = { ...basePreset, model: resolvedModelName };
    const model = getChatModelForProviderConfig({
        providerKey: provider.provider,
        modelName: resolvedModelName,
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
    });

    return {
        model,
        preset,
        modelName: resolvedModelName,
        providerKey: provider.provider,
        source: 'organization',
    };
}
