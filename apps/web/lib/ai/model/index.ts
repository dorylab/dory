import { MODEL_PRESETS, resolveModelName } from './presets';
import { getChatModel } from './providers';
import type { ModelRole } from './types';

export type ModelBundle<R extends ModelRole = ModelRole> = {
    model: ReturnType<typeof getChatModel>;
    preset: (typeof MODEL_PRESETS)[R];
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
 * (Optional) get chatModel by provider model name
 * - Only when a specific model name is required
 */
export function getProviderModel(modelName: string) {
    return getChatModel(modelName);
}
