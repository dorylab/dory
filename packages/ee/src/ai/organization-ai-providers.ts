import type { OrganizationAiProviderPublic } from '@dory/database/postgres/impl/organization-ai-providers';
import type { DBService } from '@dory/database';
import { getLicenseForServer, isBillingEnabledForServer, isDesktopBillingHandoffAvailableForServer, type DoryLicense } from '@dory/shared/runtime';
import { isAiProviderApiKeyRequired, isAiProviderBaseUrlRequired } from './provider-options';

export type OrganizationPlan = 'hobby' | 'pro';
export type OrganizationAiProviderEntitlementMode = 'cloud-plan' | 'self-hosted-license';
export type OrganizationAiProviderCapabilitySource = 'cloud-plan' | 'ee-license' | 'none';
export type OrganizationAiProviderCapabilityReason = 'enabled_by_pro' | 'enabled_by_enterprise' | 'requires_upgrade';

export type OrganizationAiProviderCapability = {
    enabled: boolean;
    source: OrganizationAiProviderCapabilitySource;
    reason: OrganizationAiProviderCapabilityReason;
};

type BillingSubscriptionRecord = {
    plan: string;
    status: string;
};

function isActiveProBillingRecord(record: BillingSubscriptionRecord): boolean {
    return record.plan === 'pro' && (record.status === 'active' || record.status === 'trialing');
}

export function resolveOrganizationAiProviderCapability(options: {
    entitlementMode: OrganizationAiProviderEntitlementMode;
    license?: DoryLicense | null;
    billingPlan?: OrganizationPlan | string | null;
}): OrganizationAiProviderCapability {
    if ((options.license ?? getLicenseForServer()) === 'enterprise') {
        return {
            enabled: true,
            source: 'ee-license',
            reason: 'enabled_by_enterprise',
        };
    }

    if (options.entitlementMode === 'cloud-plan' && options.billingPlan === 'pro') {
        return {
            enabled: true,
            source: 'cloud-plan',
            reason: 'enabled_by_pro',
        };
    }

    return {
        enabled: false,
        source: 'none',
        reason: 'requires_upgrade',
    };
}

type GlobalAiProviderEnv = Record<string, string | undefined>;

const GLOBAL_AI_PROVIDER_LABELS: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    'azure-openai': 'Azure OpenAI',
    openrouter: 'OpenRouter',
    google: 'Google Gemini',
    qwen: 'Qwen',
    xai: 'xAI',
    meta: 'Meta',
    'openai-compatible': 'OpenAI Compatible',
    cloudflare: 'Cloudflare Gateway',
    'cloudflare-gateway': 'Cloudflare Gateway',
};

const GLOBAL_AI_PROVIDER_DEFAULT_MODELS: Record<string, string> = {
    openai: 'gpt-4.1-mini',
    anthropic: 'claude-3-5-haiku-latest',
    'azure-openai': 'gpt-4o-mini',
    openrouter: 'openai/gpt-4o-mini',
    google: 'gemini-2.5-flash',
    qwen: 'qwen-turbo',
    xai: 'grok-2-mini',
    meta: 'llama-3.1-8b-instruct',
    'openai-compatible': 'gpt-4o-mini',
    cloudflare: 'gpt-4o-mini',
    'cloudflare-gateway': 'gpt-4o-mini',
};

function hasEnv(env: GlobalAiProviderEnv, key: string): boolean {
    return Boolean(env[key]?.trim());
}

function getGlobalAiProvider(env: GlobalAiProviderEnv): string {
    return (env.DORY_AI_PROVIDER ?? 'openai').trim().toLowerCase();
}

function formatGlobalAiProviderLabel(value: string): string {
    return value
        .split(/[-_\s.]+/)
        .filter(Boolean)
        .map(part => (part.length <= 3 && /\d/.test(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
        .join(' ');
}

function formatGlobalAiModelLabel(value: string): string {
    if (value.toLowerCase().startsWith('gpt-')) {
        return `GPT-${value.slice(4)}`;
    }

    return value;
}

function hasCloudflareGatewayTarget(env: GlobalAiProviderEnv): boolean {
    if (hasEnv(env, 'DORY_AI_CF_ACCOUNT_ID') && hasEnv(env, 'DORY_AI_CF_GATEWAY')) return true;
    if (hasEnv(env, 'DORY_AI_CLOUDFLARE_ACCOUNT_ID') && hasEnv(env, 'DORY_AI_CLOUDFLARE_GATEWAY')) return true;

    const url = env.DORY_AI_URL?.trim() ?? '';
    return url.includes('gateway.ai.cloudflare.com') && url.includes('/compat');
}

export function isGlobalAiProviderConfiguredFromEnv(env: GlobalAiProviderEnv = process.env): boolean {
    const provider = getGlobalAiProvider(env);

    if (provider === 'cloudflare' || provider === 'cloudflare-gateway') {
        return (hasEnv(env, 'DORY_AI_CF_AIG_TOKEN') || hasEnv(env, 'DORY_AI_API_KEY')) && hasCloudflareGatewayTarget(env);
    }

    if (provider === 'openai-compatible') {
        return hasEnv(env, 'DORY_AI_URL');
    }

    if (provider === 'meta' || provider === 'azure-openai' || provider === 'openrouter') {
        return hasEnv(env, 'DORY_AI_API_KEY') && hasEnv(env, 'DORY_AI_URL');
    }

    if (provider === 'openai' || provider === 'anthropic' || provider === 'google' || provider === 'qwen' || provider === 'xai') {
        return hasEnv(env, 'DORY_AI_API_KEY');
    }

    return false;
}

export function getGlobalAiProviderSummaryFromEnv(env: GlobalAiProviderEnv = process.env) {
    const provider = getGlobalAiProvider(env);
    const model = env.DORY_AI_MODEL?.trim() || GLOBAL_AI_PROVIDER_DEFAULT_MODELS[provider] || 'gpt-4.1-mini';

    return {
        provider: GLOBAL_AI_PROVIDER_LABELS[provider] ?? formatGlobalAiProviderLabel(provider),
        model: formatGlobalAiModelLabel(model),
        managedBy: 'Server Admin',
    };
}

export type AiProviderSource = 'system' | 'global' | 'organization' | 'user';
export type AiProviderScopeStatus = 'active' | 'available' | 'enterprise' | 'coming_soon';
export type AiProviderRowStatus = 'active' | 'enabled' | 'disabled' | 'unconfigured';
export type AiProviderManagementMode = 'global_readonly' | 'organization_editable';

export type AiProviderSummary = {
    source: AiProviderSource;
    scope: 'Global' | 'Organization' | 'User';
    provider: string;
    providerLabel: string;
    model: string;
    modelLabel: string;
    displayName: string;
    description: string;
    managedBy: 'Server Admin' | 'Organization Admin' | 'User';
    configured: boolean;
};

export type AiProviderScopeRow = {
    scope: 'Global' | 'Organization' | 'User';
    status: AiProviderScopeStatus;
    description: string;
};

export type AiProviderResolution = {
    currentSource: AiProviderSource;
    globalProvider: AiProviderSummary;
    organizationProvider: AiProviderSummary | null;
    activeProvider: AiProviderSummary;
    fallbackProvider: AiProviderSummary | null;
    scopeRows: AiProviderScopeRow[];
    managementMode: AiProviderManagementMode;
    organizationCapability: OrganizationAiProviderCapability;
};

export type AiProviderListRow = {
    id: string;
    source: 'system' | 'organization';
    displayName: string;
    provider: string;
    providerLabel: string;
    model: string;
    modelLabel: string;
    baseUrl: string | null;
    status: AiProviderRowStatus;
    readOnly: boolean;
    isDefault: boolean;
    description: string;
    keyHint: string | null;
    configured: boolean;
};

export type AiProviderUpgradeTarget = 'enterprise' | 'pro';

export type AiProvidersViewModel = {
    providers: AiProviderListRow[];
    defaultProviderId: 'system' | string;
    organizationProviderCapability: OrganizationAiProviderCapability;
    upgradeTarget: AiProviderUpgradeTarget;
    providerResolution: AiProviderResolution;
};

function buildProviderDisplayName(providerLabel: string, modelLabel: string) {
    return `${providerLabel} · ${modelLabel}`;
}

export function isOrganizationAiProviderConfigured(provider: Pick<OrganizationAiProviderPublic, 'provider' | 'model' | 'baseUrl' | 'hasKey'>): boolean {
    if (!provider.model.trim()) return false;
    if (isAiProviderBaseUrlRequired(provider.provider) && !provider.baseUrl?.trim()) return false;
    if (isAiProviderApiKeyRequired(provider.provider) && !provider.hasKey) return false;
    return true;
}

function getGlobalAiModel(env: GlobalAiProviderEnv): string {
    const provider = getGlobalAiProvider(env);
    return env.DORY_AI_MODEL?.trim() || GLOBAL_AI_PROVIDER_DEFAULT_MODELS[provider] || 'gpt-4.1-mini';
}

function buildGlobalProviderSummary(env: GlobalAiProviderEnv): AiProviderSummary {
    const provider = getGlobalAiProvider(env);
    const model = getGlobalAiModel(env);
    const providerLabel = GLOBAL_AI_PROVIDER_LABELS[provider] ?? formatGlobalAiProviderLabel(provider);
    const modelLabel = formatGlobalAiModelLabel(model);

    return {
        source: 'system',
        scope: 'Global',
        provider,
        providerLabel,
        model,
        modelLabel,
        displayName: buildProviderDisplayName(providerLabel, modelLabel),
        description: 'Globally configured provider managed by server administrator.',
        managedBy: 'Server Admin',
        configured: isGlobalAiProviderConfiguredFromEnv(env),
    };
}

function buildOrganizationProviderSummary(provider: OrganizationAiProviderPublic): AiProviderSummary | null {
    if (!provider.enabled || !isOrganizationAiProviderConfigured(provider)) return null;

    const providerLabel = GLOBAL_AI_PROVIDER_LABELS[provider.provider] ?? formatGlobalAiProviderLabel(provider.provider);
    const modelLabel = formatGlobalAiModelLabel(provider.model);

    return {
        source: 'organization',
        scope: 'Organization',
        provider: provider.provider,
        providerLabel,
        model: provider.model,
        modelLabel,
        displayName: buildProviderDisplayName(providerLabel, modelLabel),
        description: 'Organization-level provider configured for this organization.',
        managedBy: 'Organization Admin',
        configured: true,
    };
}

function buildSystemProviderRow(globalProvider: AiProviderSummary, isDefault: boolean): AiProviderListRow {
    return {
        id: 'system',
        source: 'system',
        displayName: globalProvider.displayName,
        provider: globalProvider.provider,
        providerLabel: globalProvider.providerLabel,
        model: globalProvider.model,
        modelLabel: globalProvider.modelLabel,
        baseUrl: null,
        status: !globalProvider.configured ? 'unconfigured' : isDefault ? 'active' : 'enabled',
        readOnly: true,
        isDefault: isDefault && globalProvider.configured,
        description: 'Configured globally by server administrator.',
        keyHint: null,
        configured: globalProvider.configured,
    };
}

function buildOrganizationProviderRow(provider: OrganizationAiProviderPublic): AiProviderListRow {
    const providerLabel = GLOBAL_AI_PROVIDER_LABELS[provider.provider] ?? formatGlobalAiProviderLabel(provider.provider);
    const modelLabel = formatGlobalAiModelLabel(provider.model);
    const configured = isOrganizationAiProviderConfigured(provider);
    return {
        id: provider.id,
        source: 'organization',
        displayName: buildProviderDisplayName(providerLabel, modelLabel),
        provider: provider.provider,
        providerLabel,
        model: provider.model,
        modelLabel,
        baseUrl: provider.baseUrl,
        status: !configured ? 'unconfigured' : provider.isDefault && provider.enabled ? 'active' : provider.enabled ? 'enabled' : 'disabled',
        readOnly: false,
        isDefault: provider.isDefault && provider.enabled && configured,
        description: 'Custom provider for this organization.',
        keyHint: provider.keyHint,
        configured,
    };
}

export function getAiProviderResolution(options: {
    organizationProviders: OrganizationAiProviderPublic[];
    entitlementMode?: OrganizationAiProviderEntitlementMode;
    license?: DoryLicense | null;
    billingPlan?: OrganizationPlan | string | null;
    env?: GlobalAiProviderEnv;
}): AiProviderResolution {
    const resolvedLicense = options.license ?? getLicenseForServer();
    const entitlementMode = options.entitlementMode ?? 'self-hosted-license';
    const env = options.env ?? process.env;
    const globalProvider = buildGlobalProviderSummary(env);
    const organizationCapability = resolveOrganizationAiProviderCapability({
        entitlementMode,
        license: resolvedLicense,
        billingPlan: options.billingPlan,
    });
    const canUseOrganizationProviders = organizationCapability.enabled;
    const defaultOrganizationProvider = options.organizationProviders?.find(provider => provider.enabled && provider.isDefault) ?? null;
    const organizationProvider = canUseOrganizationProviders && defaultOrganizationProvider ? buildOrganizationProviderSummary(defaultOrganizationProvider) : null;
    const activeProvider = organizationProvider ?? globalProvider;
    const organizationStatus: AiProviderScopeStatus = canUseOrganizationProviders ? (organizationProvider ? 'active' : 'available') : 'enterprise';

    return {
        currentSource: activeProvider.source,
        globalProvider,
        organizationProvider,
        activeProvider,
        fallbackProvider: activeProvider.source === 'organization' ? globalProvider : null,
        managementMode: canUseOrganizationProviders ? 'organization_editable' : 'global_readonly',
        organizationCapability,
        scopeRows: [
            {
                scope: 'Global',
                status: activeProvider.source === 'system' ? 'active' : 'available',
                description: 'Configured via environment variables',
            },
            {
                scope: 'Organization',
                status: organizationStatus,
                description: 'Override AI provider per organization',
            },
            {
                scope: 'User',
                status: 'coming_soon',
                description: 'Personal BYOK configuration',
            },
        ],
    };
}

export function buildAiProvidersViewModel(options: {
    organizationProviders: OrganizationAiProviderPublic[];
    entitlementMode?: OrganizationAiProviderEntitlementMode;
    license?: DoryLicense | null;
    billingPlan?: OrganizationPlan | string | null;
    runtime?: string | null;
    env?: GlobalAiProviderEnv;
}): AiProvidersViewModel {
    const resolution = getAiProviderResolution(options);
    const hasOrganizationDefault = resolution.activeProvider.source === 'organization';
    const organizationRows = options.organizationProviders.map(buildOrganizationProviderRow);
    const defaultProviderId = organizationRows.find(row => row.isDefault && row.status !== 'disabled')?.id ?? 'system';
    const rows = [buildSystemProviderRow(resolution.globalProvider, !hasOrganizationDefault), ...organizationRows];
    const providers = [...rows].sort((left, right) => {
        if (left.id === defaultProviderId) return -1;
        if (right.id === defaultProviderId) return 1;
        return 0;
    });

    return {
        providers,
        defaultProviderId,
        organizationProviderCapability: resolution.organizationCapability,
        upgradeTarget:
            resolution.organizationCapability.source === 'cloud-plan' || options.entitlementMode === 'cloud-plan' || options.runtime === 'desktop' ? 'pro' : 'enterprise',
        providerResolution: resolution,
    };
}

export async function resolveOrganizationAiProviderBillingPlan(db: DBService, organizationId: string): Promise<OrganizationPlan> {
    const billingRecords = (await db.billing.listByReferenceId(organizationId)) as BillingSubscriptionRecord[];
    return billingRecords.some(isActiveProBillingRecord) ? 'pro' : 'hobby';
}

export async function resolveOrganizationAiProviderCapabilityForOrganization(
    db: DBService,
    organizationId: string,
    entitlementMode: OrganizationAiProviderEntitlementMode,
): Promise<OrganizationAiProviderCapability> {
    const license = entitlementMode === 'self-hosted-license' ? getLicenseForServer() : null;
    const billingPlan = entitlementMode === 'cloud-plan' ? await resolveOrganizationAiProviderBillingPlan(db, organizationId) : null;
    return resolveOrganizationAiProviderCapability({ entitlementMode, license, billingPlan });
}

export async function shouldUseOrganizationProviderOverride(db: DBService, organizationId: string): Promise<boolean> {
    const provider = await db.organizationAiProviders.getDefault(organizationId);
    if (!provider || !provider.enabled || !isOrganizationAiProviderConfigured(provider)) return false;

    const capability = await resolveOrganizationAiProviderCapabilityForOrganization(db, organizationId, getOrganizationAiProviderEntitlementModeForServer());
    return capability.enabled;
}

export function getOrganizationAiProviderEntitlementModeForServer(): OrganizationAiProviderEntitlementMode {
    return isBillingEnabledForServer() || isDesktopBillingHandoffAvailableForServer() ? 'cloud-plan' : 'self-hosted-license';
}
