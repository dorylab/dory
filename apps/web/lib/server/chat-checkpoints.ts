import type { DBService } from '@dory/database';
import { createHash } from 'node:crypto';
import { chatToolFailure } from '@dory/shared/types/chat-tool-error';
import { CHAT_STAGES, chatToolStage, type CheckpointCommand } from '@dory/shared/types/chat-checkpoints';
import { z } from 'zod';

export const publishProgressSchema = z.object({
    checkpointId: z.string(),
    text: z
        .string()
        .describe('Public progress in the user language: actual findings and limitations, their relevance, and the next step. Usually 1–3 sentences; no private reasoning.'),
    nextStage: z.enum(CHAT_STAGES),
});
export const CHAT_CHECKPOINT_INSTRUCTIONS = `The server manages tool stages and execution budgets. publishProgress is optional: give a short factual update when the task meaningfully changes, in the user's language, without repeating it in chat. Progress text never unlocks tools. Never invent findings or expose private reasoning. Read attachments and use queryAttachment for full-data attachment statistics; do not switch to unrelated databases. Use explicit database identity for database SQL. Tool errors include a recovery action: repair the source/fields or read the latest report before retrying. Never repeat unchanged failed calls. At most two retries per issue and four recovery actions per turn. answer_required means stop the affected work, preserve verified results, explain unfinished steps and answer. Do not claim a chart or report was saved without a successful result.`;

export function chatActionFingerprint(input: unknown): string {
    const stable = (value: unknown): unknown =>
        Array.isArray(value)
            ? value.map(stable)
            : value && typeof value === 'object'
              ? Object.fromEntries(
                    Object.entries(value)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([key, item]) => [key, stable(item)]),
                )
              : value;
    return createHash('sha256')
        .update(JSON.stringify(stable(input ?? null)))
        .digest('hex');
}

type Owner = { organizationId: string; userId: string; workId: string; requestId: string };
export const isCheckpointControl = (output: unknown): output is Record<string, unknown> & { control: string } =>
    Boolean(output && typeof output === 'object' && 'control' in output);

export function chatCheckpoints(db: DBService, owner: Owner) {
    const mutate = (command: CheckpointCommand) => db.works.chatCheckpoint({ ...owner, command });
    return {
        inspect: () => mutate({ kind: 'inspect' }),
        publish: (input: Record<string, unknown>) => mutate({ kind: 'publish', checkpointId: input.checkpointId, text: input.text, nextStage: input.nextStage }),
        reserve: (id: string, toolName: string, actionId?: string, input?: unknown) =>
            mutate({ kind: 'reserve', id, toolName, stage: chatToolStage(toolName, actionId), fingerprint: chatActionFingerprint(input) }),
        settle: (id: string, result: unknown, failed = false, toolName = 'tool') =>
            mutate({
                kind: 'settle',
                id,
                failed,
                ...(failed
                    ? { failure: chatToolFailure(result instanceof Error ? result : typeof result === 'object' && result && 'error' in result ? result.error : result, toolName) }
                    : {}),
                result: JSON.stringify(result, (_key, value) => (typeof value === 'bigint' ? String(value) : value)) ?? '',
            }),
    };
}

/** For SDK-only tools; MCP tools use the same reservation around their existing event. */
export async function runChatStageAction<T>(options: Owner & { db: DBService; toolName: string; toolCallId: string; input?: unknown }, run: () => Promise<T>) {
    const checkpoint = chatCheckpoints(options.db, options);
    const eventId = `action_${chatActionFingerprint([options.workId, options.requestId, options.toolCallId]).slice(0, 32)}`;
    const admission = await checkpoint.reserve(eventId, options.toolName, undefined, options.input);
    if (isCheckpointControl(admission)) return admission;
    if (admission?.duplicate) return admission.output;
    const event = { ...options, eventId, inputSummary: { requestId: options.requestId, toolCallId: options.toolCallId, activitySource: 'tool' } };
    try {
        if (admission) await options.db.works.recordEvent({ ...event, status: 'running' });
        const output = await run();
        if (admission) {
            await options.db.works.recordEvent({ ...event, status: 'success' });
            await checkpoint.settle(eventId, output);
        }
        return output;
    } catch (error) {
        if (admission) {
            const message = error instanceof Error ? error.message : String(error);
            await options.db.works.recordEvent({ ...event, status: 'error', errorMessage: message });
            await checkpoint.settle(eventId, error, true, options.toolName);
        }
        throw new Error(JSON.stringify(chatToolFailure(error, options.toolName)), { cause: error });
    }
}
