import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRemoteMcpClient, normalizeToolResult, type RemoteMcpClient } from './bridge-remote.js';

const BRIDGE_VERSION = '0.1.0';

export async function createBridgeServer(remote: RemoteMcpClient) {
    const toolList = await remote.client.listTools();
    const server = new Server(
        {
            name: 'dory',
            version: BRIDGE_VERSION,
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => toolList);
    server.setRequestHandler(CallToolRequestSchema, async request => normalizeToolResult(await remote.client.callTool(request.params)));

    return server;
}

export async function startBridge({ endpoint, token }: { endpoint: string; token: string }) {
    const remote = await createRemoteMcpClient(endpoint, token);
    const server = await createBridgeServer(remote);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    const close = async () => {
        await server.close().catch(() => undefined);
        await remote.close().catch(() => undefined);
    };

    process.once('SIGINT', () => {
        void close().finally(() => process.exit(0));
    });
    process.once('SIGTERM', () => {
        void close().finally(() => process.exit(0));
    });
}
