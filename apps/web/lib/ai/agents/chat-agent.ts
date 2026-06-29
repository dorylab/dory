import 'server-only';

import { hasToolCall, stepCountIs, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolSet } from 'ai';

import { recordAiUsage, type AiDebugInput, type AiGatewayContext } from '@/lib/ai/gateway';

type BuildDoryChatAgentOptions<TOOLS extends ToolSet> = {
    model: LanguageModel;
    tools: TOOLS;
    instructions: string;
    temperature?: number;
    maxSteps?: number;
    headers?: Record<string, string | undefined> | null;
    context: AiGatewayContext;
    experimentalContext?: Record<string, unknown> | null;
    requestId: string;
    startedAt?: number;
    debugInput?: AiDebugInput;
};

function isManualExecutionRequired(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, any>;
    return record.type === 'sql-result' && record.ok === false && record.manualExecution?.required === true;
}

function stopAfterManualSqlResult<TOOLS extends ToolSet>(): StopCondition<TOOLS> {
    return ({ steps }) =>
        steps.some(step =>
            step.toolResults.some(toolResult => {
                const output = (toolResult as any).output;
                if (isManualExecutionRequired(output)) return true;
                if (output && typeof output === 'object' && output.type === 'json') {
                    return isManualExecutionRequired(output.value);
                }
                return false;
            }),
        );
}

export function buildDoryChatAgent<TOOLS extends ToolSet>(options: BuildDoryChatAgentOptions<TOOLS>) {
    const startedAt = options.startedAt ?? Date.now();

    return new ToolLoopAgent({
        model: options.model,
        tools: options.tools,
        instructions: options.instructions,
        temperature: options.temperature,
        stopWhen: [stepCountIs(options.maxSteps ?? 6), hasToolCall('chartBuilder' as keyof TOOLS & string), stopAfterManualSqlResult<TOOLS>()],
        headers: options.headers ?? undefined,
        experimental_context: {
            requestId: options.requestId,
            organizationId: options.context.organizationId ?? null,
            userId: options.context.userId ?? null,
            connectionId: options.context.connectionId ?? null,
            ...(options.experimentalContext ?? {}),
        },
        prepareCall: callOptions => ({
            ...callOptions,
            headers: {
                ...(callOptions.headers ?? {}),
                ...(options.headers ?? {}),
            },
        }),
        onFinish: async event => {
            await recordAiUsage({
                requestId: options.requestId,
                context: options.context,
                input: options.debugInput ?? {
                    system: options.instructions,
                    messages: null,
                    prompt: null,
                },
                usage: event.totalUsage ?? event.usage,
                latencyMs: Date.now() - startedAt,
                status: 'ok',
                outputText: event.text,
                outputJson: {
                    finishReason: event.finishReason,
                    text: event.text,
                    steps: event.steps.length,
                },
            });
        },
    });
}
