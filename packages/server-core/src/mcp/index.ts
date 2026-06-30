import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { DBService } from '@dory/database';

import { getPublicDoryMcpTools, structuredMcpFacadeError, structuredMcpFacadeResult } from '../../../../apps/web/lib/server/mcp/facade-tools';
import type { DoryMcpAuthContext } from '../tokens';
import { createHeadlessActionContext } from '../runtime';

const SERVER_VERSION = '0.12.2';

export type DoryMcpServerContext = {
    db: DBService;
    auth: DoryMcpAuthContext;
    requestOrigin?: string | null;
    workspaceOrigin?: string | null;
};

export function createDoryMcpServer(context: DoryMcpServerContext) {
    const server = new McpServer({
        name: 'dory',
        version: SERVER_VERSION,
    });
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
                    const ctx = createHeadlessActionContext({
                        db: context.db,
                        auth: context.auth,
                        requestOrigin: context.requestOrigin ?? null,
                        workspaceOrigin: context.workspaceOrigin ?? null,
                    });
                    return structuredMcpFacadeResult(await tool.execute(ctx, input ?? {}));
                } catch (error) {
                    return structuredMcpFacadeError(error);
                }
            },
        );
    }

    return server;
}

export async function handleDoryMcpRequest(req: Request, context: DoryMcpServerContext): Promise<Response> {
    const server = createDoryMcpServer(context);
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

export async function handleDoryMcpHttpRequest(req: Request, context: DoryMcpServerContext): Promise<Response> {
    return handleDoryMcpRequest(req, context);
}

export async function serveDoryMcpStdio(context: DoryMcpServerContext) {
    const server = createDoryMcpServer(context);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
