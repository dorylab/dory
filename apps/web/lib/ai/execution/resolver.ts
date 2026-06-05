import 'server-only';

import type { LanguageModel } from 'ai';
import type { NextRequest } from 'next/server';
import type { DBService } from '@dory/database';

import { USE_CLOUD_AI } from '@/app/config/app';
import { createDoryCloudProxyLanguageModel } from '@/lib/ai/agents/cloud-proxy-model';
import { isMissingAiEnvError } from '@/lib/ai/errors';
import { assertAiExecutionTargetHasModel, resolveAiExecutionTargetForOrganization, type AiExecutionTarget } from '@/lib/ai/model/execution';
import type { ModelRole } from '@/lib/ai/model/types';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { buildCloudForwardHeaders, proxyCloudAiRoute } from './cloud-route-proxy';
import { normalizeAiProxyBody, resolveAiRouteDispatchPolicy, type AiRouteProxyBodyMode } from './route-dispatch-policy';

type AiProxyBodyBuilder<R extends ModelRole> = (execution: AiExecution<R>) => Promise<unknown> | unknown;

export type AiProxyOptions<R extends ModelRole> = {
    pathname: string;
    body?: unknown;
    buildBody?: AiProxyBodyBuilder<R>;
    bodyMode?: AiRouteProxyBodyMode;
};

export type ResolveAiExecutionOptions<R extends ModelRole> = {
    req?: NextRequest | null;
    db?: DBService | null;
    organizationId?: string | null;
    role: R;
    requestedModel?: string | null;
    defaultModelName?: string | null;
    allowCloudProxy?: boolean;
    includeModel?: boolean;
};

export type AiExecution<R extends ModelRole = ModelRole> = AiExecutionTarget<R> & {
    transport: 'cloud' | 'local';
    forwardedModel: string | null;
    cloudApiBaseUrl: string | null;
};

export type AiLanguageModelExecution<R extends ModelRole = ModelRole> = Omit<AiExecution<R>, 'model'> & {
    model: LanguageModel;
};

export type AiRouteProxyResult<R extends ModelRole = ModelRole> = {
    execution: AiExecution<R>;
    proxiedResponse: Response | null;
};

export type AiForwardRequest = {
    url: string;
    headers: Headers;
    transport: 'cloud' | 'local';
    forwardedModel: string | null;
};

async function resolveProxyBody<R extends ModelRole>(proxy: AiProxyOptions<R>, execution: AiExecution<R>): Promise<unknown | undefined> {
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

export async function resolveAiExecution<R extends ModelRole>(options: ResolveAiExecutionOptions<R>): Promise<AiExecution<R>> {
    const cloudApiBaseUrl = getCloudApiBaseUrl();
    const target = await resolveAiExecutionTargetForOrganization(options.role, {
        db: options.db,
        organizationId: options.organizationId ?? null,
        modelName: options.requestedModel ?? null,
        defaultModelName: options.defaultModelName,
        useCloudAi: USE_CLOUD_AI,
        cloudApiBaseUrl,
        allowCloudProxy: options.allowCloudProxy ?? Boolean(options.req),
        includeModel: options.includeModel,
    });
    const dispatch = resolveAiRouteDispatchPolicy(target);

    return {
        ...target,
        transport: dispatch.transport,
        forwardedModel: dispatch.forwardedModel,
        cloudApiBaseUrl,
    };
}

export function buildAiForwardRequest<R extends ModelRole>(execution: AiExecution<R>, req: NextRequest, pathname: string): AiForwardRequest {
    const baseUrl = execution.transport === 'cloud' && execution.cloudApiBaseUrl ? execution.cloudApiBaseUrl : resolveRequestOrigin(req);

    return {
        url: new URL(pathname, baseUrl).toString(),
        headers: buildCloudForwardHeaders(req, baseUrl),
        transport: execution.transport,
        forwardedModel: execution.forwardedModel,
    };
}

export function requireLocalAiModel<R extends ModelRole>(execution: AiExecution<R>) {
    assertAiExecutionTargetHasModel(execution);
    return execution.model;
}

export function resolveAiLanguageModelFromExecution<R extends ModelRole>(
    execution: AiExecution<R>,
    options: {
        req?: NextRequest | null;
        role: R;
    },
): LanguageModel {
    if (execution.transport === 'cloud') {
        if (!options.req || !execution.cloudApiBaseUrl) {
            throw new Error('Cloud AI proxy is not available for this action context.');
        }

        return createDoryCloudProxyLanguageModel({
            baseUrl: execution.cloudApiBaseUrl,
            headers: buildCloudForwardHeaders(options.req, execution.cloudApiBaseUrl),
            model: execution.forwardedModel,
            role: options.role,
        }) as LanguageModel;
    }

    return requireLocalAiModel(execution);
}

export async function resolveAiLanguageModel<R extends ModelRole>(options: ResolveAiExecutionOptions<R>): Promise<AiLanguageModelExecution<R>> {
    const execution = await resolveAiExecution({
        ...options,
        includeModel: true,
    });

    return {
        ...execution,
        model: resolveAiLanguageModelFromExecution(execution, {
            req: options.req,
            role: options.role,
        }),
    };
}

export async function resolveAiRouteProxy<R extends ModelRole>(
    options: ResolveAiExecutionOptions<R> & {
        req: NextRequest;
        proxy?: AiProxyOptions<R>;
    },
): Promise<AiRouteProxyResult<R>> {
    const execution = await resolveAiExecution(options);

    let proxiedResponse: Response | null = null;
    if (execution.transport === 'cloud' && options.proxy) {
        if (!execution.cloudApiBaseUrl) {
            proxiedResponse = new Response('CLOUD_API_NOT_CONFIGURED', {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        } else {
            const body = await resolveProxyBody(options.proxy, execution);
            proxiedResponse = await proxyCloudAiRoute(options.req, execution.cloudApiBaseUrl, options.proxy.pathname, body === undefined ? undefined : { body });
        }
    }

    return {
        execution,
        proxiedResponse,
    };
}

export function isLocalMissingAiEnvError(error: unknown): boolean {
    return isMissingAiEnvError(error) && !USE_CLOUD_AI;
}
