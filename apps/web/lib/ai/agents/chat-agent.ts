import { chatToolStage, MAX_PROGRESS_PUBLICATIONS, type CheckpointResult } from '@dory/shared/types/chat-checkpoints';
import 'server-only';

import { isStepCount, NoSuchToolError, ToolLoopAgent, type LanguageModel, type StopCondition, type ToolSet } from 'ai';

import { recordAiUsage, type AiDebugInput, type AiGatewayContext } from '@/lib/ai/gateway';

import { repairWorkToolInput } from './work-tool-input';

type BuildDoryChatAgentOptions<TOOLS extends ToolSet> = {
    model: LanguageModel;
    tools: TOOLS;
    hasAttachments?: boolean;
    instructions: string;
    temperature?: number;
    maxSteps?: number;
    structuredCompletion?: boolean;
    onSummaryInputError?: (error: unknown) => Promise<void>;
    checkpoint?: { inspect: () => Promise<CheckpointResult | null>; invalid: () => Promise<unknown> };
    requiredReport?: { status: () => Promise<'missing' | 'draft' | 'ready' | null> };
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
    let stageRecovery: { toolName: string; toolCallId: string } | null = null;

    return new ToolLoopAgent({
        model: options.model,
        tools: options.tools,
        toolsContext: {} as never,
        repairToolCall: async ({ toolCall, error }) => {
            if (
                NoSuchToolError.isInstance(error) &&
                options.checkpoint &&
                !['publishProgress', 'finishAnalysis'].includes(toolCall.toolName) &&
                Object.hasOwn(options.tools, toolCall.toolName)
            ) {
                const checkpoint = await options.checkpoint.inspect();
                if (checkpoint && !checkpoint.stopped && (checkpoint.stage !== chatToolStage(toolCall.toolName) || !checkpoint.remainingActions)) {
                    stageRecovery = { toolName: toolCall.toolName, toolCallId: toolCall.toolCallId };
                    return null;
                }
            }
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
                    instructions: `${options.instructions}\n${saveAttempted ? 'Conclusion saving was already attempted. Do not retry any saving tool. Answer with the available analysis and explain any save failure; do not claim the conclusions were saved.' : checkpoint?.stopped ? 'Analysis stopped because progress validation failed or the progress budget was exhausted. Explain the interruption and which steps remain unfinished. Any SQL without a successful query result is unexecuted; do not present it as completed analysis. Do not call more tools.' : 'Tool budget exhausted. Answer from the available evidence and explain any unfinished work. Do not call more tools or claim unfinished work is complete.'}`,
                };
            }
            const reportStatus = await options.requiredReport?.status();
            const reportPending = Boolean(reportStatus && reportStatus !== 'ready');
            const reportInstruction = reportPending
                ? `\nThe requested report is ${reportStatus === 'missing' ? 'not created: first publish progress with nextStage: output, then call createWorkReport to save its draft' : 'still a draft: gather any necessary verified evidence, readWorkReport and updateWorkReport with status: ready'}. Report tools are available in the output stage; temporary stage restrictions are NOT missing capabilities. Do not substitute a Markdown chat response for saving the report. Use only the current checkpointId below, never one from conversation history.`
                : '';
            if (checkpoint) {
                // A progress publication only opens the stage; it does not execute
                // the blocked action. Keep that action pending until a real retry.
                for (const result of steps.at(-1)?.content ?? []) {
                    if (result.type !== 'tool-result' && result.type !== 'tool-error') continue;
                    const output: unknown = result.type === 'tool-result' ? result.output : undefined;
                    if (result.toolName !== 'publishProgress' && output && typeof output === 'object' && 'control' in output) {
                        if (output.control === 'progress_required') stageRecovery = { toolName: result.toolName, toolCallId: result.toolCallId };
                    } else if (stageRecovery?.toolName === result.toolName && stageRecovery.toolCallId !== result.toolCallId) {
                        stageRecovery = null;
                    }
                }
                const retryTool = stageRecovery?.toolName;
                const mustPublish = reportPending && (!checkpoint.stage || !checkpoint.remainingActions || (reportStatus === 'missing' && checkpoint.stage !== 'output'));
                const activeTools = Object.keys(options.tools).filter(
                    name =>
                        name === 'publishProgress' ||
                        (options.hasAttachments && ['readAttachment', 'searchAttachment', 'queryAttachment'].includes(name)) ||
                        (!mustPublish &&
                            (!reportStatus || name !== 'finishAnalysis') &&
                            (reportStatus !== 'missing' || name === 'createWorkReport') &&
                            // Keep deliverable tools discoverable across turns. Their
                            // execution wrappers still enforce the stage checkpoint.
                            (['chartBuilder', 'createWorkReport', 'readWorkReport', 'updateWorkReport'].includes(name) ||
                                (checkpoint.stage && (checkpoint.remainingActions ?? 0) > 0 && chatToolStage(name) === checkpoint.stage))),
                ) as (keyof TOOLS & string)[];
                const retryReady = retryTool && checkpoint.stage === chatToolStage(retryTool) && (checkpoint.remainingActions ?? 0) > 0 && activeTools.includes(retryTool);
                return {
                    toolChoice:
                        retryTool && (!reportPending || activeTools.includes(retryTool))
                            ? { type: 'tool' as const, toolName: (retryReady ? retryTool : 'publishProgress') as keyof TOOLS & string }
                            : reportPending
                              ? ('required' as const)
                              : ('auto' as const),
                    activeTools,
                    instructions: `${options.instructions}${reportInstruction}${retryTool ? `\nThe ${retryTool} tool exists but its previous call was blocked by the stage checkpoint; it did not execute. This is NOT an unavailable capability. ${retryReady ? `The stage is now ready. Call ${retryTool} now using the intended arguments; publishing progress did not complete this action. Do not claim success before its result.` : `Call publishProgress now with nextStage: ${chatToolStage(retryTool)}, then retry the intended tool with corrected arguments.`}` : ''}\nAvailable tool stages: ${JSON.stringify(
                        Object.fromEntries(
                            Object.keys(options.tools)
                                .filter(name => name !== 'publishProgress')
                                .map(name => [name, chatToolStage(name)]),
                        ),
                    )}. Temporary stage restrictions are not missing capabilities. Current stage checkpoint: ${JSON.stringify({ ...checkpoint, actions: checkpoint.actions.map(({ id, toolName, state }) => ({ id, toolName, state })) })}. If the next action is in another stage, publish progress first. ${reportPending ? 'Finish only after the report is saved as ready.' : retryTool ? 'Complete the pending action before giving the final answer.' : 'If sufficient evidence is available, directly give the final answer.'}`,
                };
            }
            return {
                toolChoice: reportPending ? ('required' as const) : ('auto' as const),
                ...(reportStatus === 'missing' ? { activeTools: ['createWorkReport'] as (keyof TOOLS & string)[] } : {}),
                instructions: `${options.instructions}${reportInstruction}`,
            };
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
