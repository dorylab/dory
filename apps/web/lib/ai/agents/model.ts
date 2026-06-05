import 'server-only';

import type { LanguageModel } from 'ai';
import type { NextRequest } from 'next/server';

import { resolveAiLanguageModelFromExecution } from '@/lib/ai/execution/resolver';
import type { AiRouteExecution } from '@/lib/ai/execution/route-dispatch';

export function resolveDoryAgentModel(options: { execution: AiRouteExecution<'chat'>; req: NextRequest }): LanguageModel {
    return resolveAiLanguageModelFromExecution(options.execution, {
        req: options.req,
        role: 'chat',
    });
}
