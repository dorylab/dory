import type { OrganizationAiProviderResolved } from '@dory/database/postgres/impl/organization-ai-providers';
import type { OrganizationAiProviderCapability } from '@dory/ee/ai/organization-ai-providers';
import { isAiProviderApiKeyRequired, isAiProviderBaseUrlRequired } from '@dory/ee/ai/provider-options';

export type AiExecutionSource = 'global' | 'organization';

export type AiExecutionPolicyInput = {
    organizationProvider?: OrganizationAiProviderResolved | null;
    organizationCapability?: OrganizationAiProviderCapability | null;
    requestedModel?: string | null;
    defaultModel: string;
    useCloudAi?: boolean;
    cloudApiBaseUrl?: string | null;
    allowCloudProxy?: boolean;
    env?: Record<string, string | undefined>;
};

export type AiExecutionPolicy = {
    source: AiExecutionSource;
    providerKey: string | null;
    modelName: string;
    requestedModel: string | null;
    shouldUseCloudProxy: boolean;
    gateway: 'cloudflare' | 'direct' | null;
    organizationProviderId: string | null;
};

function hasText(value?: string | null): value is string {
    return Boolean(value?.trim());
}

function isCloudflareProvider(provider?: string | null): boolean {
    const normalized = provider?.trim().toLowerCase();
    return normalized === 'cloudflare' || normalized === 'cloudflare-gateway';
}

function isCloudflareGatewayUrl(url?: string | null): boolean {
    return Boolean(url?.trim().toLowerCase().includes('gateway.ai.cloudflare.com'));
}

export function isOrganizationProviderReadyForExecution(provider?: OrganizationAiProviderResolved | null): provider is OrganizationAiProviderResolved {
    if (!provider?.enabled || !provider.isDefault) return false;
    if (!hasText(provider.provider) || !hasText(provider.model)) return false;
    if (isAiProviderApiKeyRequired(provider.provider) && !hasText(provider.apiKey)) return false;
    if (isAiProviderBaseUrlRequired(provider.provider) && !hasText(provider.baseUrl)) return false;
    return true;
}

export function resolveAiExecutionPolicy(input: AiExecutionPolicyInput): AiExecutionPolicy {
    const organizationProvider =
        input.organizationCapability?.enabled && isOrganizationProviderReadyForExecution(input.organizationProvider) ? input.organizationProvider : null;

    if (organizationProvider) {
        const providerKey = organizationProvider.provider.trim().toLowerCase();
        return {
            source: 'organization',
            providerKey,
            modelName: organizationProvider.model.trim(),
            requestedModel: null,
            shouldUseCloudProxy: false,
            gateway: isCloudflareProvider(providerKey) || isCloudflareGatewayUrl(organizationProvider.baseUrl) ? 'cloudflare' : 'direct',
            organizationProviderId: organizationProvider.id,
        };
    }

    const env = input.env ?? process.env;
    const envProvider = env.DORY_AI_PROVIDER?.trim().toLowerCase() || null;
    const envBaseUrl = env.DORY_AI_URL?.trim().toLowerCase() || null;
    const allowCloudProxy = input.allowCloudProxy !== false;
    const shouldUseCloudProxy = Boolean(allowCloudProxy && input.useCloudAi && input.cloudApiBaseUrl);
    const shouldForcePresetModel = shouldUseCloudProxy || isCloudflareProvider(envProvider) || isCloudflareGatewayUrl(envBaseUrl);
    const requestedModel = shouldForcePresetModel ? null : (input.requestedModel?.trim() || null);
    const modelName = requestedModel || input.defaultModel;

    return {
        source: 'global',
        providerKey: envProvider,
        modelName,
        requestedModel,
        shouldUseCloudProxy,
        gateway: isCloudflareProvider(envProvider) || isCloudflareGatewayUrl(envBaseUrl) ? 'cloudflare' : envBaseUrl ? 'direct' : null,
        organizationProviderId: null,
    };
}
