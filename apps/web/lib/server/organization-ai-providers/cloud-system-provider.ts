import 'server-only';

import type { DBService } from '@dory/database';
import { buildOrganizationAiProvidersPayload } from '@dory/ee/ai/organization-ai-provider-payload';
import { getGlobalAiProviderStatusFromEnv, type AiProviderSummary, type OrganizationAiProviderEntitlementMode, type OrganizationPlan } from '@dory/ee/ai/organization-ai-providers';
import { getRuntimeForServer } from '@dory/shared/runtime';
import { fetchDesktopCloud } from '@/lib/server/desktop-cloud';
import { getLocalAiStatus } from '@/lib/server/local-ai/detection';

const CLOUD_SYSTEM_PROVIDER_STATUS_PATH = '/api/organization/ai-providers/system-status';
const CLOUD_AI_PROVIDERS_PATH = '/api/organization/ai-providers';

type BuildPayloadOptions = {
    db: DBService;
    organizationId: string;
    canManage: boolean;
    entitlementMode?: OrganizationAiProviderEntitlementMode;
    billingPlan?: OrganizationPlan | string | null;
    globalProvider?: AiProviderSummary | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function isAiProviderSummary(value: unknown): value is AiProviderSummary {
    if (!isRecord(value)) return false;

    return (
        value.source === 'system' &&
        value.scope === 'Global' &&
        typeof value.provider === 'string' &&
        typeof value.providerLabel === 'string' &&
        typeof value.model === 'string' &&
        typeof value.modelLabel === 'string' &&
        typeof value.displayName === 'string' &&
        typeof value.description === 'string' &&
        value.managedBy === 'Server Admin' &&
        typeof value.configured === 'boolean'
    );
}

function summaryFromSystemRow(row: unknown): AiProviderSummary | null {
    if (!isRecord(row) || row.source !== 'system') return null;

    const provider = asString(row.provider);
    const providerLabel = asString(row.providerLabel);
    const model = asString(row.model);
    const modelLabel = asString(row.modelLabel) ?? model;
    const configured = asBoolean(row.configured) ?? row.status !== 'unconfigured';

    if (!provider || !providerLabel || !model || !modelLabel) return null;

    return {
        source: 'system',
        scope: 'Global',
        provider,
        providerLabel,
        model,
        modelLabel,
        displayName: asString(row.displayName) ?? `${providerLabel} · ${modelLabel}`,
        description: asString(row.description) ?? 'Globally configured provider managed by server administrator.',
        managedBy: 'Server Admin',
        configured,
    };
}

function readCloudSystemProvider(payload: unknown): AiProviderSummary | null {
    if (!isRecord(payload) || payload.code !== 0 || !isRecord(payload.data)) return null;

    if (isAiProviderSummary(payload.data.globalProvider)) {
        return payload.data.globalProvider;
    }

    if (isRecord(payload.data.providerResolution) && isAiProviderSummary(payload.data.providerResolution.globalProvider)) {
        return payload.data.providerResolution.globalProvider;
    }

    if (Array.isArray(payload.data.providers)) {
        const systemRow = payload.data.providers.find(row => isRecord(row) && row.source === 'system');
        return summaryFromSystemRow(systemRow);
    }

    return null;
}

async function fetchCloudSystemProvider(pathname: string): Promise<AiProviderSummary | null> {
    const cloudResponse = await fetchDesktopCloud(pathname);
    if (cloudResponse.state !== 'available' || !cloudResponse.response.ok) {
        return null;
    }

    const payload = await cloudResponse.response.json().catch(() => null);
    return readCloudSystemProvider(payload);
}

export async function resolveDesktopCloudGlobalAiProvider(): Promise<AiProviderSummary | null> {
    return (await fetchCloudSystemProvider(CLOUD_SYSTEM_PROVIDER_STATUS_PATH)) ?? (await fetchCloudSystemProvider(CLOUD_AI_PROVIDERS_PATH));
}

export async function resolveGlobalAiProviderForRequest(): Promise<AiProviderSummary | null> {
    if (getRuntimeForServer() !== 'desktop') {
        return null;
    }

    const cloudProvider = await resolveDesktopCloudGlobalAiProvider();
    return (
        cloudProvider ?? {
            ...getGlobalAiProviderStatusFromEnv(),
            configured: false,
        }
    );
}

export async function buildOrganizationAiProvidersPayloadForRequest(options: BuildPayloadOptions) {
    const globalProvider = options.globalProvider ?? (await resolveGlobalAiProviderForRequest());
    const payload = await buildOrganizationAiProvidersPayload({
        ...options,
        globalProvider,
    });

    return {
        ...payload,
        localAiStatus: await getLocalAiStatus({
            db: options.db,
            organizationId: options.organizationId,
        }),
    };
}

export function getLocalSystemAiProviderStatus(): AiProviderSummary {
    return getGlobalAiProviderStatusFromEnv();
}
