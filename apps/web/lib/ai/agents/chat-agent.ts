import { chatToolStage, MAX_PROGRESS_PUBLICATIONS, type CheckpointResult } from '@dory/shared/types/chat-checkpoints';
import 'server-only';

import { isStepCount, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolSet } from 'ai';

import { recordAiUsage, type AiDebugInput, type AiGatewayContext } from '@/lib/ai/gateway';

import { repairWorkToolInput } from './work-tool-input';

type BuildDoryChatAgentOptions<TOOLS extends ToolSet> = {
    model: LanguageModel;
    tools: TOOLS;
    instructions: string;
    temperature?: number;
    maxSteps?: number;
    structuredCompletion?: boolean;
    onSummaryInputError?: (error: unknown) => Promise<void>;
    checkpoint?: { inspect: () => Promise<CheckpointResult | null>; invalid: () => Promise<unknown> };
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
        repairToolCall: async ({ toolCall, error }) => {
            if (toolCall.toolName === 'publishProgress') {
                await options.checkpoint?.invalid();
                return null;
            }
            if (toolCall.toolName === 'finishAnalysis') {
                await options.onSummaryInputError?.(error);
                return null;
            }
            const repaired = repairWorkToolInput(toolCall.toolName, toolCall.input);
            if (!repaired) return null;
            await (options.recordUsage ?? recordAiUsage)({
                requestId: `${options.requestId}:tool-repair:${toolCall.toolCallId}`,
                context: options.context,
                input: options.debugInput ?? { instructions: options.instructions, messages: null, prompt: null },
                latencyMs: Date.now() - startedAt,
                status: 'ok',
                outputJson: { kind: 'tool_input_repaired', toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, originalInput: toolCall.input, repairedInput: repaired },
            });
            return { ...toolCall, input: repaired };
        },
        instructions: options.instructions,
        temperature: options.temperature,
        stopWhen: [
            isStepCount((options.maxSteps ?? 12) + (options.checkpoint ? MAX_PROGRESS_PUBLICATIONS + 3 : 0) + 1),
            ...(options.structuredCompletion ? [] : [stopAfterManualSqlResult<TOOLS>()]),
            ({ steps }) =>
                steps.some(step =>
                    step.toolResults.some(result => {
                        const output: unknown = result.output;
                        return result.toolName === 'finishAnalysis' && Boolean(output && typeof output === 'object' && 'ok' in output && output.ok === true);
                    }),
                ),
        ],
        prepareStep: async ({ stepNumber, steps }) => {
            const checkpoint = await options.checkpoint?.inspect();
            const progressSteps = steps.filter(step => step.toolCalls.some(call => call.toolName === 'publishProgress')).length;
            const businessSteps = options.checkpoint ? steps.filter(step => step.toolCalls.some(call => call.toolName !== 'publishProgress')).length : stepNumber;
            const saveAttempted = steps.some(step =>
                step.toolCalls.some(
                    call =>
                        call.toolName === 'finishAnalysis' &&
                        !step.toolResults.some(result => result.toolCallId === call.toolCallId && result.output && typeof result.output === 'object' && 'control' in result.output),
                ),
            );
            if (saveAttempted || checkpoint?.stopped || (options.checkpoint && progressSteps >= MAX_PROGRESS_PUBLICATIONS + 2) || businessSteps >= (options.maxSteps ?? 12)) {
                return {
                    toolChoice: 'none' as const,
                    activeTools: [],
                    instructions: `${options.instructions}\n${saveAttempted ? 'Conclusion saving was already attempted. Do not retry any saving tool. Answer with the available analysis and explain any save failure; do not claim the conclusions were saved.' : 'Tool budget exhausted. Answer from the available evidence and explain any unfinished work. Do not call more tools or claim unfinished work is complete.'}`,
                };
            }
            if (checkpoint)
                return {
                    toolChoice: 'auto' as const,
                    activeTools: Object.keys(options.tools).filter(
                        name => name === 'publishProgress' || (checkpoint.stage && (checkpoint.remainingActions ?? 0) > 0 && chatToolStage(name) === checkpoint.stage),
                    ) as (keyof TOOLS & string)[],
                    instructions: `${options.instructions}\nCurrent stage checkpoint: ${JSON.stringify({ ...checkpoint, actions: checkpoint.actions.map(({ id, toolName, state }) => ({ id, toolName, state })) })}. If the next action is in another stage, publish progress first. If sufficient evidence is available, directly give the final answer.`,
                };
            return { toolChoice: 'auto' as const };
        },
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
