import 'server-only';

import { isStepCount, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolSet } from 'ai';

import { recordAiUsage, type AiDebugInput, type AiGatewayContext } from '@/lib/ai/gateway';

type BuildDoryChatAgentOptions<TOOLS extends ToolSet> = {
    model: LanguageModel;
    tools: TOOLS;
    instructions: string;
    temperature?: number;
    maxSteps?: number;
    structuredCompletion?: boolean;
    headers?: Record<string, string | undefined> | null;
    context: AiGatewayContext;
    requestId: string;
    startedAt?: number;
    debugInput?: AiDebugInput;
    recordUsage?: typeof recordAiUsage;
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
        toolsContext: {} as never,
        instructions: options.instructions,
        temperature: options.temperature,
        stopWhen: [
            isStepCount((options.maxSteps ?? 12) + 2),
            ...(options.structuredCompletion ? [] : [stopAfterManualSqlResult<TOOLS>()]),
            ({ steps }) =>
                steps.some(step =>
                    step.toolResults.some(result => {
                        const output: unknown = result.output;
                        return result.toolName === 'finishAnalysis' && Boolean(output && typeof output === 'object' && 'ok' in output && output.ok === true);
                    }),
                ),
        ],
        prepareStep: options.structuredCompletion
            ? ({ stepNumber }) => ({
                  toolChoice: 'required',
                  ...(stepNumber >= (options.maxSteps ?? 12)
                      ? {
                            activeTools: ['finishAnalysis' as keyof TOOLS & string],
                            instructions: `${options.instructions}\nAnalysis budget exhausted. Save supported findings and explain any remaining work in finalAnswer. Use status: error if requested analysis remains unfinished. Do not claim unfinished analysis is complete.`,
                        }
                      : {}),
              })
            : undefined,
        headers: options.headers ?? undefined,
        onEnd: async event => {
            await (options.recordUsage ?? recordAiUsage)({
                requestId: options.requestId,
                context: options.context,
                input: options.debugInput ?? {
                    instructions: options.instructions,
                    messages: null,
                    prompt: null,
                },
                usage: event.usage,
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
