import { MODEL_PRESETS, resolveModelName } from './presets';
import { getChatModel } from './providers';
import { assertAiExecutionTargetHasModel, resolveAiExecutionTargetForOrganization } from './execution';
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
    gateway?: 'cloudflare' | 'direct' | null;
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
    const target = await resolveAiExecutionTargetForOrganization(role, {
        organizationId: options.organizationId ?? null,
        modelName: options.modelName ?? null,
        allowCloudProxy: false,
        includeModel: true,
    });
    assertAiExecutionTargetHasModel(target);

    return {
        model: target.model,
        preset: target.preset,
        modelName: target.modelName,
        providerKey: target.providerKey,
        gateway: target.gateway,
        source: target.source,
    };
}

export { resolveAiExecutionTargetForOrganization } from './execution';
export { resolveAiExecutionPolicy, isOrganizationProviderReadyForExecution } from './execution-policy';
