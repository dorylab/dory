import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { OrganizationAiProviderResolved } from '@dory/database/postgres/impl/organization-ai-providers';
import { normalizeAiProxyBody, resolveAiRouteDispatchPolicy } from '../../lib/ai/execution/route-dispatch-policy';
import { isOrganizationProviderReadyForExecution, resolveAiExecutionPolicy } from '../../lib/ai/model/execution-policy';

const enabledCapability = {
    enabled: true,
    source: 'ee-license' as const,
    reason: 'enabled_by_enterprise' as const,
};

const disabledCapability = {
    enabled: false,
    source: 'none' as const,
    reason: 'requires_upgrade' as const,
};

function provider(input: Partial<OrganizationAiProviderResolved> = {}): OrganizationAiProviderResolved {
    return {
        id: 'provider_qwen',
        organizationId: 'org_123',
        provider: 'qwen',
        model: 'qwen3.5-flash',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-qwen',
        enabled: true,
        isDefault: true,
        hasKey: true,
        keyHint: 'sk-q...qwen',
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
        ...input,
    };
}

test('organization default provider wins without DORY_AI env and disables cloud proxy', () => {
    const decision = resolveAiExecutionPolicy({
        organizationProvider: provider(),
        organizationCapability: enabledCapability,
        requestedModel: 'gpt-4o-mini',
        defaultModel: 'gpt-4.1-mini',
        useCloudAi: true,
        cloudApiBaseUrl: 'https://app.getdory.dev/api',
        allowCloudProxy: true,
        env: {},
    });

    assert.equal(decision.source, 'organization');
    assert.equal(decision.providerKey, 'qwen');
    assert.equal(decision.modelName, 'qwen3.5-flash');
    assert.equal(decision.requestedModel, null);
    assert.equal(decision.shouldUseCloudProxy, false);
    assert.equal(decision.gateway, 'direct');
    assert.equal(decision.organizationProviderId, 'provider_qwen');
});

test('OpenAI Compatible organization providers can execute without API keys', () => {
    const compatibleProvider = provider({
        id: 'provider_local',
        provider: 'openai-compatible',
        model: 'llama3.1',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: null,
        hasKey: false,
        keyHint: null,
    });

    assert.equal(isOrganizationProviderReadyForExecution(compatibleProvider), true);
    const decision = resolveAiExecutionPolicy({
        organizationProvider: compatibleProvider,
        organizationCapability: enabledCapability,
        requestedModel: null,
        defaultModel: 'gpt-4.1-mini',
        env: {},
    });

    assert.equal(decision.source, 'organization');
    assert.equal(decision.providerKey, 'openai-compatible');
    assert.equal(decision.modelName, 'llama3.1');
});

test('incomplete, disabled, or unauthorized organization providers fall back to global', () => {
    const missingKeyDecision = resolveAiExecutionPolicy({
        organizationProvider: provider({ apiKey: null, hasKey: false, keyHint: null }),
        organizationCapability: enabledCapability,
        requestedModel: 'gpt-4o-mini',
        defaultModel: 'gpt-4.1-mini',
        env: { DORY_AI_PROVIDER: 'openai' },
    });
    assert.equal(missingKeyDecision.source, 'global');
    assert.equal(missingKeyDecision.modelName, 'gpt-4o-mini');
    assert.equal(missingKeyDecision.providerKey, 'openai');

    const disabledDecision = resolveAiExecutionPolicy({
        organizationProvider: provider({ enabled: false }),
        organizationCapability: enabledCapability,
        requestedModel: null,
        defaultModel: 'gpt-4.1-mini',
        env: { DORY_AI_PROVIDER: 'qwen' },
    });
    assert.equal(disabledDecision.source, 'global');
    assert.equal(disabledDecision.providerKey, 'qwen');

    const unauthorizedDecision = resolveAiExecutionPolicy({
        organizationProvider: provider(),
        organizationCapability: disabledCapability,
        requestedModel: null,
        defaultModel: 'gpt-4.1-mini',
        env: { DORY_AI_PROVIDER: 'openai' },
    });
    assert.equal(unauthorizedDecision.source, 'global');
});

test('cloud proxy is selected only for global execution when cloud AI is configured', () => {
    const decision = resolveAiExecutionPolicy({
        organizationProvider: null,
        organizationCapability: enabledCapability,
        requestedModel: 'gpt-4o-mini',
        defaultModel: 'gpt-4.1-mini',
        useCloudAi: true,
        cloudApiBaseUrl: 'https://app.getdory.dev/api',
        allowCloudProxy: true,
        env: {},
    });

    assert.equal(decision.source, 'global');
    assert.equal(decision.shouldUseCloudProxy, true);
    assert.equal(decision.requestedModel, null);
    assert.equal(decision.modelName, 'gpt-4.1-mini');
});

test('self-hosted global execution keeps requested model and provider env', () => {
    const decision = resolveAiExecutionPolicy({
        organizationProvider: null,
        organizationCapability: null,
        requestedModel: 'qwen-plus',
        defaultModel: 'qwen-turbo',
        useCloudAi: false,
        cloudApiBaseUrl: null,
        allowCloudProxy: true,
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.equal(decision.source, 'global');
    assert.equal(decision.shouldUseCloudProxy, false);
    assert.equal(decision.providerKey, 'qwen');
    assert.equal(decision.requestedModel, 'qwen-plus');
    assert.equal(decision.modelName, 'qwen-plus');
});

test('global Cloudflare Gateway ignores client model overrides and uses the preset model', () => {
    const decision = resolveAiExecutionPolicy({
        organizationProvider: null,
        organizationCapability: null,
        requestedModel: 'openai/gpt-4o-mini',
        defaultModel: 'gpt-4o-mini',
        useCloudAi: false,
        cloudApiBaseUrl: null,
        allowCloudProxy: true,
        env: {
            DORY_AI_PROVIDER: 'cloudflare',
            DORY_AI_URL: 'https://gateway.ai.cloudflare.com/v1/account/gateway/compat',
        },
    });

    assert.equal(decision.source, 'global');
    assert.equal(decision.gateway, 'cloudflare');
    assert.equal(decision.requestedModel, null);
    assert.equal(decision.modelName, 'gpt-4o-mini');
});

test('route dispatch keeps organization execution local and forwards its provider model', () => {
    const decision = resolveAiExecutionPolicy({
        organizationProvider: provider(),
        organizationCapability: enabledCapability,
        requestedModel: 'gpt-4o-mini',
        defaultModel: 'gpt-4.1-mini',
        useCloudAi: true,
        cloudApiBaseUrl: 'https://app.getdory.dev/api',
        allowCloudProxy: true,
        env: {},
    });

    const dispatch = resolveAiRouteDispatchPolicy(decision);

    assert.equal(dispatch.transport, 'local');
    assert.equal(dispatch.forwardedModel, 'qwen3.5-flash');
});

test('route dispatch clears forwarded model only for cloud transport', () => {
    const cloudDecision = resolveAiExecutionPolicy({
        organizationProvider: null,
        organizationCapability: enabledCapability,
        requestedModel: 'gpt-4o-mini',
        defaultModel: 'gpt-4.1-mini',
        useCloudAi: true,
        cloudApiBaseUrl: 'https://app.getdory.dev/api',
        allowCloudProxy: true,
        env: {},
    });
    const localDecision = resolveAiExecutionPolicy({
        organizationProvider: null,
        organizationCapability: null,
        requestedModel: 'qwen-plus',
        defaultModel: 'qwen-turbo',
        useCloudAi: false,
        cloudApiBaseUrl: null,
        allowCloudProxy: true,
        env: { DORY_AI_PROVIDER: 'qwen', DORY_AI_API_KEY: 'sk-test' },
    });

    assert.deepEqual(resolveAiRouteDispatchPolicy(cloudDecision), {
        transport: 'cloud',
        forwardedModel: null,
    });
    assert.deepEqual(resolveAiRouteDispatchPolicy(localDecision), {
        transport: 'local',
        forwardedModel: 'qwen-plus',
    });
});

test('proxy body normalization clears client model overrides before cloud forwarding', () => {
    assert.deepEqual(
        normalizeAiProxyBody(
            {
                model: 'gpt-4o-mini',
                messages: [],
            },
            'default',
        ),
        {
            model: null,
            messages: [],
        },
    );

    assert.deepEqual(
        normalizeAiProxyBody(
            {
                model: 'gpt-4o-mini',
                input: {
                    model: 'gpt-4o-mini',
                    sql: 'select 1',
                },
            },
            'copilot-action',
        ),
        {
            model: null,
            input: {
                model: null,
                sql: 'select 1',
            },
        },
    );
});

test('AI routes delegate transport decisions to route dispatch helpers', () => {
    const guardedRoutes = [
        '../../app/api/ai/stream/route.ts',
        '../../app/api/chat/route.ts',
        '../../app/api/copilot/action/inline-ask/route.ts',
        '../../app/api/copilot/action/route.ts',
    ];
    const forbiddenRouteSnippets = [
        'proxyAiRouteIfNeeded',
        'proxyCloudAiRoute',
        'getCloudApiBaseUrl',
        'shouldUseCloudProxy',
        'resolveAiExecutionTargetForOrganization',
        'USE_CLOUD_AI',
        'buildCloudForwardHeaders',
    ];

    for (const route of guardedRoutes) {
        const source = readFileSync(new URL(route, import.meta.url), 'utf8');
        for (const snippet of forbiddenRouteSnippets) {
            assert.equal(source.includes(snippet), false, `${route} should not reference ${snippet}`);
        }
    }
});

test('model proxy endpoints explicitly disable recursive cloud proxying', () => {
    const modelRoutes = ['../../app/api/ai/model/generate/route.ts', '../../app/api/ai/model/stream/route.ts'];

    for (const route of modelRoutes) {
        const source = readFileSync(new URL(route, import.meta.url), 'utf8');
        assert.equal(source.includes('allowCloudProxy: false'), true, `${route} should force local model execution`);
    }
});

test('unified AI execution resolver owns cloud runtime, language model, and route proxy decisions', () => {
    const source = readFileSync(new URL('../../lib/ai/execution/resolver.ts', import.meta.url), 'utf8');

    for (const snippet of [
        'USE_CLOUD_AI',
        'getCloudApiBaseUrl',
        'resolveAiLanguageModel',
        'resolveAiRouteProxy',
        'createDoryCloudProxyLanguageModel',
        'allowCloudProxy: options.allowCloudProxy ?? Boolean(options.req)',
        'defaultModelName: options.defaultModelName',
    ]) {
        assert.equal(source.includes(snippet), true, `resolver should include ${snippet}`);
    }
});

test('cloud language model proxy forwards only explicit forwarded model', () => {
    const source = readFileSync(new URL('../../lib/ai/execution/resolver.ts', import.meta.url), 'utf8');

    assert.equal(source.includes('model: execution.forwardedModel'), true);
    assert.equal(source.includes('model: execution.modelName'), false);
});

test('route dispatch remains a thin compatibility wrapper over unified resolver', () => {
    const source = readFileSync(new URL('../../lib/ai/execution/route-dispatch.ts', import.meta.url), 'utf8');

    for (const forbidden of ['USE_CLOUD_AI', 'getCloudApiBaseUrl', 'createDoryCloudProxyLanguageModel', 'buildCloudForwardHeaders']) {
        assert.equal(source.includes(forbidden), false, `route dispatch should not reference ${forbidden}`);
    }
    assert.equal(source.includes('resolveAiRouteProxy'), true);
    assert.equal(source.includes('requireLocalAiModel'), true);
});

test('cloud route proxy is a low-level fetch helper without runtime policy reads', () => {
    const source = readFileSync(new URL('../../lib/ai/execution/cloud-route-proxy.ts', import.meta.url), 'utf8');

    assert.equal(source.includes('USE_CLOUD_AI'), false);
    assert.equal(source.includes('getCloudApiBaseUrl'), false);
    assert.equal(source.includes('proxyCloudAiRoute'), true);
});

test('action and cache AI callers use unified language model resolver', () => {
    const callers = [
        '../../lib/actions/server/domains/ai/tab-title.ts',
        '../../lib/ai/runtime/features/table-summary.ts',
        '../../lib/ai/runtime/features/column-tagging.ts',
        '../../lib/ai/runtime/features/schema-explanations.ts',
        '../../lib/copilot/action/server/llm-json.ts',
        '../../lib/ai/agents/model.ts',
    ];

    for (const caller of callers) {
        const source = readFileSync(new URL(caller, import.meta.url), 'utf8');
        assert.equal(source.includes("from '@/lib/ai/execution/action-model'"), false, `${caller} should not import action-model`);
        assert.equal(source.includes("from '@/lib/ai/execution/resolver'"), true, `${caller} should import unified resolver`);
    }
});

test('table summary passes fast/default preset through defaultModelName', () => {
    const source = readFileSync(new URL('../../lib/ai/runtime/features/table-summary.ts', import.meta.url), 'utf8');

    assert.equal(source.includes("resolveModelName('table_summary', { variant: colList.length > 50 ? 'fast' : 'default' })"), true);
    assert.equal(source.includes('defaultModelName'), true);
});
