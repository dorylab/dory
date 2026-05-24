import type { DBService } from '@dory/database';
import { getDBService } from '@dory/database';
import { resolveOrganizationAiProviderEntitlementForRequest } from '@/lib/server/organization-ai-providers/entitlement';
import { getProviderModelPresets, MODEL_PRESETS, resolveModelName } from './presets';
import { getChatModel, getChatModelForProviderConfig } from './providers';
import { resolveAiExecutionPolicy, type AiExecutionPolicy, type AiExecutionSource } from './execution-policy';
import type { ModelRole } from './types';

type ChatModel = ReturnType<typeof getChatModel>;

export type AiExecutionTarget<R extends ModelRole = ModelRole> = AiExecutionPolicy & {
    model: ChatModel | null;
    preset: (typeof MODEL_PRESETS)[R];
};

export type ResolveAiExecutionTargetOptions = {
    organizationId?: string | null;
    db?: DBService | null;
    modelName?: string | null;
    defaultModelName?: string | null;
    useCloudAi?: boolean;
    cloudApiBaseUrl?: string | null;
    allowCloudProxy?: boolean;
    includeModel?: boolean;
};

async function resolveDb(options: ResolveAiExecutionTargetOptions): Promise<DBService | null> {
    if (options.db !== undefined) return options.db;
    if (!options.organizationId) return null;
    return getDBService();
}

export async function resolveAiExecutionTargetForOrganization<R extends ModelRole>(
    role: R,
    options: ResolveAiExecutionTargetOptions = {},
): Promise<AiExecutionTarget<R>> {
    const organizationId = options.organizationId ?? null;
    const db = organizationId ? await resolveDb(options) : null;
    const provider = db && organizationId ? await db.organizationAiProviders.getDefaultResolved(organizationId) : null;
    const entitlement = db && organizationId ? await resolveOrganizationAiProviderEntitlementForRequest(db, organizationId) : null;
    const defaultModel = options.defaultModelName ?? resolveModelName(role);
    const policy = resolveAiExecutionPolicy({
        organizationProvider: provider,
        organizationCapability: entitlement?.capability ?? null,
        requestedModel: options.modelName ?? null,
        defaultModel,
        useCloudAi: options.useCloudAi,
        cloudApiBaseUrl: options.cloudApiBaseUrl,
        allowCloudProxy: options.allowCloudProxy,
    });

    const presetBase = policy.source === 'organization' && policy.providerKey ? (getProviderModelPresets(policy.providerKey)[role] ?? MODEL_PRESETS[role]) : MODEL_PRESETS[role];
    const preset = { ...presetBase, model: policy.modelName };
    const model =
        options.includeModel === false || policy.shouldUseCloudProxy
            ? null
            : policy.source === 'organization'
              ? createOrganizationModel(policy, provider)
              : getChatModel(policy.modelName);

    return {
        ...policy,
        preset,
        model,
    };
}

function createOrganizationModel(
    policy: Pick<AiExecutionPolicy, 'providerKey' | 'modelName'>,
    provider: Awaited<ReturnType<DBService['organizationAiProviders']['getDefaultResolved']>>,
): ChatModel {
    if (!policy.providerKey || !provider) {
        throw new Error('Organization AI provider is incomplete.');
    }

    return getChatModelForProviderConfig({
        providerKey: policy.providerKey,
        modelName: policy.modelName,
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
    });
}

export function assertAiExecutionTargetHasModel<R extends ModelRole>(target: AiExecutionTarget<R>): asserts target is AiExecutionTarget<R> & { model: ChatModel } {
    if (!target.model) {
        throw new Error('AI model was not initialized for local execution.');
    }
}

export type { AiExecutionSource };
