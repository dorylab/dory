import type { AiExecutionPolicy } from '@/lib/ai/model/execution-policy';

export type AiRouteProxyBodyMode = 'default' | 'copilot-action' | 'passthrough';

export type AiRouteDispatchPolicy = {
    transport: 'cloud' | 'local';
    forwardedModel: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function resolveAiRouteDispatchPolicy(execution: Pick<AiExecutionPolicy, 'shouldUseCloudProxy' | 'modelName'>): AiRouteDispatchPolicy {
    return {
        transport: execution.shouldUseCloudProxy ? 'cloud' : 'local',
        forwardedModel: execution.shouldUseCloudProxy ? null : execution.modelName,
    };
}

export function normalizeAiProxyBody(body: unknown, mode: AiRouteProxyBodyMode = 'default'): unknown {
    if (mode === 'passthrough' || !isRecord(body)) return body;

    const normalized: Record<string, unknown> = {
        ...body,
        model: null,
    };

    if (mode === 'copilot-action' && isRecord(body.input)) {
        normalized.input = {
            ...body.input,
            model: null,
        };
    }

    return normalized;
}
