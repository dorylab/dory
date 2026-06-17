import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from './auth';
import { getPublicDoryMcpTools, structuredMcpFacadeError, structuredMcpFacadeResult } from './facade-tools';
export { clampDoryToolLimit as clampMcpLimit, matchSchemaSearch, normalizeMonitoringFilters } from '@/lib/ai/tools/dory-tool-utils';

export function registerDoryMcpTools(server: McpServer, context: McpAuthContext) {
    const tools = getPublicDoryMcpTools();

    for (const tool of tools) {
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema as any,
                outputSchema: tool.outputSchema as any,
                annotations: tool.annotations,
            },
            async (input: unknown) => {
                try {
                    const { createMcpActionContext } = await import('@/lib/actions/server/context');
                    const ctx = await createMcpActionContext(context);
                    return structuredMcpFacadeResult(await tool.execute(ctx, input ?? {}));
                } catch (error) {
                    return structuredMcpFacadeError(error);
                }
            },
        );
    }
}
