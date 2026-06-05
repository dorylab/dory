import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import type { McpAuthContext } from './auth';
import { registerDoryMcpTools } from './tools';

const MCP_RESPONSE_TIMEOUT_MS = 30_000;

function getHeaderRecord(headers: Headers) {
    return Object.fromEntries(headers.entries());
}

function isJsonRpcRequestWithId(message: JSONRPCMessage) {
    return 'method' in message && 'id' in message && message.id !== undefined;
}

function getExpectedResponseCount(message: JSONRPCMessage | JSONRPCMessage[]) {
    const messages = Array.isArray(message) ? message : [message];
    return messages.filter(isJsonRpcRequestWithId).length;
}

class WebJsonMcpTransport implements Transport {
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;

    private readonly responses: JSONRPCMessage[] = [];
    private expectedResponseCount = 0;
    private responsePromise: Promise<JSONRPCMessage[]>;
    private resolveResponses!: (responses: JSONRPCMessage[]) => void;
    private timeout: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly req: Request) {
        this.responsePromise = new Promise(resolve => {
            this.resolveResponses = resolve;
        });
    }

    async start() {}

    async send(message: JSONRPCMessage, _options?: TransportSendOptions) {
        this.responses.push(message);
        if (this.expectedResponseCount === 0 || this.responses.length >= this.expectedResponseCount) {
            this.finish();
        }
    }

    async close() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.onclose?.();
    }

    async handleRequest() {
        const body = (await this.req.json()) as JSONRPCMessage | JSONRPCMessage[];
        this.expectedResponseCount = getExpectedResponseCount(body);

        if (this.expectedResponseCount === 0) {
            this.dispatch(body);
            return new Response(null, { status: 202 });
        }

        this.timeout = setTimeout(() => {
            this.onerror?.(new Error('Timed out waiting for MCP response'));
            this.finish();
        }, MCP_RESPONSE_TIMEOUT_MS);

        this.dispatch(body);

        const responses = await this.responsePromise;
        const payload = Array.isArray(body) ? responses : responses[0];
        return Response.json(payload ?? null);
    }

    private dispatch(body: JSONRPCMessage | JSONRPCMessage[]) {
        const extra: MessageExtraInfo = {
            requestInfo: {
                headers: getHeaderRecord(this.req.headers),
            },
        };
        const messages = Array.isArray(body) ? body : [body];

        for (const message of messages) {
            this.onmessage?.(message, extra);
        }
    }

    private finish() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.resolveResponses(this.responses);
    }
}

export async function handleDoryMcpRequest(req: Request, context: McpAuthContext): Promise<Response> {
    const server = new McpServer({
        name: 'dory',
        version: '0.12.2',
    });

    registerDoryMcpTools(server, context);

    const transport = new WebJsonMcpTransport(req);

    await server.connect(transport);

    try {
        return await transport.handleRequest();
    } finally {
        await server.close().catch(() => undefined);
    }
}
