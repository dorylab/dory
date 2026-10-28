import type { ChatToolFailure } from './chat-tool-error';
import type { ChatProgressEntry } from './chat-progress';

export const CHAT_STAGES = ['reference', 'schema', 'query', 'output'] as const;
export type ChatStage = (typeof CHAT_STAGES)[number];
export const MAX_PROGRESS_PUBLICATIONS = 16;
export type CheckpointAction = {
    id: string;
    toolName: string;
    state: 'running' | 'completed' | 'failed';
    result?: string;
    fingerprint?: string;
    epoch?: number;
    failure?: ChatToolFailure;
};
export type ChatCheckpoints = {
    revision: number;
    maxActions?: number;
    actionAttempts?: number;
    recoveryActions?: number;
    evidenceEpoch?: number;
    recoveryIssue?: string;
    issueAttempts?: Record<string, number>;
    stage?: ChatStage;
    actions: CheckpointAction[];
    entries: ChatProgressEntry[];
    failures: number;
    attempts?: number;
    stopped?: boolean;
    publications: Record<string, { text: string; nextStage: ChatStage }>;
};
export type CheckpointCommand =
    | { kind: 'inspect' }
    | { kind: 'reserve'; id: string; toolName: string; stage: ChatStage; fingerprint?: string }
    | { kind: 'settle'; id: string; failed: boolean; result: string; failure?: ChatToolFailure }
    | { kind: 'publish'; checkpointId: unknown; text: unknown; nextStage: unknown };

export function initialChatCheckpoints(): ChatCheckpoints {
    return { revision: 0, actions: [], entries: [], failures: 0, publications: {} };
}

/** Classify the underlying action too, so generic read/write cannot bypass checkpoints. */
export function chatToolStage(name: string, actionId?: string): ChatStage {
    const tool = actionId || name;
    if (/schema|Schema|connections|Connections|connection\.|database\.|table\./.test(tool)) return 'schema';
    if (tool === 'queryAttachment' || tool === 'dory_query_attachment') return 'query';
    if (/sql|Sql|query\./.test(tool)) return 'query';
    if (/asset|Artifact|artifacts|Attachment|attachment|knowledge|catalog\.|search_assets|read_asset/.test(tool)) return 'reference';
    return 'output';
}

export function checkpointView(state: ChatCheckpoints, requestId: string) {
    return {
        checkpointId: `${requestId}:${state.revision}`,
        stage: state.stage,
        remainingActions: Math.max(0, (state.maxActions ?? 24) - (state.actionAttempts ?? state.actions.length)),
        actions: state.actions,
        recoveryActions: state.recoveryActions ?? 0,
        businessActions: state.actionAttempts ?? state.actions.length,
        stopped: Boolean(state.stopped),
        publicationsRemaining: MAX_PROGRESS_PUBLICATIONS - state.revision,
    };
}

/** Pure transition; the database executes this under the current Work row lock. */
export type CheckpointResult = ReturnType<typeof checkpointView> & {
    control?: 'progress_required' | 'answer_required';
    reason?: string;
    accepted?: boolean;
    published?: boolean;
    duplicate?: boolean;
    output?: unknown;
};

export function applyCheckpointCommand(state: ChatCheckpoints, requestId: string, command: CheckpointCommand): CheckpointResult {
    const view = () => checkpointView(state, requestId);
    const stop = (reason: string): CheckpointResult => ({ control: 'answer_required', reason, ...view() });
    if (command.kind === 'inspect') return view();
    if (command.kind === 'settle') {
        const action = state.actions.find(item => item.id === command.id);
        if (action) {
            action.state = command.failed ? 'failed' : 'completed';
            action.result = command.result.slice(0, 6000);
            action.failure = command.failure;
            if (command.failed && command.failure) state.recoveryIssue = `${action.toolName}:${command.failure.code}`;
            else if (!command.failed) {
                state.evidenceEpoch = (state.evidenceEpoch ?? 0) + 1;
                if (state.recoveryIssue?.startsWith(`${action.toolName}:`)) state.recoveryIssue = undefined;
            }
            const entry = state.entries.find(item => item.id === command.id);
            if (entry) {
                entry.state = action.state;
                entry.revision++;
            }
        }
        return view();
    }
    if (command.kind === 'reserve') {
        if (state.stopped) return stop('Execution budget exhausted. Answer with verified results and unfinished steps.');
        const prior = state.actions.find(item => item.id === command.id);
        if (prior)
            return {
                duplicate: true,
                output: {
                    alreadyExecuted: true,
                    state: prior.state,
                    resultSummary: prior.result,
                    recovery: 'Read the existing result or report receipt; do not repeat this operation.',
                },
                ...view(),
            };
        state.actionAttempts = (state.actionAttempts ?? state.actions.length) + 1;
        if (state.actionAttempts > (state.maxActions ?? 24)) {
            state.stopped = true;
            return stop('Execution budget exhausted. Preserve completed work.');
        }
        const failed = state.actions.findLast(item => item.toolName === command.toolName && item.state !== 'running');
        if (failed?.state === 'failed' && failed.failure) {
            if (!failed.failure.retryable) return stop(failed.failure.recovery);
            if (failed.fingerprint && failed.fingerprint === command.fingerprint && failed.epoch === (state.evidenceEpoch ?? 0))
                return stop('The same call already failed without any source, input or external-state change. Follow its recovery action first.');
            const issue = `${command.toolName}:${failed.failure.code}`;
            state.issueAttempts ??= {};
            if ((state.issueAttempts[issue] ?? 0) >= 2) return stop('Recovery limit reached for this issue. Explain the unfinished step and preserve results.');
            state.issueAttempts[issue] = (state.issueAttempts[issue] ?? 0) + 1;
        }
        // Successful inspection/query steps prepare a repair; they are not retries.
        // Count actual retries here, while every action still consumes maxActions.
        if (state.recoveryIssue && failed?.state === 'failed') {
            if ((state.recoveryActions ?? 0) >= 4) return stop('Turn recovery limit reached. Explain unfinished work.');
            state.recoveryActions = (state.recoveryActions ?? 0) + 1;
        }
        state.stage = command.stage;
        state.actions.push({ id: command.id, toolName: command.toolName, state: 'running', fingerprint: command.fingerprint, epoch: state.evidenceEpoch ?? 0 });
        state.entries.push({ id: command.id, eventId: command.id, sequence: state.entries.length, revision: 0, kind: 'tool', toolName: command.toolName, state: 'running' });
        return { accepted: true, ...view() };
    }
    // Compatibility: progress is explanatory, never an execution prerequisite.
    const text = typeof command.text === 'string' ? command.text.trim() : '';
    const key = typeof command.checkpointId === 'string' ? command.checkpointId : '';
    if (key && Object.hasOwn(state.publications, key)) return { published: true, duplicate: true, ...view() };
    if (!text || text.length > 2000 || state.revision >= MAX_PROGRESS_PUBLICATIONS) return { published: false, ...view() };
    const id = `${requestId}:${state.revision}`;
    state.publications[key || id] = { text, nextStage: CHAT_STAGES.includes(command.nextStage as ChatStage) ? (command.nextStage as ChatStage) : (state.stage ?? 'reference') };
    state.entries.push({
        id: `checkpoint:${id}`,
        sequence: state.entries.length,
        revision: 0,
        kind: 'text',
        phase: 'commentary',
        text,
        coveredActionIds: state.actions.filter(action => action.state !== 'running').map(action => action.id),
    });
    state.revision++;
    return { published: true, ...view() };
}
