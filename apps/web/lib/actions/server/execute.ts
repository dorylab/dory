import { executeAction as executeRegisteredAction } from '@dory/actions';
import type { ActionContext, ActionId, ExecuteActionOptions } from '@dory/actions';
import { webActionRegistry } from './registry';
import type { WebActionServices } from './types';

export function executeAction<TOutput = unknown>(ctx: ActionContext<WebActionServices>, actionId: ActionId, input: unknown, options?: ExecuteActionOptions): Promise<TOutput> {
    return executeRegisteredAction<TOutput, WebActionServices>(webActionRegistry, ctx, actionId, input, options);
}
