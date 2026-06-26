import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const CLIENT_VERSION = '0.1.0';

export type RemoteMcpClient = {
    client: Client;
    close: () => Promise<void>;
};

export function normalizeToolResult(result: Awaited<ReturnType<Client['callTool']>>): CallToolResult {
    if ('content' in result && Array.isArray(result.content)) {
        return result as CallToolResult;
    }

    const payload = 'toolResult' in result ? result.toolResult : result;
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(payload, null, 2),
            },
        ],
        structuredContent: typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>) : { value: payload },
    };
}

export async function createRemoteMcpClient(endpoint: string, token: string): Promise<RemoteMcpClient> {
    const client = new Client({
        name: 'dory-mcp-stdio-bridge',
        version: CLIENT_VERSION,
    });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: {
            headers: {
                authorization: `Bearer ${token}`,
            },
        },
    });

    await client.connect(transport);

    return {
        client,
        close: () => client.close(),
    };
}
