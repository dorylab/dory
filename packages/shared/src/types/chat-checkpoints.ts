import type { ChatProgressEntry } from './chat-progress';

export const CHAT_STAGES = ['reference', 'schema', 'query', 'output'] as const;
export type ChatStage = (typeof CHAT_STAGES)[number];
export const MAX_STAGE_ACTIONS = 3;
export const MAX_PROGRESS_PUBLICATIONS = 16;
export type CheckpointAction = { id: string; toolName: string; state: 'running' | 'completed' | 'failed'; result?: string };
export type ChatCheckpoints = {
    revision: number;
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
    | { kind: 'reserve'; id: string; toolName: string; stage: ChatStage }
    | { kind: 'settle'; id: string; failed: boolean; result: string }
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
        remainingActions: Math.max(0, MAX_STAGE_ACTIONS - state.actions.length),
        actions: state.actions,
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
};

export function applyCheckpointCommand(state: ChatCheckpoints, requestId: string, command: CheckpointCommand): CheckpointResult {
    const view = () => checkpointView(state, requestId);
    const control = (reason: string): CheckpointResult => ({ control: state.stopped ? 'answer_required' : 'progress_required', reason, ...view() });
    if (command.kind === 'inspect') return view();
    if (command.kind === 'settle') {
        const action = state.actions.find(item => item.id === command.id);
        if (action) {
            action.state = command.failed ? 'failed' : 'completed';
            action.result = command.result.slice(0, 6000);
            const entry = state.entries.find(item => item.id === command.id);
            if (entry) {
                entry.state = action.state;
                entry.revision++;
            }
        }
        return view();
    }
    if (command.kind === 'reserve') {
        if (state.stopped) return control('Stop calling tools. Answer from the available results and explain unfinished work.');
        const prior = state.actions.find(item => item.id === command.id);
        if (prior) return control('This action was already accepted. Do not execute it twice.');
        if (!state.stage || state.stage !== command.stage || state.actions.length >= MAX_STAGE_ACTIONS)
            return control(
                'Before further actions, publish a concise factual update using this checkpointId, then select the next stage. You may instead answer directly if sufficient evidence is available.',
            );
        state.actions.push({ id: command.id, toolName: command.toolName, state: 'running' });
        state.entries.push({ id: command.id, eventId: command.id, sequence: state.entries.length, revision: 0, kind: 'tool', toolName: command.toolName, state: 'running' });
        return { accepted: true, ...view() };
    }
    state.attempts = (state.attempts ?? 0) + 1;
    if (state.attempts > MAX_PROGRESS_PUBLICATIONS + 2) state.stopped = true;
    const prior = typeof command.checkpointId === 'string' && Object.hasOwn(state.publications, command.checkpointId) ? state.publications[command.checkpointId] : undefined;
    if (prior) return { published: true, duplicate: true, ...(state.stopped ? control('Progress attempt budget exhausted. Answer now with available evidence.') : view()) };
    if (state.stopped) return control('Progress budget exhausted. Answer now; explain unfinished work.');
    const text = typeof command.text === 'string' ? command.text.trim() : '';
    const invalid =
        command.checkpointId !== view().checkpointId ||
        !CHAT_STAGES.includes(command.nextStage as ChatStage) ||
        text.length < 12 ||
        text.length > 2000 ||
        /^(已完成|完成了?|completed|done)\s*\d*\s*(个动作|actions?)[。.!\s]*$/i.test(text) ||
        state.actions.some(action => action.state === 'running') ||
        (state.revision > 0 && state.actions.length === 0 && command.nextStage === state.stage);
    if (invalid) {
        state.failures++;
        if (state.failures >= 2) state.stopped = true;
        return control(
            'Invalid progress: use the current checkpointId, wait for all actions to finish, and describe specific findings, limitations and the next step in 1–3 sentences. Do not merely count actions.',
        );
    }
    if (state.revision >= MAX_PROGRESS_PUBLICATIONS) {
        state.stopped = true;
        return control('Progress budget exhausted. Answer with available evidence.');
    }
    const id = view().checkpointId;
    state.publications[id] = { text, nextStage: command.nextStage as ChatStage };
    state.entries.push({
        id: `checkpoint:${id}`,
        sequence: state.entries.length,
        revision: 0,
        kind: 'text',
        phase: 'commentary',
        text,
        coveredActionIds: state.actions.map(action => action.id),
    });
    state.revision++;
    state.stage = command.nextStage as ChatStage;
    state.actions = [];
    state.failures = 0;
    return { published: true, ...view() };
}
