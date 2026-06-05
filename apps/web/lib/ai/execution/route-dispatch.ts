import 'server-only';

import type { NextRequest } from 'next/server';
import type { DBService } from '@dory/database';
import type { ModelRole } from '@/lib/ai/model/types';
import {
    buildAiForwardRequest,
    isLocalMissingAiEnvError,
    requireLocalAiModel,
    resolveAiRouteProxy,
    type AiExecution,
    type AiForwardRequest,
    type AiProxyOptions,
} from './resolver';

export type AiRouteProxyOptions<R extends ModelRole> = AiProxyOptions<R>;

export type ResolveAiRouteExecutionOptions<R extends ModelRole> = {
    req: NextRequest;
    db?: DBService | null;
    organizationId?: string | null;
    role: R;
    requestedModel?: string | null;
    defaultModelName?: string | null;
    allowCloudProxy?: boolean;
    includeModel?: boolean;
    proxy?: AiProxyOptions<R>;
};

export type AiRouteExecution<R extends ModelRole = ModelRole> = AiExecution<R> & {
    proxiedResponse: Response | null;
};

export type AiRouteForwardRequest = AiForwardRequest;

export async function resolveAiRouteExecution<R extends ModelRole>(options: ResolveAiRouteExecutionOptions<R>): Promise<AiRouteExecution<R>> {
    const { execution, proxiedResponse } = await resolveAiRouteProxy(options);
    return {
        ...execution,
        proxiedResponse,
    };
}

export function requireLocalAiRouteModel<R extends ModelRole>(execution: AiRouteExecution<R>) {
    return requireLocalAiModel(execution);
}

export function buildAiRouteForwardRequest<R extends ModelRole>(execution: AiRouteExecution<R>, req: NextRequest, pathname: string): AiRouteForwardRequest {
    return buildAiForwardRequest(execution, req, pathname);
}

export { isLocalMissingAiEnvError };
