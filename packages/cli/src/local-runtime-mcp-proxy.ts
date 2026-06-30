import http from 'node:http';

export type LocalRuntimeMcpProxyOptions = {
    host: string;
    port: number;
    runtimeBaseUrl: string;
    origin?: string | null;
    allowRemote?: boolean;
    token?: string | null;
};

const RUNTIME_SECRET_HEADER = 'x-dory-runtime-secret';
const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'content-length',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    RUNTIME_SECRET_HEADER,
]);

function isLocalHost(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

function json(status: number, payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function jsonRpcError(status: number, message: string) {
    return json(status, {
        jsonrpc: '2.0',
        error: {
            code: status === 401 ? -32001 : -32000,
            message,
        },
        id: null,
    });
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function writeResponse(res: http.ServerResponse, response: Response) {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
        headers[name] = value;
    });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
}

function bearerTokenFromHeaders(headers: http.IncomingHttpHeaders) {
    const authorization = headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    const match = value?.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

export function validateLocalRuntimeMcpProxyOptions(options: Pick<LocalRuntimeMcpProxyOptions, 'host' | 'allowRemote' | 'token'>) {
    if (!isLocalHost(options.host) && options.host !== '0.0.0.0') {
        throw new Error(`Refusing to bind non-local host: ${options.host}`);
    }
    if (options.host === '0.0.0.0' && !options.allowRemote) {
        throw new Error('Refusing to bind 0.0.0.0 without --allow-remote.');
    }
    if (options.host === '0.0.0.0' && !options.token?.trim()) {
        throw new Error('HTTP remote bind requires --token <existing-token>. Create one with dory mcp token create first.');
    }
}

export function buildLocalRuntimeMcpForwardHeaders(headers: http.IncomingHttpHeaders) {
    const out = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        const lowerName = name.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lowerName) || lowerName === 'origin' || typeof value === 'undefined') {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) out.append(name, item);
        } else {
            out.set(name, value);
        }
    }
    return out;
}

function proxyBaseUrl(options: LocalRuntimeMcpProxyOptions) {
    return options.origin?.replace(/\/$/, '') || `http://${options.host}:${options.port}`;
}

async function proxyMcpRequest(req: http.IncomingMessage, options: LocalRuntimeMcpProxyOptions) {
    const configuredToken = options.token?.trim() || null;
    const bearerToken = bearerTokenFromHeaders(req.headers);
    if (!bearerToken) {
        return jsonRpcError(401, 'Missing MCP bearer token.');
    }
    if (configuredToken && bearerToken !== configuredToken) {
        return jsonRpcError(401, 'Invalid MCP bearer token.');
    }

    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const target = new URL('/api/mcp', options.runtimeBaseUrl.replace(/\/$/, ''));
    const upstream = await fetch(target, {
        method: req.method,
        headers: buildLocalRuntimeMcpForwardHeaders(req.headers),
        body: body ? new Uint8Array(body) : undefined,
    });
    const headers = new Headers(upstream.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    headers.delete('transfer-encoding');
    return new Response(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers,
    });
}

export async function startLocalRuntimeMcpHttpProxy(options: LocalRuntimeMcpProxyOptions) {
    validateLocalRuntimeMcpProxyOptions(options);
    const baseUrl = proxyBaseUrl(options);
    const endpoint = `${baseUrl}/api/mcp`;

    const server = http.createServer((incoming, outgoing) => {
        void (async () => {
            const pathname = new URL(incoming.url ?? '/', baseUrl).pathname;
            if (pathname === '/health') {
                await writeResponse(
                    outgoing,
                    json(200, {
                        ok: true,
                        endpoint,
                        runtimeEndpoint: `${options.runtimeBaseUrl.replace(/\/$/, '')}/api/mcp`,
                    }),
                );
                return;
            }
            if (pathname !== '/api/mcp' && pathname !== '/mcp') {
                await writeResponse(outgoing, json(404, { error: 'Not found' }));
                return;
            }
            await writeResponse(outgoing, await proxyMcpRequest(incoming, options));
        })().catch(async error => {
            await writeResponse(outgoing, json(502, { error: error instanceof Error ? error.message : String(error) }));
        });
    });

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host, () => {
            server.off('error', reject);
            resolve();
        });
    });

    process.stderr.write(`Dory MCP HTTP proxy listening at ${endpoint}\n`);

    const close = async () => {
        await new Promise<void>(resolve => server.close(() => resolve()));
    };
    process.once('SIGINT', () => void close().finally(() => process.exit(0)));
    process.once('SIGTERM', () => void close().finally(() => process.exit(0)));

    return { endpoint, close };
}
