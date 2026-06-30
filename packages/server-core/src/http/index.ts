import http from 'node:http';

import { handleDoryMcpRequest, type DoryMcpServerContext } from '../mcp';
import { authenticateDoryMcpToken } from '../tokens';

export type DoryMcpHttpOptions = {
    host: string;
    port: number;
    origin?: string | null;
    allowedOrigins?: string[];
    allowRemote?: boolean;
    context: Omit<DoryMcpServerContext, 'auth'> & { tokenAuthFallback?: DoryMcpServerContext['auth'] };
};

function isLocalHost(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

function normalizeOrigin(value: string | null | undefined) {
    if (!value) return null;
    try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}`;
    } catch {
        return null;
    }
}

export function isAllowedOrigin(req: Request, allowedOrigins: string[] = []) {
    const origin = normalizeOrigin(req.headers.get('origin'));
    if (!origin) return true;
    const requestOrigin = normalizeOrigin(req.url);
    if (requestOrigin && origin === requestOrigin) return true;
    try {
        if (isLocalHost(new URL(origin).hostname)) return true;
    } catch {
        return false;
    }
    return allowedOrigins.map(normalizeOrigin).includes(origin);
}

function extractBearerToken(req: Request) {
    const authorization = req.headers.get('authorization') ?? '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
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

function requestFromIncoming(req: http.IncomingMessage, body: Buffer, baseUrl: string) {
    const url = new URL(req.url ?? '/', baseUrl);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'undefined') continue;
        if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
        } else {
            headers.set(name, value);
        }
    }
    return new Request(url, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : new Uint8Array(body),
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

export async function authenticateDoryMcpHttpRequest(req: Request, input: Pick<DoryMcpHttpOptions, 'allowedOrigins' | 'context'>) {
    if (!isAllowedOrigin(req, input.allowedOrigins ?? [])) {
        return { ok: false as const, response: jsonRpcError(403, 'MCP origin is not trusted.') };
    }

    const token = extractBearerToken(req);
    if (!token) {
        return { ok: false as const, response: jsonRpcError(401, 'Missing MCP bearer token.') };
    }

    try {
        const { auth } = await authenticateDoryMcpToken(input.context.db, token);
        return { ok: true as const, auth };
    } catch {
        return { ok: false as const, response: jsonRpcError(401, 'Invalid MCP bearer token.') };
    }
}

export async function startDoryMcpHttpServer(options: DoryMcpHttpOptions) {
    if (!isLocalHost(options.host) && options.host !== '0.0.0.0') {
        throw new Error(`Refusing to bind non-local host: ${options.host}`);
    }
    if (options.host === '0.0.0.0' && !options.allowRemote) {
        throw new Error('Refusing to bind 0.0.0.0 without --allow-remote.');
    }

    const baseUrl = options.origin ?? `http://${options.host}:${options.port}`;
    const allowedOrigins = [baseUrl, ...(options.allowedOrigins ?? [])];
    const server = http.createServer((incoming, outgoing) => {
        void (async () => {
            const body = await readBody(incoming);
            const request = requestFromIncoming(incoming, body, baseUrl);
            const pathname = new URL(request.url).pathname;

            if (pathname === '/health') {
                await writeResponse(outgoing, json(200, { ok: true, endpoint: `${baseUrl.replace(/\/$/, '')}/api/mcp` }));
                return;
            }
            if (pathname !== '/api/mcp' && pathname !== '/mcp') {
                await writeResponse(outgoing, json(404, { error: 'Not found' }));
                return;
            }
            if (request.method === 'GET') {
                await writeResponse(outgoing, json(405, { error: 'MCP Streamable HTTP GET is not enabled in Dory headless v1.' }));
                return;
            }

            const auth = await authenticateDoryMcpHttpRequest(request, {
                allowedOrigins,
                context: options.context,
            });
            if (!auth.ok) {
                await writeResponse(outgoing, auth.response);
                return;
            }

            await writeResponse(
                outgoing,
                await handleDoryMcpRequest(request, {
                    db: options.context.db,
                    auth: auth.auth,
                    requestOrigin: baseUrl,
                    workspaceOrigin: baseUrl,
                }),
            );
        })().catch(async error => {
            await writeResponse(outgoing, json(500, { error: error instanceof Error ? error.message : String(error) }));
        });
    });

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host, () => {
            server.off('error', reject);
            resolve();
        });
    });

    process.stderr.write(`Dory headless MCP listening at ${baseUrl.replace(/\/$/, '')}/api/mcp\n`);

    const close = async () => {
        await new Promise<void>(resolve => server.close(() => resolve()));
    };
    process.once('SIGINT', () => void close().finally(() => process.exit(0)));
    process.once('SIGTERM', () => void close().finally(() => process.exit(0)));
}
