import 'server-only';

import type { LanguageModel } from 'ai';
import type { NextRequest } from 'next/server';

import { USE_CLOUD_AI } from '@/app/config/app';
import { createDoryCloudProxyLanguageModel } from '@/lib/ai/agents/cloud-proxy-model';
import { buildCloudForwardHeaders } from '@/lib/ai/execution/cloud-route-proxy';
import { assertAiExecutionTargetHasModel, resolveAiExecutionTargetForOrganization, type AiExecutionTarget } from '@/lib/ai/model/execution';
import type { ModelRole } from '@/lib/ai/model/types';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';

export type AiActionModelTarget<R extends ModelRole = ModelRole> = Omit<AiExecutionTarget<R>, 'model'> & {
    model: LanguageModel;
};

export async function resolveAiActionModel<R extends ModelRole>(
    role: R,
    options: {
        organizationId?: string | null;
        modelName?: string | null;
        defaultModelName?: string | null;
        req?: NextRequest | null;
    } = {},
): Promise<AiActionModelTarget<R>> {
    const cloudApiBaseUrl = getCloudApiBaseUrl();
    const target = await resolveAiExecutionTargetForOrganization(role, {
        organizationId: options.organizationId ?? null,
        modelName: options.modelName ?? null,
        defaultModelName: options.defaultModelName ?? undefined,
        useCloudAi: USE_CLOUD_AI,
        cloudApiBaseUrl,
        allowCloudProxy: Boolean(options.req),
        includeModel: true,
    });

    if (target.shouldUseCloudProxy) {
        if (!options.req || !cloudApiBaseUrl) {
            throw new Error('Cloud AI proxy is not available for this action context.');
        }

        return {
            ...target,
            model: createDoryCloudProxyLanguageModel({
                baseUrl: cloudApiBaseUrl,
                headers: buildCloudForwardHeaders(options.req, cloudApiBaseUrl),
                model: target.modelName,
                role,
            }) as LanguageModel,
        };
    }

    assertAiExecutionTargetHasModel(target);
    return target;
}
