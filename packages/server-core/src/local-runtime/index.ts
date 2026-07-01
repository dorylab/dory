import fs from 'node:fs';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import type { ActionId } from '@dory/actions';

import type { BootstrapDoryRuntimeOptions, BootstrappedDoryRuntime } from '../runtime';
import { resolveDoryStorageProfile, type DoryStorageProfile, type ResolveDoryStorageProfileOptions } from '../storage';
import { createDoryMcpToken, getFirstActiveDoryMcpToken } from '../tokens';

export const DORY_LOCAL_RUNTIME_PROTOCOL_VERSION = 1;
export const DORY_LOCAL_RUNTIME_STATE_FILE = 'local-runtime.json';
export const DORY_LOCAL_RUNTIME_LOCK_FILE = 'local-runtime.lock';
export const DORY_LOCAL_RUNTIME_SECRET_HEADER = 'x-dory-runtime-secret';

export type DoryLocalRuntimeState = {
    version: 1;
    protocolVersion: number;
    pid: number;
    baseUrl: string;
    secret: string;
    profile: 'desktop' | 'headless';
    dbType: 'pglite' | 'postgres';
    userDataDir: string;
    pglitePath?: string;
    startedAt: string;
};

export type DoryLocalRuntimePaths = {
    statePath: string;
    lockPath: string;
};

export type StartDoryLocalRuntimeServerOptions = BootstrapDoryRuntimeOptions & {
    host?: string;
    port?: number;
    origin?: string | null;
    allowedOrigins?: string[];
    secret?: string;
    onReady?: (state: DoryLocalRuntimeState) => void;
};

type RuntimeHttpContext = {
    runtime: BootstrappedDoryRuntime;
    secret: string;
    baseUrl: string;
};

function json(status: number, payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function unauthorized() {
    return json(401, { ok: false, error: 'Invalid local runtime secret.' });
}

function getHeader(req: Request, name: string) {
    return req.headers.get(name) ?? '';
}

function isLocalHost(host: string) {
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function assertLocalBind(host: string) {
    if (!isLocalHost(host)) {
        throw new Error(`Dory Local Runtime only supports local bind hosts, got ${host}.`);
    }
}

function parseRequestBody(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function requestFromIncoming(req: http.IncomingMessage, body: Buffer, baseUrl: string) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'undefined') continue;
        if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
        } else {
            headers.set(name, value);
        }
    }

    return new Request(new URL(req.url ?? '/', baseUrl), {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : new Uint8Array(body),
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

async function readJson(req: Request) {
    if (req.method === 'GET' || req.method === 'HEAD') return null;
    const text = await req.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as Record<string, unknown>;
}

function requireRuntimeSecret(req: Request, secret: string) {
    return getHeader(req, DORY_LOCAL_RUNTIME_SECRET_HEADER) === secret;
}

function publicProfile(profile: DoryStorageProfile) {
    return {
        profile: profile.profile,
        dbType: profile.dbType,
        userDataDir: profile.userDataDir,
        pglitePath: profile.pglitePath,
        databaseUrl: profile.databaseUrl ? 'configured' : undefined,
    };
}

export function resolveDoryLocalRuntimePaths(input: ResolveDoryStorageProfileOptions): DoryLocalRuntimePaths {
    const profile = resolveDoryStorageProfile(input);
    return {
        statePath: path.join(profile.userDataDir, DORY_LOCAL_RUNTIME_STATE_FILE),
        lockPath: path.join(profile.userDataDir, DORY_LOCAL_RUNTIME_LOCK_FILE),
    };
}

export async function readDoryLocalRuntimeState(input: ResolveDoryStorageProfileOptions): Promise<DoryLocalRuntimeState | null> {
    const paths = resolveDoryLocalRuntimePaths(input);
    try {
        const parsed = JSON.parse(await readFile(paths.statePath, 'utf8')) as Partial<DoryLocalRuntimeState>;
        if (parsed.version !== 1 || typeof parsed.baseUrl !== 'string' || typeof parsed.secret !== 'string' || typeof parsed.pid !== 'number') {
            return null;
        }
        return parsed as DoryLocalRuntimeState;
    } catch {
        return null;
    }
}

export async function probeDoryLocalRuntime(state: DoryLocalRuntimeState): Promise<boolean> {
    for (const pathName of ['/health', '/api/health']) {
        try {
            const response = await fetch(`${state.baseUrl}${pathName}`, {
                headers: {
                    [DORY_LOCAL_RUNTIME_SECRET_HEADER]: state.secret,
                },
            });
            if (!response.ok) continue;
            const payload = (await response.json()) as { ok?: unknown; protocolVersion?: unknown };
            if (payload.ok === true && payload.protocolVersion === DORY_LOCAL_RUNTIME_PROTOCOL_VERSION) return true;
        } catch {
            // Try the next health path.
        }
    }
    return false;
}

function isProcessAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function acquireRuntimeLock(profile: DoryStorageProfile, paths: DoryLocalRuntimePaths) {
    await mkdir(profile.userDataDir, { recursive: true, mode: 0o700 });

    try {
        const handle = await open(paths.lockPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
        return async () => {
            await handle.close().catch(() => undefined);
            await rm(paths.lockPath, { force: true }).catch(() => undefined);
        };
    } catch (error) {
        const state = await readDoryLocalRuntimeState({ profile: profile.profile, userDataDir: profile.userDataDir, pglitePath: profile.pglitePath, databaseUrl: profile.databaseUrl });
        if (state && isProcessAlive(state.pid) && (await probeDoryLocalRuntime(state))) {
            throw new Error(`Dory Local Runtime is already running at ${state.baseUrl}.`);
        }
        await rm(paths.lockPath, { force: true }).catch(() => undefined);
        const handle = await open(paths.lockPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), staleRecovered: true }));
        return async () => {
            await handle.close().catch(() => undefined);
            await rm(paths.lockPath, { force: true }).catch(() => undefined);
        };
    }
}

async function choosePort(host: string, preferred?: number) {
    if (preferred && preferred > 0) return preferred;

    return new Promise<number>((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, host, () => {
            const address = server.address();
            server.close(() => {
                if (!address || typeof address === 'string') reject(new Error('Unable to allocate local runtime port.'));
                else resolve(address.port);
            });
        });
    });
}

async function ensureLocalMcpToken(runtime: BootstrappedDoryRuntime) {
    const existing = await getFirstActiveDoryMcpToken(runtime.db, runtime.identity.organizationId, runtime.identity.userId);
    if (existing) {
        return { token: null, record: existing };
    }
    return createDoryMcpToken({
        db: runtime.db,
        organizationId: runtime.identity.organizationId,
        userId: runtime.identity.userId,
        name: 'Dory Local Runtime MCP',
    });
}

async function handleRuntimeApi(req: Request, ctx: RuntimeHttpContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
        if (!requireRuntimeSecret(req, ctx.secret)) return unauthorized();
        return json(200, {
            ok: true,
            protocolVersion: DORY_LOCAL_RUNTIME_PROTOCOL_VERSION,
            pid: process.pid,
            baseUrl: ctx.baseUrl,
            identity: ctx.runtime.identity,
            storage: publicProfile(ctx.runtime.profile),
        });
    }

    if (url.pathname === '/api/runtime/info') {
        if (!requireRuntimeSecret(req, ctx.secret)) return unauthorized();
        return json(200, {
            ok: true,
            identity: ctx.runtime.identity,
            storage: publicProfile(ctx.runtime.profile),
        });
    }

    if (url.pathname === '/api/runtime/actions' && req.method === 'GET') {
        if (!requireRuntimeSecret(req, ctx.secret)) return unauthorized();
        const { listDoryActions } = await import('../runtime');
        return json(200, { ok: true, actions: listDoryActions() });
    }

    if (url.pathname === '/api/runtime/action' && req.method === 'POST') {
        if (!requireRuntimeSecret(req, ctx.secret)) return unauthorized();
        const body = (await readJson(req)) ?? {};
        const actionId = typeof body.actionId === 'string' ? body.actionId : null;
        if (!actionId) return json(400, { ok: false, error: 'Missing actionId.' });

        const { createHeadlessUserActionContext, executeDoryAction, getDoryAction } = await import('../runtime');
        const action = getDoryAction(actionId);
        if (!action) return json(404, { ok: false, error: `Unknown action: ${actionId}` });

        const actionCtx = await createHeadlessUserActionContext({
            db: ctx.runtime.db,
            userId: ctx.runtime.identity.userId,
            organizationId: ctx.runtime.identity.organizationId,
        });
        const result = await executeDoryAction(actionCtx, action.id as ActionId, body.input ?? {}, {
            projection: typeof body.projection === 'string' ? (body.projection as any) : undefined,
            confirmationToken: typeof body.confirmationToken === 'string' ? body.confirmationToken : null,
        });
        return json(200, { ok: true, ...result });
    }

    if (url.pathname === '/api/runtime/mcp-token/ensure' && req.method === 'POST') {
        if (!requireRuntimeSecret(req, ctx.secret)) return unauthorized();
        const token = await ensureLocalMcpToken(ctx.runtime);
        return json(200, { ok: true, ...token });
    }

    if (url.pathname === '/api/runtime/mcp-token/create' && req.method === 'POST') {
        if (!requireRuntimeSecret(req, ctx.secret)) return unauthorized();
        const body = (await readJson(req)) ?? {};
        const scopes = Array.isArray(body.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0) : undefined;
        const created = await createDoryMcpToken({
            db: ctx.runtime.db,
            organizationId: ctx.runtime.identity.organizationId,
            userId: ctx.runtime.identity.userId,
            name: typeof body.name === 'string' ? body.name : undefined,
            scopes,
        });
        return json(200, { ok: true, token: created.token, tokenRecord: created.record });
    }

    if (url.pathname === '/api/runtime/mcp-token/list' && req.method === 'GET') {
        if (!requireRuntimeSecret(req, ctx.secret)) return unauthorized();
        return json(200, { ok: true, tokens: await ctx.runtime.db.mcp.listTokens(ctx.runtime.identity.organizationId) });
    }

    if (url.pathname === '/api/runtime/mcp-token/revoke' && req.method === 'POST') {
        if (!requireRuntimeSecret(req, ctx.secret)) return unauthorized();
        const body = (await readJson(req)) ?? {};
        const id = typeof body.id === 'string' ? body.id : null;
        if (!id) return json(400, { ok: false, error: 'Missing token id.' });
        return json(200, { ok: true, revoked: await ctx.runtime.db.mcp.revokeToken(ctx.runtime.identity.organizationId, id) });
    }

    return json(404, { ok: false, error: 'Not found' });
}

async function handleLocalRuntimeRequest(req: Request, ctx: RuntimeHttpContext, allowedOrigins: string[]): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/mcp' || url.pathname === '/mcp') {
        if (req.method === 'GET') {
            return json(405, { error: 'MCP Streamable HTTP GET is not enabled in Dory Local Runtime v1.' });
        }
        const { authenticateDoryMcpHttpRequest } = await import('../http');
        const { handleDoryMcpRequest } = await import('../mcp');
        const auth = await authenticateDoryMcpHttpRequest(req, {
            allowedOrigins,
            context: {
                db: ctx.runtime.db,
            },
        });
        if (!auth.ok) return auth.response;
        return handleDoryMcpRequest(req, {
            db: ctx.runtime.db,
            auth: auth.auth,
            requestOrigin: ctx.baseUrl,
            workspaceOrigin: ctx.baseUrl,
        });
    }

    return handleRuntimeApi(req, ctx);
}

export async function startDoryLocalRuntimeServer(options: StartDoryLocalRuntimeServerOptions = {}) {
    const host = options.host ?? '127.0.0.1';
    assertLocalBind(host);

    const profile = resolveDoryStorageProfile(options);
    if (profile.dbType !== 'pglite') {
        throw new Error('Dory Local Runtime is only used for local PGlite profiles.');
    }

    const paths = resolveDoryLocalRuntimePaths(options);
    const releaseLock = await acquireRuntimeLock(profile, paths);
    const port = await choosePort(host, options.port);
    const baseUrl = options.origin?.replace(/\/$/, '') ?? `http://${host}:${port}`;
    const secret = options.secret ?? randomBytes(32).toString('base64url');

    process.env.DORY_LOCAL_RUNTIME_OWNER = '1';
    const { bootstrapDoryRuntime, shutdownDoryRuntime } = await import('../runtime');
    const runtime = await bootstrapDoryRuntime({
        ...options,
        direct: true,
    });

    const allowedOrigins = [baseUrl, ...(options.allowedOrigins ?? [])];
    const server = http.createServer((incoming, outgoing) => {
        void (async () => {
            const body = await parseRequestBody(incoming);
            const request = requestFromIncoming(incoming, body, baseUrl);
            await writeResponse(outgoing, await handleLocalRuntimeRequest(request, { runtime, secret, baseUrl }, allowedOrigins));
        })().catch(async error => {
            await writeResponse(outgoing, json(500, { ok: false, error: error instanceof Error ? error.message : String(error) }));
        });
    });

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            resolve();
        });
    });

    const state: DoryLocalRuntimeState = {
        version: 1,
        protocolVersion: DORY_LOCAL_RUNTIME_PROTOCOL_VERSION,
        pid: process.pid,
        baseUrl,
        secret,
        profile: profile.profile,
        dbType: profile.dbType,
        userDataDir: profile.userDataDir,
        pglitePath: profile.pglitePath,
        startedAt: new Date().toISOString(),
    };
    await writeFile(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    options.onReady?.(state);

    const close = async () => {
        await new Promise<void>(resolve => server.close(() => resolve()));
        await rm(paths.statePath, { force: true }).catch(() => undefined);
        await shutdownDoryRuntime().catch(() => undefined);
        await releaseLock();
    };

    process.once('SIGINT', () => void close().finally(() => process.exit(0)));
    process.once('SIGTERM', () => void close().finally(() => process.exit(0)));

    return { state, close };
}

export async function callDoryLocalRuntime<T>(state: DoryLocalRuntimeState, pathName: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${state.baseUrl}${pathName}`, {
        method: options.method ?? (options.body ? 'POST' : 'GET'),
        headers: {
            'content-type': 'application/json',
            [DORY_LOCAL_RUNTIME_SECRET_HEADER]: state.secret,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = (await response.json().catch(() => null)) as T & { error?: string };
    if (!response.ok) {
        throw new Error(payload?.error ?? `Dory Local Runtime request failed: ${response.status}`);
    }
    return payload;
}
