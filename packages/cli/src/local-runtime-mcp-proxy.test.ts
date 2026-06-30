import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildLocalRuntimeMcpForwardHeaders, validateLocalRuntimeMcpProxyOptions } from './local-runtime-mcp-proxy.js';

test('local runtime MCP proxy rejects remote bind without explicit token', () => {
    assert.throws(
        () =>
            validateLocalRuntimeMcpProxyOptions({
                host: '0.0.0.0',
                allowRemote: true,
                token: null,
            }),
        /requires --token/,
    );
});

test('local runtime MCP proxy rejects non-local bind without allow-remote semantics', () => {
    assert.throws(
        () =>
            validateLocalRuntimeMcpProxyOptions({
                host: '192.168.1.10',
                allowRemote: true,
                token: 'dory_mcp_token',
            }),
        /Refusing to bind non-local host/,
    );
});

test('local runtime MCP proxy strips hop-by-hop, origin, and runtime secret headers', () => {
    const headers = buildLocalRuntimeMcpForwardHeaders({
        authorization: 'Bearer dory_mcp_token',
        connection: 'keep-alive',
        'content-length': '123',
        host: 'example.test',
        origin: 'https://client.test',
        'x-dory-runtime-secret': 'secret',
        'x-custom-header': 'kept',
    });

    assert.equal(headers.get('authorization'), 'Bearer dory_mcp_token');
    assert.equal(headers.get('x-custom-header'), 'kept');
    assert.equal(headers.has('connection'), false);
    assert.equal(headers.has('content-length'), false);
    assert.equal(headers.has('host'), false);
    assert.equal(headers.has('origin'), false);
    assert.equal(headers.has('x-dory-runtime-secret'), false);
});
