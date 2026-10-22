import type { DBService } from '@dory/database';

type ChatRunEnd = {
    isAborted?: boolean;
    finishReason?: string;
    outcome?: { status: 'completed' | 'failed' | 'aborted' | 'unknown' };
};

export function createChatAgentRunLifecycle(options: {
    works: Pick<DBService['works'], 'startChatTurn' | 'finishChatTurn'>;
    organizationId: string;
    userId: string;
    chatId: string;
    requestId: string;
    connectionId?: string | null;
    title?: string | null;
    signal: AbortSignal;
    requireSummary?: boolean;
}) {
    let workPromise: ReturnType<typeof options.works.startChatTurn> | undefined;
    let finishPromise: Promise<void> | undefined;
    let hasError = false;

    const finish = (event: ChatRunEnd): Promise<void> => {
        if (finishPromise) return finishPromise;
        if (!workPromise) return Promise.resolve();

        const outcome =
            event.isAborted || options.signal.aborted || event.outcome?.status === 'aborted'
                ? 'aborted'
                : hasError || event.outcome?.status === 'failed' || event.finishReason === 'error'
                  ? 'failed'
                  : event.outcome?.status === 'completed' || (event.finishReason && event.finishReason !== 'unknown' && event.finishReason !== 'other')
                    ? 'completed'
                    : 'failed';

        finishPromise = workPromise.then(async work => {
            await options.works.finishChatTurn({
                organizationId: options.organizationId,
                userId: options.userId,
                workId: work.workId,
                requestId: options.requestId,
                outcome,
                requireSummary: options.requireSummary,
            });
        });
        return finishPromise;
    };

    return {
        resolve() {
            workPromise ??= options.works.startChatTurn({
                organizationId: options.organizationId,
                userId: options.userId,
                connectionId: options.connectionId ?? null,
                tokenId: null,
                externalSessionId: `chat:${options.chatId}`,
                title: options.title ?? 'Chat Agent Run',
                metadata: { chatId: options.chatId, source: 'internal_chat' },
                requestId: options.requestId,
            });
            return workPromise;
        },
        finish,
        fail() {
            hasError = true;
            return finish({ outcome: { status: 'failed' } });
        },
    };
}
