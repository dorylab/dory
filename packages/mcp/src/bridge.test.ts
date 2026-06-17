import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBridgeServer } from './bridge.js';
import type { RemoteMcpClient } from './remote.js';

test('bridge forwards tools/list schemas and tools/call without rewriting remote tools', async () => {
    const calls: unknown[] = [];
    const remote = {
        client: {
            async listTools() {
                return {
                    tools: [
                        {
                            name: 'dory_echo',
                            description: 'Echo input',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    value: { type: 'string' },
                                },
                                required: ['value'],
                            },
                        },
                    ],
                };
            },
            async callTool(params: unknown) {
                calls.push(params);
                return {
                    content: [{ type: 'text' as const, text: 'ok' }],
                    structuredContent: { ok: true },
                };
            },
        },
        async close() {},
    } as unknown as RemoteMcpClient;

    const server = await createBridgeServer(remote);
    const client = new Client({
        name: 'bridge-test-client',
        version: '1.0.0',
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        const tools = await client.listTools();
        assert.deepEqual(tools.tools[0]?.inputSchema, {
            type: 'object',
            properties: {
                value: { type: 'string' },
            },
            required: ['value'],
        });

        const result = await client.callTool({
            name: 'dory_echo',
            arguments: { value: 'hello' },
        });

        assert.deepEqual(result.structuredContent, { ok: true });
        assert.deepEqual(calls, [
            {
                name: 'dory_echo',
                arguments: { value: 'hello' },
            },
        ]);
    } finally {
        await client.close().catch(() => undefined);
        await server.close().catch(() => undefined);
    }
});

test('bridge forwards remote tool error results without rewriting them', async () => {
    const remote = {
        client: {
            async listTools() {
                return {
                    tools: [
                        {
                            name: 'dory_needs_scope',
                            description: 'Requires a missing scope',
                            inputSchema: {
                                type: 'object',
                                properties: {},
                            },
                        },
                    ],
                };
            },
            async callTool() {
                return {
                    isError: true,
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify({
                                ok: false,
                                error: {
                                    code: 'ACTION_SCOPE_MISSING',
                                    message: 'Missing action scope "tabs:write".',
                                },
                            }),
                        },
                    ],
                    structuredContent: {
                        ok: false,
                        error: {
                            code: 'ACTION_SCOPE_MISSING',
                            message: 'Missing action scope "tabs:write".',
                        },
                    },
                };
            },
        },
        async close() {},
    } as unknown as RemoteMcpClient;

    const server = await createBridgeServer(remote);
    const client = new Client({
        name: 'bridge-error-test-client',
        version: '1.0.0',
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        const result = (await client.callTool({
            name: 'dory_needs_scope',
            arguments: {},
        })) as any;

        assert.equal(result.isError, true);
        assert.equal(result.structuredContent.error.code, 'ACTION_SCOPE_MISSING');
    } finally {
        await client.close().catch(() => undefined);
        await server.close().catch(() => undefined);
    }
});
