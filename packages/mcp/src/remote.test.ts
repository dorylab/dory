import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createRemoteMcpClient, normalizeToolResult } from './remote.js';

function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')));
        req.on('error', reject);
    });
}

function writeJson(res: http.ServerResponse, status: number, body: unknown) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(text),
    });
    res.end(text);
}

test('remote client lists tools and forwards tool calls over Streamable HTTP', async () => {
    const calls: unknown[] = [];
    const server = http.createServer((req, res) => {
        void (async () => {
            if (req.method === 'GET') {
                writeJson(res, 405, { error: 'GET disabled' });
                return;
            }
            if (req.headers.authorization !== 'Bearer dory_mcp_test_token') {
                writeJson(res, 401, { error: 'unauthorized' });
                return;
            }

            const message = (await readBody(req)) as { id?: string | number; method?: string; params?: any };
            calls.push(message);
            if (message.id === undefined || message.id === null) {
                res.writeHead(202);
                res.end();
                return;
            }

            if (message.method === 'initialize') {
                writeJson(res, 200, {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: {
                        protocolVersion: '2025-11-25',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'fake-dory', version: '1.0.0' },
                    },
                });
                return;
            }

            if (message.method === 'tools/list') {
                writeJson(res, 200, {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: {
                        tools: [
                            {
                                name: 'dory_echo',
                                description: 'Echo input',
                                inputSchema: {
                                    type: 'object',
                                    properties: { value: { type: 'string' } },
                                },
                            },
                        ],
                    },
                });
                return;
            }

            if (message.method === 'tools/call') {
                writeJson(res, 200, {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: {
                        content: [{ type: 'text', text: JSON.stringify(message.params.arguments) }],
                        structuredContent: { echoed: message.params.arguments },
                    },
                });
                return;
            }

            writeJson(res, 400, { error: 'unexpected method' });
        })().catch(error => {
            writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        });
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    assert.ok(address?.port);

    try {
        const remote = await createRemoteMcpClient(`http://127.0.0.1:${address.port}/api/mcp`, 'dory_mcp_test_token');
        try {
            const tools = await remote.client.listTools();
            const result = normalizeToolResult(await remote.client.callTool({ name: 'dory_echo', arguments: { value: 'hello' } }));

            assert.deepEqual(
                tools.tools.map(tool => tool.name),
                ['dory_echo'],
            );
            assert.deepEqual(result.structuredContent, { echoed: { value: 'hello' } });
            assert.ok(calls.some(call => (call as { method?: string }).method === 'tools/call'));
        } finally {
            await remote.close();
        }
    } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
