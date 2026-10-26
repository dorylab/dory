import type { ActionContext } from '@dory/actions';
import type { WebActionServices } from './types';

/** Users can inspect their private results in the UI. Agents are confined to their current chat. */
export async function attachmentReadAccess(ctx: ActionContext<WebActionServices>) {
    if (ctx.actor.type === 'user') return { userId: ctx.userId };
    const work = ctx.services.agentTurn
        ? await ctx.services.db.works.getById({ organizationId: ctx.organizationId, userId: ctx.userId, workId: ctx.services.agentTurn.workId })
        : null;
    return { userId: ctx.userId, chatId: typeof work?.metadata?.chatId === 'string' ? work.metadata.chatId : null };
}
