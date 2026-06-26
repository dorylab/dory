import type { ActionContext, ActionDefinition } from '@dory/actions';
import { DEFAULT_ACTION_PROJECTION_BY_ACTOR, toActionError } from '@dory/actions';
import { executeAction } from '../execute';
import type { WebActionServices } from '../types';

function isZodObjectSchema(schema: unknown) {
    if (!schema || typeof schema !== 'object') return false;

    const candidate = schema as {
        _zod?: { def?: { type?: string; shape?: unknown } };
        _def?: { typeName?: string; type?: string };
        shape?: unknown;
    };

    return (
        candidate._zod?.def?.type === 'object' ||
        candidate._zod?.def?.shape !== undefined ||
        candidate._def?.typeName === 'ZodObject' ||
        candidate._def?.type === 'object' ||
        candidate.shape !== undefined
    );
}

export function structuredMcpActionResult(data: unknown) {
    const structuredContent = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : { value: data };

    return {
        isError: false as const,
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent,
    };
}

function structuredMcpActionError(error: unknown) {
    const actionError = toActionError(error);
    const output = {
        ok: false,
        error: {
            code: actionError.code,
            message: actionError.message,
            details: actionError.details ?? null,
        },
    };

    return {
        isError: true as const,
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(output, null, 2),
            },
        ],
        structuredContent: output,
    };
}

export function actionToMcpTool(
    action: ActionDefinition<any, any, WebActionServices>,
    createContext: () => Promise<ActionContext<WebActionServices>> | ActionContext<WebActionServices>,
) {
    if (!action.exposure.mcp || action.exposure.mcp.exposed === false) {
        throw new Error(`Action "${action.id}" is not exposed as an MCP tool.`);
    }

    const projection = action.exposure.defaultProjection?.mcp ?? DEFAULT_ACTION_PROJECTION_BY_ACTOR.mcp;
    const outputSchema = action.exposure.projections?.[projection]?.schema ?? action.outputSchema;

    return {
        action,
        name: action.exposure.mcp.name,
        title: action.exposure.mcp.title,
        description: action.exposure.mcp.description,
        inputSchema: action.inputSchema,
        outputSchema: isZodObjectSchema(outputSchema) ? outputSchema : undefined,
        annotations: {
            readOnlyHint: action.risk === 'read',
            destructiveHint: action.risk === 'destructive',
            idempotentHint: action.risk === 'read',
            openWorldHint: true,
        },
        execute: async (input: unknown) => {
            try {
                const ctx = await createContext();
                const { data } = await executeAction(ctx, action.id, input ?? {});
                return structuredMcpActionResult(data);
            } catch (error) {
                return structuredMcpActionError(error);
            }
        },
    };
}
