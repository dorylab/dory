import 'server-only';

import type { LanguageModel } from 'ai';
import type { NextRequest } from 'next/server';

import { buildAiRouteForwardRequest, requireLocalAiRouteModel, type AiRouteExecution } from '@/lib/ai/execution/route-dispatch';
import { createDoryCloudProxyLanguageModel } from './cloud-proxy-model';

export function resolveDoryAgentModel(options: { execution: AiRouteExecution<'chat'>; req: NextRequest }): LanguageModel {
    if (options.execution.transport === 'cloud') {
        const forward = buildAiRouteForwardRequest(options.execution, options.req, '/');
        return createDoryCloudProxyLanguageModel({
            baseUrl: forward.url,
            headers: forward.headers,
            model: forward.forwardedModel,
        });
    }

    return requireLocalAiRouteModel(options.execution);
}
