import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listMcpActions } from '@dory/actions';
import { executeAction } from '@/lib/actions/server/execute';
import { webActionRegistry } from '@/lib/actions/server/registry';
import type { McpAuthContext } from './auth';
export { clampDoryToolLimit as clampMcpLimit, matchSchemaSearch, normalizeMonitoringFilters } from '@/lib/ai/tools/dory-tool-utils';

function structured(data: unknown) {
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

export function registerDoryMcpTools(server: McpServer, context: McpAuthContext) {
    const tools = listMcpActions(webActionRegistry as any, 'mcp');

    for (const tool of tools) {
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema as any,
                outputSchema: tool.outputSchema as any,
            },
            async (input: unknown) => {
                const { createMcpActionContext } = await import('@/lib/actions/server/context');
                const actionContext = await createMcpActionContext(context);
                return structured(await executeAction(actionContext, tool.action.id, input ?? {}));
            },
        );
    }
}
