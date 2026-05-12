import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { McpAuthContext } from './auth';
import { registerDoryMcpTools } from './tools';

export async function handleDoryMcpRequest(req: Request, context: McpAuthContext): Promise<Response> {
    const server = new McpServer({
        name: 'dory',
        version: '0.12.2',
    });

    registerDoryMcpTools(server, context);

    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });

    await server.connect(transport);

    try {
        return await transport.handleRequest(req);
    } finally {
        await server.close().catch(() => undefined);
    }
}
