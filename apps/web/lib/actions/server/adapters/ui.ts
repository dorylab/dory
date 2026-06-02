import type { ActionExecutionEnvelope, ActionId, ExecuteActionOptions } from '@dory/actions';
import type { ActionContext } from '@dory/actions';
import { executeAction } from '../execute';
import type { WebActionServices } from '../types';

export function executeUiAction<TOutput = unknown>(
    ctx: ActionContext<WebActionServices>,
    actionId: ActionId,
    input: unknown,
    options: ExecuteActionOptions = {},
): Promise<ActionExecutionEnvelope<TOutput>> {
    return executeAction<TOutput>(ctx, actionId, input, {
        ...options,
        projection: options.projection ?? 'ui',
    });
}
