import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

process.env.DS_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');

const { buildOrganizationAiKeyHint, serializeOrganizationAiProvider } = await import('@dory/database/postgres/impl/organization-ai-providers');
const { getLicenseForServer, normalizeLicense } = await import('@dory/shared/runtime');
const {
    AI_PROVIDER_OPTIONS,
    getAiProviderIconSrc,
    getDefaultAiProviderBaseUrl,
    getDefaultAiProviderModel,
    isAiProviderApiKeyRequired,
    isAiProviderModelAllowed,
    isAiProviderAvailable,
} = await import('@dory/ee/ai/provider-options');
const {
    buildAiProvidersViewModel,
    getAiProviderResolution,
    getGlobalAiProviderSummaryFromEnv,
    getOrganizationAiProviderEntitlementModeForServer,
    isGlobalAiProviderConfiguredFromEnv,
    resolveOrganizationAiProviderCapability,
} = await import('@dory/ee/ai/organization-ai-providers');

test('organization AI provider key hints mask secrets', () => {
    assert.equal(buildOrganizationAiKeyHint('sk-test-secret-value'), 'sk-t...alue');
    assert.equal(buildOrganizationAiKeyHint('short'), '*****');
    assert.equal(buildOrganizationAiKeyHint('   '), '');
});

test('serializing organization AI providers exposes only key hints', () => {
    const serialized = serializeOrganizationAiProvider({
        id: 'provider_123',
        organizationId: 'org_123',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyEncrypted: 'encrypted-secret',
        keyHint: 'sk-t...alue',
        enabled: true,
        isDefault: true,
        createdByUserId: 'user_123',
        updatedByUserId: 'user_123',
        createdAt: new Date('2026-05-20T00:00:00.000Z'),
        updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    });

    assert.equal(serialized.id, 'provider_123');
    assert.equal(serialized.hasKey, true);
    assert.equal(serialized.keyHint, 'sk-t...alue');
    assert.equal('apiKeyEncrypted' in serialized, false);
    assert.equal('apiKey' in serialized, false);
});

test('organization provider override is controlled by Enterprise or Pro', () => {
    assert.equal(normalizeLicense('oss'), 'oss');
    assert.equal(normalizeLicense('Enterprise'), 'enterprise');
    assert.equal(normalizeLicense('unknown'), null);
    const originalLicense = process.env.DORY_LICENSE;
    delete process.env.DORY_LICENSE;
    assert.equal(getLicenseForServer(), 'oss');
    process.env.DORY_LICENSE = 'enterprise';
    assert.equal(getLicenseForServer(), 'enterprise');
    if (originalLicense === undefined) {
        delete process.env.DORY_LICENSE;
    } else {
        process.env.DORY_LICENSE = originalLicense;
    }

    assert.deepEqual(resolveOrganizationAiProviderCapability({ entitlementMode: 'self-hosted-license', license: 'enterprise', billingPlan: 'hobby' }), {
        enabled: true,
        source: 'ee-license',
        reason: 'enabled_by_enterprise',
    });
    assert.deepEqual(resolveOrganizationAiProviderCapability({ entitlementMode: 'cloud-plan', license: 'oss', billingPlan: 'pro' }), {
        enabled: true,
        source: 'cloud-plan',
        reason: 'enabled_by_pro',
    });
    assert.deepEqual(resolveOrganizationAiProviderCapability({ entitlementMode: 'cloud-plan', license: 'oss', billingPlan: 'hobby' }), {
        enabled: false,
        source: 'none',
        reason: 'requires_upgrade',
    });
    assert.deepEqual(resolveOrganizationAiProviderCapability({ entitlementMode: 'self-hosted-license', license: 'oss', billingPlan: 'pro' }), {
        enabled: false,
        source: 'none',
        reason: 'requires_upgrade',
    });
    assert.deepEqual(resolveOrganizationAiProviderCapability({ entitlementMode: 'cloud-plan', license: 'enterprise', billingPlan: 'hobby' }), {
        enabled: true,
        source: 'ee-license',
        reason: 'enabled_by_enterprise',
    });
});

test('organization provider entitlement mode follows billing capabilities', () => {
    const previousEnv = {
        DORY_RUNTIME: process.env.DORY_RUNTIME,
        NEXT_PUBLIC_DORY_RUNTIME: process.env.NEXT_PUBLIC_DORY_RUNTIME,
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
        DORY_CLOUD_API_URL: process.env.DORY_CLOUD_API_URL,
        NEXT_PUBLIC_DORY_CLOUD_API_URL: process.env.NEXT_PUBLIC_DORY_CLOUD_API_URL,
        DORY_LICENSE: process.env.DORY_LICENSE,
    };

    const restoreEnv = () => {
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    };

    try {
        delete process.env.DORY_RUNTIME;
        delete process.env.NEXT_PUBLIC_DORY_RUNTIME;
        delete process.env.DORY_CLOUD_API_URL;
        delete process.env.NEXT_PUBLIC_DORY_CLOUD_API_URL;
        process.env.STRIPE_SECRET_KEY = 'sk_test';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
        process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_test';
        assert.equal(getOrganizationAiProviderEntitlementModeForServer(), 'cloud-plan');

        process.env.DORY_LICENSE = 'oss';
        assert.equal(getOrganizationAiProviderEntitlementModeForServer(), 'self-hosted-license');
        delete process.env.DORY_LICENSE;

        delete process.env.STRIPE_SECRET_KEY;
        delete process.env.STRIPE_WEBHOOK_SECRET;
        delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
        assert.equal(getOrganizationAiProviderEntitlementModeForServer(), 'self-hosted-license');

        process.env.DORY_RUNTIME = 'desktop';
        process.env.DORY_CLOUD_API_URL = 'https://app.getdory.dev/api';
        assert.equal(getOrganizationAiProviderEntitlementModeForServer(), 'cloud-plan');
    } finally {
        restoreEnv();
    }
});

test('global AI provider env detection follows provider requirements', () => {
    assert.equal(isGlobalAiProviderConfiguredFromEnv({ DORY_AI_PROVIDER: 'openai', DORY_AI_API_KEY: 'sk-test' }), true);
    assert.equal(isGlobalAiProviderConfiguredFromEnv({ DORY_AI_PROVIDER: 'qwen', DORY_AI_API_KEY: 'sk-test' }), true);
    assert.equal(isGlobalAiProviderConfiguredFromEnv({ DORY_AI_PROVIDER: 'openai-compatible', DORY_AI_API_KEY: 'sk-test' }), false);
    assert.equal(isGlobalAiProviderConfiguredFromEnv({ DORY_AI_PROVIDER: 'openai-compatible', DORY_AI_URL: 'http://localhost:11434/v1' }), true);
    assert.equal(isGlobalAiProviderConfiguredFromEnv({ DORY_AI_PROVIDER: 'openrouter', DORY_AI_API_KEY: 'sk-test', DORY_AI_URL: 'https://openrouter.ai/api/v1' }), true);
    assert.equal(isGlobalAiProviderConfiguredFromEnv({ DORY_AI_PROVIDER: 'self-hosted', DORY_AI_URL: 'http://localhost:11434/v1' }), false);
    assert.equal(isGlobalAiProviderConfiguredFromEnv({ DORY_AI_PROVIDER: 'cloudflare', DORY_AI_API_KEY: 'cf-token' }), false);
    assert.equal(
        isGlobalAiProviderConfiguredFromEnv({
            DORY_AI_PROVIDER: 'cloudflare',
            DORY_AI_CF_AIG_TOKEN: 'cf-token',
            DORY_AI_CF_ACCOUNT_ID: 'account',
            DORY_AI_CF_GATEWAY: 'gateway',
        }),
        true,
    );
});

test('global AI provider summary exposes display-safe provider and model labels', () => {
    assert.deepEqual(getGlobalAiProviderSummaryFromEnv({ DORY_AI_PROVIDER: 'openai', DORY_AI_MODEL: 'gpt-4.1-mini' }), {
        provider: 'OpenAI',
        model: 'GPT-4.1-mini',
        managedBy: 'Server Admin',
    });
    assert.deepEqual(getGlobalAiProviderSummaryFromEnv({ DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen3-max' }), {
        provider: 'Qwen',
        model: 'qwen3-max',
        managedBy: 'Server Admin',
    });
});

test('AI provider model options are provider scoped', () => {
    assert.equal(getDefaultAiProviderModel('qwen'), 'qwen3.7-max');
    assert.equal(isAiProviderModelAllowed('qwen', 'qwen3.7-plus-preview'), true);
    assert.equal(isAiProviderModelAllowed('qwen', 'qwen3.6-max-preview'), true);
    assert.equal(isAiProviderModelAllowed('qwen', 'qwen-plus'), true);
    assert.equal(isAiProviderModelAllowed('qwen', 'gpt-4o-mini'), false);
    assert.equal(isAiProviderModelAllowed('openai', 'gpt-5.4-mini'), true);
    assert.equal(getDefaultAiProviderModel('openai-compatible'), '');
    assert.equal(getDefaultAiProviderModel('azure-openai'), '');
    assert.equal(isAiProviderModelAllowed('openai-compatible', 'custom-model-id'), true);
    assert.equal(isAiProviderModelAllowed('openrouter', 'anthropic/claude-sonnet-4'), true);
    assert.equal(isAiProviderAvailable('cloudflare-gateway'), false);
    assert.equal(isAiProviderAvailable('azure-openai'), true);
    assert.equal(isAiProviderAvailable('openrouter'), true);
    assert.equal(isAiProviderAvailable('self-hosted' as never), false);
    assert.equal(isAiProviderApiKeyRequired('openai-compatible'), false);
    assert.equal(isAiProviderApiKeyRequired('openai'), true);
    assert.equal(getDefaultAiProviderBaseUrl('openai'), 'https://api.openai.com/v1');
    assert.equal(getDefaultAiProviderBaseUrl('qwen'), 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    assert.equal(getDefaultAiProviderBaseUrl('openrouter'), 'https://openrouter.ai/api/v1');
    assert.equal(getDefaultAiProviderBaseUrl('openai-compatible'), '');
});

test('AI provider options expose local icons', () => {
    for (const option of AI_PROVIDER_OPTIONS) {
        assert.equal(option.iconSrc.startsWith('/images/logos/ai-providers/'), true);
        assert.equal(existsSync(join(process.cwd(), 'public', option.iconSrc)), true, option.value);
    }

    assert.equal(getAiProviderIconSrc('qwen'), '/images/logos/ai-providers/qwen.svg');
    assert.equal(getAiProviderIconSrc('openai-compatible'), '/images/logos/ai-providers/openai-compatible.svg');
    assert.equal(getAiProviderIconSrc('cloudflare-gateway'), '/images/logos/ai-providers/cloudflare-gateway.svg');
});

test('provider resolution keeps system active in OSS', () => {
    const resolution = getAiProviderResolution({
        organizationProviders: [],
        license: 'oss',
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen-plus', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(resolution.currentSource, 'system');
    assert.equal(resolution.activeProvider.displayName, 'Qwen · qwen-plus');
    assert.equal(resolution.managementMode, 'global_readonly');
    assert.deepEqual(
        resolution.scopeRows.map(row => [row.scope, row.status]),
        [
            ['Global', 'active'],
            ['Organization', 'enterprise'],
            ['User', 'coming_soon'],
        ],
    );
});

test('AI providers view model marks only the effective default in OSS', () => {
    const viewModel = buildAiProvidersViewModel({
        organizationProviders: [
            {
                id: 'provider_openai',
                organizationId: 'org_123',
                provider: 'openai',
                model: 'gpt-5.4-mini',
                baseUrl: 'https://api.openai.com/v1',
                enabled: true,
                isDefault: true,
                hasKey: true,
                keyHint: 'sk-o...test',
                createdAt: '2026-05-20T00:00:00.000Z',
                updatedAt: '2026-05-20T00:00:00.000Z',
            },
        ],
        license: 'oss',
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen-plus', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(viewModel.defaultProviderId, 'system');
    assert.deepEqual(
        viewModel.providers.map(provider => [provider.id, provider.status, provider.isDefault]),
        [
            ['system', 'active', true],
            ['provider_openai', 'enabled', false],
        ],
    );
});

test('provider resolution keeps system active in Enterprise without organization default', () => {
    const resolution = getAiProviderResolution({
        organizationProviders: [],
        license: 'enterprise',
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen-plus', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(resolution.currentSource, 'system');
    assert.equal(resolution.fallbackProvider, null);
    assert.equal(resolution.managementMode, 'organization_editable');
    assert.deepEqual(
        resolution.scopeRows.map(row => [row.scope, row.status]),
        [
            ['Global', 'active'],
            ['Organization', 'available'],
            ['User', 'coming_soon'],
        ],
    );
});

test('provider resolution makes enabled organization default active in Enterprise', () => {
    const resolution = getAiProviderResolution({
        organizationProviders: [
            {
                id: 'provider_anthropic',
                organizationId: 'org_123',
                provider: 'anthropic',
                model: 'claude-sonnet-4-6',
                baseUrl: 'https://api.anthropic.com/v1',
                enabled: true,
                isDefault: true,
                hasKey: true,
                keyHint: 'sk-a...test',
                createdAt: '2026-05-20T00:00:00.000Z',
                updatedAt: '2026-05-20T00:00:00.000Z',
            },
        ],
        license: 'enterprise',
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen-plus', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(resolution.currentSource, 'organization');
    assert.equal(resolution.activeProvider.displayName, 'Anthropic · claude-sonnet-4-6');
    assert.equal(resolution.fallbackProvider?.displayName, 'Qwen · qwen-plus');
    assert.deepEqual(
        resolution.scopeRows.map(row => [row.scope, row.status]),
        [
            ['Global', 'available'],
            ['Organization', 'active'],
            ['User', 'coming_soon'],
        ],
    );
});

test('provider resolution makes organization default active on Desktop Pro', () => {
    const resolution = getAiProviderResolution({
        organizationProviders: [
            {
                id: 'provider_openai',
                organizationId: 'org_123',
                provider: 'openai',
                model: 'gpt-5.4-mini',
                baseUrl: 'https://api.openai.com/v1',
                enabled: true,
                isDefault: true,
                hasKey: true,
                keyHint: 'sk-o...test',
                createdAt: '2026-05-20T00:00:00.000Z',
                updatedAt: '2026-05-20T00:00:00.000Z',
            },
        ],
        entitlementMode: 'cloud-plan',
        license: 'oss',
        billingPlan: 'pro',
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen-plus', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(resolution.currentSource, 'organization');
    assert.equal(resolution.managementMode, 'organization_editable');
    assert.equal(resolution.activeProvider.displayName, 'OpenAI · GPT-5.4-mini');
});

test('provider resolution falls back to system when default is disabled or missing a key', () => {
    const organizationProviders = [
        {
            id: 'provider_disabled',
            organizationId: 'org_123',
            provider: 'openai' as const,
            model: 'gpt-5.4-mini',
            baseUrl: 'https://api.openai.com/v1',
            enabled: false,
            isDefault: true,
            hasKey: true,
            keyHint: 'sk-d...bled',
            createdAt: '2026-05-20T00:00:00.000Z',
            updatedAt: '2026-05-20T00:00:00.000Z',
        },
        {
            id: 'provider_unconfigured',
            organizationId: 'org_123',
            provider: 'anthropic' as const,
            model: 'claude-sonnet-4-6',
            baseUrl: 'https://api.anthropic.com/v1',
            enabled: true,
            isDefault: true,
            hasKey: false,
            keyHint: null,
            createdAt: '2026-05-20T00:00:00.000Z',
            updatedAt: '2026-05-20T00:00:00.000Z',
        },
    ];

    const resolution = getAiProviderResolution({
        organizationProviders,
        license: 'enterprise',
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen-plus', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(resolution.currentSource, 'system');
    assert.equal(resolution.activeProvider.displayName, 'Qwen · qwen-plus');
});

test('OpenAI-compatible organization providers can use local endpoints without API keys', () => {
    const viewModel = buildAiProvidersViewModel({
        organizationProviders: [
            {
                id: 'provider_local',
                organizationId: 'org_123',
                provider: 'openai-compatible' as const,
                model: 'llama3.1',
                baseUrl: 'http://localhost:11434/v1',
                enabled: true,
                isDefault: true,
                hasKey: false,
                keyHint: null,
                createdAt: '2026-05-20T00:00:00.000Z',
                updatedAt: '2026-05-20T00:00:00.000Z',
            },
        ],
        license: 'enterprise',
        runtime: 'web',
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen-plus', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(viewModel.defaultProviderId, 'provider_local');
    assert.equal(viewModel.providers[0]?.id, 'provider_local');
    assert.equal(viewModel.providerResolution.currentSource, 'organization');
    assert.equal(viewModel.providers[0]?.status, 'active');
    assert.equal(viewModel.providers[0]?.configured, true);
});

test('AI providers view model lists system plus organization providers with default state', () => {
    const viewModel = buildAiProvidersViewModel({
        organizationProviders: [
            {
                id: 'provider_openai',
                organizationId: 'org_123',
                provider: 'openai' as const,
                model: 'gpt-5.4-mini',
                baseUrl: 'https://api.openai.com/v1',
                enabled: true,
                isDefault: true,
                hasKey: true,
                keyHint: 'sk-o...enai',
                createdAt: '2026-05-20T00:00:00.000Z',
                updatedAt: '2026-05-20T00:00:00.000Z',
            },
            {
                id: 'provider_anthropic',
                organizationId: 'org_123',
                provider: 'anthropic' as const,
                model: 'claude-sonnet-4-6',
                baseUrl: 'https://api.anthropic.com/v1',
                enabled: false,
                isDefault: false,
                hasKey: true,
                keyHint: 'sk-a...opic',
                createdAt: '2026-05-20T00:00:00.000Z',
                updatedAt: '2026-05-20T00:00:00.000Z',
            },
        ],
        entitlementMode: 'cloud-plan',
        license: 'oss',
        billingPlan: 'pro',
        runtime: 'desktop',
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_MODEL: 'qwen-plus', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(viewModel.organizationProviderCapability.enabled, true);
    assert.equal(viewModel.upgradeTarget, 'pro');
    assert.equal(viewModel.defaultProviderId, 'provider_openai');
    assert.deepEqual(
        viewModel.providers.map(provider => [provider.id, provider.source, provider.status, provider.isDefault]),
        [
            ['provider_openai', 'organization', 'active', true],
            ['system', 'system', 'enabled', false],
            ['provider_anthropic', 'organization', 'disabled', false],
        ],
    );
});
