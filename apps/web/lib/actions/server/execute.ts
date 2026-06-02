import { executeAction as executeRegisteredAction } from '@dory/actions';
import type { ActionContext, ActionExecutionEnvelope, ActionId, ExecuteActionOptions } from '@dory/actions';
import { webActionRegistry } from './registry';
import type { WebActionServices } from './types';

export function executeAction<TOutput = unknown>(
    ctx: ActionContext<WebActionServices>,
    actionId: ActionId,
    input: unknown,
    options?: ExecuteActionOptions,
): Promise<ActionExecutionEnvelope<TOutput>> {
    return executeRegisteredAction<TOutput, WebActionServices>(webActionRegistry, ctx, actionId, input, options);
}
