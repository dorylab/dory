import { tool } from 'ai';
import type { ActionContext, ActionDefinition } from '@dory/actions';
import { executeAction } from '../execute';
import type { WebActionServices } from '../types';

export function toAgentToolName(actionId: string) {
    return actionId.replace(/[^a-zA-Z0-9_]/g, '_');
}

function toAgentToolResult<T extends Record<string, unknown>>(value: T) {
    return {
        ok: true,
        ...value,
    };
}

function toAgentToolError(error: unknown) {
    const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    return {
        ok: false,
        error: {
            code: typeof record.code === 'string' ? record.code : 'TOOL_EXECUTION_FAILED',
            message: error instanceof Error ? error.message : String(error ?? 'Tool execution failed'),
        },
    };
}

export function actionToAgentTool(
    action: ActionDefinition<any, any, WebActionServices>,
    createContext: () => Promise<ActionContext<WebActionServices>> | ActionContext<WebActionServices>,
) {
    return tool({
        description: action.exposure.mcp?.description ?? action.id,
        inputSchema: action.inputSchema as any,
        execute: async input => {
            try {
                const ctx = await createContext();
                const { data: output } = await executeAction<Record<string, unknown>>(ctx, action.id, input ?? {});
                return toAgentToolResult(output && typeof output === 'object' && !Array.isArray(output) ? output : { data: output });
            } catch (error) {
                return toAgentToolError(error);
            }
        },
    });
}
