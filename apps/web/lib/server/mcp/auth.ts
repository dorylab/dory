import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDBService } from '@dory/database';
import { hasActionScope } from '@dory/actions';
import type { OrganizationAccess } from '@/lib/server/authz';
import type { McpAccessTokenRecord } from '@dory/database/postgres/impl/mcp';
import { isDesktopRuntime } from '@dory/shared/runtime';
import { getExternalRequestOrigin, getWorkspaceRequestOrigin } from '@/lib/server/request-origin';

export const MCP_TOKEN_PREFIX = 'dory_mcp_';
export const MCP_DESKTOP_GRANT_HEADER = 'x-dory-mcp-desktop-grant';
export const MCP_DEFAULT_SCOPES = [
    'read',
    'write',
    'local_ai:run',
] as const;
export const MCP_LEGACY_FINE_SCOPES = [
    'connections:read',
    'connections:write',
    'query:read',
    'query:write',
    'analysis:run',
    'schema:read',
    'tabs:read',
    'tabs:write',
    'saved_queries:read',
    'saved_queries:write',
    'monitoring:read',
    'comparisons:read',
    'comparisons:write',
] as const;
export const MCP_LOCAL_AI_SCOPE = 'local_ai:run';
export const MCP_ALLOWED_SCOPES = [...MCP_DEFAULT_SCOPES, ...MCP_LEGACY_FINE_SCOPES] as const;
export const MCP_LINK_SCOPES = [...MCP_ALLOWED_SCOPES] as const;

const MCP_DESKTOP_GRANT_TYPE = 'dory_mcp_desktop_grant';
const MCP_DESKTOP_GRANT_TTL_MS = 12 * 60 * 60 * 1000;

export type McpAuthContext = {
    tokenId: string;
    organizationId: string;
    userId: string;
    scopes: string[];
    access: OrganizationAccess;
    requestOrigin?: string | null;
    workspaceOrigin?: string | null;
};

export type McpAuthResult =
    | {
          ok: true;
          context: McpAuthContext;
      }
    | {
          ok: false;
          status: number;
          message: string;
      };

function parseCsvEnv(name: string): string[] {
    return (process.env[name] ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function normalizeOrigin(value: string | null): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}`;
    } catch {
        return null;
    }
}

function originFromRequest(req: Request): string | null {
    try {
        const url = new URL(req.url);
        return `${url.protocol}//${url.host}`;
    } catch {
        return null;
    }
}

function isLocalHost(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

export function isAllowedMcpOrigin(req: Request): boolean {
    const origin = normalizeOrigin(req.headers.get('origin'));
    if (!origin) return true;

    const requestOrigin = originFromRequest(req);
    if (requestOrigin && origin === requestOrigin) return true;

    try {
        if (isLocalHost(new URL(origin).hostname)) return true;
    } catch {
        return false;
    }

    const trusted = parseCsvEnv('TRUSTED_ORIGINS')
        .map(normalizeOrigin)
        .filter((item): item is string => Boolean(item));
    return trusted.includes(origin);
}

export function hashMcpToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

export function generateMcpToken() {
    const token = `${MCP_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    return {
        token,
        tokenHash: hashMcpToken(token),
        tokenPrefix: token.slice(0, MCP_TOKEN_PREFIX.length + 8),
    };
}

export function extractBearerToken(req: Request): string | null {
    const authorization = req.headers.get('authorization') ?? '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

type McpTokenAccessResult =
    | {
          ok: true;
          context: McpAuthContext;
      }
    | {
          ok: false;
          status: number;
          message: string;
      };

type McpTokenAccessDeps = {
    resolveAccess?: (organizationId: string, userId: string) => Promise<OrganizationAccess | null>;
};

type McpDesktopGrantPayload = {
    v: 1;
    typ: typeof MCP_DESKTOP_GRANT_TYPE;
    userId: string;
    organizationId: string;
    scopes: string[];
    access?: OrganizationAccess;
    iat: number;
    exp: number;
};

type McpDesktopGrantAccessDeps = McpTokenAccessDeps & {
    now?: number;
    secret?: string;
};

async function resolveDefaultMcpTokenAccess(organizationId: string, userId: string) {
    const { resolveOrganizationAccess } = await import('@/lib/server/authz');
    return resolveOrganizationAccess(organizationId, userId);
}

export async function buildMcpAuthContextForToken(record: McpAccessTokenRecord, deps: McpTokenAccessDeps = {}): Promise<McpTokenAccessResult> {
    const access = await (deps.resolveAccess ?? resolveDefaultMcpTokenAccess)(record.organizationId, record.createdByUserId);
    if (!access?.isMember || !access.permissions.workspace.read || !access.permissions.connection.read) {
        return {
            ok: false,
            status: 403,
            message: 'MCP token owner no longer has access to this organization.',
        };
    }

    return {
        ok: true,
        context: {
            tokenId: record.id,
            organizationId: record.organizationId,
            userId: record.createdByUserId,
            scopes: Array.isArray(record.scopes) ? record.scopes : [],
            access,
        },
    };
}

function getMcpDesktopGrantSecret(secret = process.env.DS_SECRET_KEY?.trim() ?? '') {
    if (!secret) {
        throw new Error('DS_SECRET_KEY is required to issue MCP desktop grants.');
    }
    return secret;
}

function encodeGrantPart(value: unknown) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signGrantPayload(encodedPayload: string, secret: string) {
    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(a: string, b: string) {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

function parseGrantPayload(value: unknown): McpDesktopGrantPayload | null {
    const payload = value as Partial<McpDesktopGrantPayload> | null;
    if (!payload || payload.v !== 1 || payload.typ !== MCP_DESKTOP_GRANT_TYPE) return null;
    if (typeof payload.userId !== 'string' || !payload.userId) return null;
    if (typeof payload.organizationId !== 'string' || !payload.organizationId) return null;
    if (!Array.isArray(payload.scopes) || !payload.scopes.every(scope => typeof scope === 'string' && scope.length > 0)) return null;
    if (typeof payload.access !== 'undefined' && (!payload.access || typeof payload.access !== 'object')) return null;
    if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null;
    return payload as McpDesktopGrantPayload;
}

export function issueMcpDesktopGrant({
    userId,
    organizationId,
    scopes = [...MCP_DEFAULT_SCOPES],
    access,
    now = Date.now(),
    expiresInMs = MCP_DESKTOP_GRANT_TTL_MS,
    secret,
}: {
    userId: string;
    organizationId: string;
    scopes?: string[];
    access?: OrganizationAccess;
    now?: number;
    expiresInMs?: number;
    secret?: string;
}) {
    const payload: McpDesktopGrantPayload = {
        v: 1,
        typ: MCP_DESKTOP_GRANT_TYPE,
        userId,
        organizationId,
        scopes,
        ...(access ? { access } : {}),
        iat: now,
        exp: now + expiresInMs,
    };
    const encodedPayload = encodeGrantPart(payload);
    const signature = signGrantPayload(encodedPayload, getMcpDesktopGrantSecret(secret));
    return {
        grant: `${encodedPayload}.${signature}`,
        expiresAt: new Date(payload.exp),
    };
}

export function verifyMcpDesktopGrant(
    grant: string | null,
    { now = Date.now(), secret, ignoreExpiration = false }: { now?: number; secret?: string; ignoreExpiration?: boolean } = {},
) {
    if (!grant) return null;
    const [encodedPayload, signature, extra] = grant.split('.');
    if (!encodedPayload || !signature || extra) return null;

    const expectedSignature = signGrantPayload(encodedPayload, getMcpDesktopGrantSecret(secret));
    if (!safeEqual(signature, expectedSignature)) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }

    const payload = parseGrantPayload(parsed);
    if (!payload || (!ignoreExpiration && payload.exp <= now)) return null;
    return payload;
}

export async function buildMcpAuthContextForDesktopGrant(
    grant: string | null,
    deps: McpDesktopGrantAccessDeps & { ignoreExpiration?: boolean } = {},
): Promise<McpTokenAccessResult> {
    let payload: McpDesktopGrantPayload | null;
    try {
        payload = verifyMcpDesktopGrant(grant, { now: deps.now, secret: deps.secret, ignoreExpiration: deps.ignoreExpiration });
    } catch {
        payload = null;
    }

    if (!payload) {
        return {
            ok: false,
            status: 401,
            message: 'Missing or invalid MCP desktop grant.',
        };
    }

    const access = deps.resolveAccess
        ? await deps.resolveAccess(payload.organizationId, payload.userId)
        : (payload.access ?? (await resolveDefaultMcpTokenAccess(payload.organizationId, payload.userId)));
    if (!access?.isMember || !access.permissions.workspace.read || !access.permissions.connection.read) {
        return {
            ok: false,
            status: 403,
            message: 'MCP desktop grant owner no longer has access to this organization.',
        };
    }

    return {
        ok: true,
        context: {
            tokenId: 'desktop-grant',
            organizationId: payload.organizationId,
            userId: payload.userId,
            scopes: payload.scopes,
            access,
        },
    };
}

export async function authenticateMcpRequest(req: Request): Promise<McpAuthResult> {
    if (!isAllowedMcpOrigin(req)) {
        return {
            ok: false,
            status: 403,
            message: 'MCP origin is not trusted.',
        };
    }

    const token = extractBearerToken(req);
    if (!token || !token.startsWith(MCP_TOKEN_PREFIX)) {
        if (isDesktopRuntime()) {
            const result = await buildMcpAuthContextForDesktopGrant(req.headers.get(MCP_DESKTOP_GRANT_HEADER));
            if (result.ok) {
                result.context.requestOrigin = getExternalRequestOrigin(req);
                result.context.workspaceOrigin = getWorkspaceRequestOrigin(req);
            }
            return result;
        }

        return {
            ok: false,
            status: 401,
            message: 'Missing or invalid MCP bearer token.',
        };
    }

    const db = await getDBService();
    const record = await db.mcp.getActiveTokenByHash(hashMcpToken(token));
    if (!record) {
        return {
            ok: false,
            status: 401,
            message: 'MCP bearer token is invalid or revoked.',
        };
    }

    const context = await buildMcpAuthContextForToken(record);
    if (!context.ok) return context;

    await db.mcp.markTokenUsed(record.id);

    context.context.requestOrigin = getExternalRequestOrigin(req);
    context.context.workspaceOrigin = getWorkspaceRequestOrigin(req);

    return context;
}

export function hasMcpScope(context: McpAuthContext, scope: string) {
    return hasActionScope(context.scopes, scope);
}
