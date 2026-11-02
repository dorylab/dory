import { ActionError, executeAction as executeRegisteredAction } from '@dory/actions';
import type { ActionContext, ActionExecutionEnvelope, ActionId, ExecuteActionOptions } from '@dory/actions';
import { DrizzleQueryError } from 'drizzle-orm';
import { webActionRegistry } from './registry';
import type { WebActionServices } from './types';

export async function executeAction<TOutput = unknown>(
    ctx: ActionContext<WebActionServices>,
    actionId: ActionId,
    input: unknown,
    options?: ExecuteActionOptions,
): Promise<ActionExecutionEnvelope<TOutput>> {
    try {
        return await executeRegisteredAction<TOutput, WebActionServices>(webActionRegistry, ctx, actionId, input, options);
    } catch (error) {
        // Query errors include bound parameters, which can contain entire reports.
        if (error instanceof ActionError && error.cause instanceof DrizzleQueryError) {
            throw new ActionError('ACTION_EXECUTION_FAILED', 'Unable to access application storage. Please try again.', { cause: error });
        }
        throw error;
    }
}
