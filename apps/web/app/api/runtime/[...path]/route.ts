import { NextResponse } from 'next/server';
import { getDBService } from '@dory/database';
import {
    createDoryMcpToken,
    createHeadlessUserActionContext,
    executeDoryAction,
    getDoryAction,
    getFirstActiveDoryMcpToken,
    listDoryActions,
    resolveDoryRuntimeIdentity,
    resolveDoryStorageProfile,
} from '@dory/server-core';
import type { ActionId } from '@dory/actions';

export const runtime = 'nodejs';

const RUNTIME_SECRET_HEADER = 'x-dory-runtime-secret';

function json(status: number, payload: unknown) {
    return NextResponse.json(payload, { status });
}

function assertRuntimeSecret(req: Request) {
    const secret = process.env.DORY_LOCAL_RUNTIME_SECRET;
    return Boolean(secret && req.headers.get(RUNTIME_SECRET_HEADER) === secret);
}

type RuntimeRouteContext = {
    params: Promise<{ path: string[] }>;
};

function pathOf(ctx: RuntimeRouteContext) {
    return ctx.params.then(params => `/${params.path.join('/')}`);
}

async function resolveIdentity() {
    const profile = resolveDoryStorageProfile({
        profile: process.env.DORY_RUNTIME === 'desktop' ? 'desktop' : 'headless',
        userDataDir: process.env.DORY_DESKTOP_USER_DATA_PATH,
    });
    return resolveDoryRuntimeIdentity(profile);
}

export async function GET(req: Request, ctx: RuntimeRouteContext) {
    if (!assertRuntimeSecret(req)) {
        return json(401, { ok: false, error: 'Invalid local runtime secret.' });
    }

    const route = await pathOf(ctx);
    if (route === '/info') {
        return json(200, {
            ok: true,
            identity: await resolveIdentity(),
        });
    }
    if (route === '/actions') {
        return json(200, { ok: true, actions: listDoryActions() });
    }
    if (route === '/mcp-token/list') {
        const db = await getDBService();
        const identity = await resolveIdentity();
        return json(200, { ok: true, tokens: await db.mcp.listTokens(identity.organizationId) });
    }

    return json(404, { ok: false, error: 'Not found' });
}

export async function POST(req: Request, ctx: RuntimeRouteContext) {
    if (!assertRuntimeSecret(req)) {
        return json(401, { ok: false, error: 'Invalid local runtime secret.' });
    }

    const route = await pathOf(ctx);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = await getDBService();
    const identity = await resolveIdentity();

    if (route === '/action') {
        const actionId = typeof body.actionId === 'string' ? body.actionId : null;
        if (!actionId) return json(400, { ok: false, error: 'Missing actionId.' });
        const action = getDoryAction(actionId);
        if (!action) return json(404, { ok: false, error: `Unknown action: ${actionId}` });

        const actionCtx = await createHeadlessUserActionContext({
            db,
            userId: identity.userId,
            organizationId: identity.organizationId,
        });
        const result = await executeDoryAction(actionCtx, action.id as ActionId, body.input ?? {}, {
            projection: typeof body.projection === 'string' ? (body.projection as any) : undefined,
            confirmationToken: typeof body.confirmationToken === 'string' ? body.confirmationToken : null,
        });
        return json(200, { ok: true, ...result });
    }

    if (route === '/mcp-token/ensure') {
        const existing = await getFirstActiveDoryMcpToken(db, identity.organizationId, identity.userId);
        if (existing) return json(200, { ok: true, token: null, record: existing });
        const created = await createDoryMcpToken({
            db,
            organizationId: identity.organizationId,
            userId: identity.userId,
            name: 'Dory Local Runtime MCP',
        });
        return json(200, { ok: true, token: created.token, record: created.record });
    }

    if (route === '/mcp-token/create') {
        const created = await createDoryMcpToken({
            db,
            organizationId: identity.organizationId,
            userId: identity.userId,
            name: typeof body.name === 'string' ? body.name : undefined,
        });
        return json(200, { ok: true, token: created.token, tokenRecord: created.record });
    }

    if (route === '/mcp-token/revoke') {
        const id = typeof body.id === 'string' ? body.id : null;
        if (!id) return json(400, { ok: false, error: 'Missing token id.' });
        return json(200, { ok: true, revoked: await db.mcp.revokeToken(identity.organizationId, id) });
    }

    return json(404, { ok: false, error: 'Not found' });
}
