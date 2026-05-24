import 'server-only';

import type { NextRequest } from 'next/server';
import type { DBService } from '@dory/database';
import { USE_CLOUD_AI } from '@/app/config/app';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { isMissingAiEnvError } from '@/lib/ai/errors';
import {
    assertAiExecutionTargetHasModel,
    resolveAiExecutionTargetForOrganization,
    type AiExecutionTarget,
} from '@/lib/ai/model/execution';
import type { ModelRole } from '@/lib/ai/model/types';
import { buildCloudForwardHeaders, proxyAiRouteIfNeeded } from './cloud-route-proxy';
import { normalizeAiProxyBody, resolveAiRouteDispatchPolicy, type AiRouteProxyBodyMode } from './route-dispatch-policy';

type AiProxyBodyBuilder<R extends ModelRole> = (execution: AiExecutionTarget<R>) => Promise<unknown> | unknown;

export type AiRouteProxyOptions<R extends ModelRole> = {
    pathname: string;
    body?: unknown;
    buildBody?: AiProxyBodyBuilder<R>;
    bodyMode?: AiRouteProxyBodyMode;
};

export type ResolveAiRouteExecutionOptions<R extends ModelRole> = {
    req: NextRequest;
    db?: DBService | null;
    organizationId?: string | null;
    role: R;
    requestedModel?: string | null;
    defaultModelName?: string | null;
    allowCloudProxy?: boolean;
    includeModel?: boolean;
    proxy?: AiRouteProxyOptions<R>;
};

export type AiRouteExecution<R extends ModelRole = ModelRole> = AiExecutionTarget<R> & {
    proxiedResponse: Response | null;
    transport: 'cloud' | 'local';
    forwardedModel: string | null;
    cloudApiBaseUrl: string | null;
};

export type AiRouteForwardRequest = {
    url: string;
    headers: Headers;
    transport: 'cloud' | 'local';
    forwardedModel: string | null;
};

async function resolveProxyBody<R extends ModelRole>(proxy: AiRouteProxyOptions<R>, execution: AiExecutionTarget<R>): Promise<unknown | undefined> {
    if (proxy.buildBody) {
        return normalizeAiProxyBody(await proxy.buildBody(execution), proxy.bodyMode);
    }

    if (!('body' in proxy)) return undefined;

    return normalizeAiProxyBody(proxy.body, proxy.bodyMode);
}

function resolveRequestOrigin(req: NextRequest): string {
    try {
        return new URL(req.url).origin;
    } catch {
        return 'http://localhost:3000';
    }
}

export async function resolveAiRouteExecution<R extends ModelRole>(options: ResolveAiRouteExecutionOptions<R>): Promise<AiRouteExecution<R>> {
    const cloudApiBaseUrl = getCloudApiBaseUrl();
    const execution = await resolveAiExecutionTargetForOrganization(options.role, {
        db: options.db,
        organizationId: options.organizationId ?? null,
        modelName: options.requestedModel ?? null,
        defaultModelName: options.defaultModelName,
        useCloudAi: USE_CLOUD_AI,
        cloudApiBaseUrl,
        allowCloudProxy: options.allowCloudProxy,
        includeModel: options.includeModel,
    });
    const dispatch = resolveAiRouteDispatchPolicy(execution);

    let proxiedResponse: Response | null = null;
    if (execution.shouldUseCloudProxy && options.proxy) {
        const body = await resolveProxyBody(options.proxy, execution);
        proxiedResponse = await proxyAiRouteIfNeeded(
            options.req,
            options.proxy.pathname,
            body === undefined
                ? undefined
                : {
                      body,
                  },
        );
    }

    return {
        ...execution,
        proxiedResponse,
        transport: dispatch.transport,
        forwardedModel: dispatch.forwardedModel,
        cloudApiBaseUrl,
    };
}

export function requireLocalAiRouteModel<R extends ModelRole>(execution: AiRouteExecution<R>) {
    assertAiExecutionTargetHasModel(execution);
    return execution.model;
}

export function buildAiRouteForwardRequest<R extends ModelRole>(execution: AiRouteExecution<R>, req: NextRequest, pathname: string): AiRouteForwardRequest {
    const baseUrl = execution.transport === 'cloud' && execution.cloudApiBaseUrl ? execution.cloudApiBaseUrl : resolveRequestOrigin(req);

    return {
        url: new URL(pathname, baseUrl).toString(),
        headers: buildCloudForwardHeaders(req, baseUrl),
        transport: execution.transport,
        forwardedModel: execution.forwardedModel,
    };
}

export function isLocalMissingAiEnvError(error: unknown): boolean {
    return isMissingAiEnvError(error) && !USE_CLOUD_AI;
}
