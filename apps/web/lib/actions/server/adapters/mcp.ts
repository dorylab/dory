import type { ActionContext, ActionDefinition } from '@dory/actions';
import { DEFAULT_ACTION_PROJECTION_BY_ACTOR } from '@dory/actions';
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
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent: data as Record<string, unknown>,
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
        execute: async (input: unknown) => {
            const ctx = await createContext();
            return structuredMcpActionResult(await executeAction(ctx, action.id, input ?? {}));
        },
    };
}
