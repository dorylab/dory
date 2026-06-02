import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listMcpActions } from '@dory/actions';
import { actionToMcpTool } from '@/lib/actions/server/adapters/mcp';
import { webActionRegistry } from '@/lib/actions/server/registry';
import type { McpAuthContext } from './auth';
export { clampDoryToolLimit as clampMcpLimit, matchSchemaSearch, normalizeMonitoringFilters } from '@/lib/ai/tools/dory-tool-utils';

export function registerDoryMcpTools(server: McpServer, context: McpAuthContext) {
    const tools = listMcpActions(webActionRegistry as any, 'mcp').map(tool =>
        actionToMcpTool(tool.action as any, async () => {
            const { createMcpActionContext } = await import('@/lib/actions/server/context');
            return createMcpActionContext(context);
        }),
    );

    for (const tool of tools) {
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema as any,
                outputSchema: tool.outputSchema as any,
            },
            async (input: unknown) => tool.execute(input),
        );
    }
}
