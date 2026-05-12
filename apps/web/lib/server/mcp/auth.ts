import { createHash, randomBytes } from 'node:crypto';
import { getDBService } from '@dory/database';

export const MCP_TOKEN_PREFIX = 'dory_mcp_';
export const MCP_DEFAULT_SCOPES = ['connections:read', 'query:read', 'analysis:run', 'schema:read', 'saved_queries:read', 'monitoring:read'] as const;

export type McpAuthContext = {
    tokenId: string;
    organizationId: string;
    userId: string;
    scopes: string[];
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

    const enabled = await db.mcp.isOrganizationEnabled(record.organizationId);
    if (!enabled) {
        return {
            ok: false,
            status: 403,
            message: 'MCP is disabled for this organization.',
        };
    }

    await db.mcp.markTokenUsed(record.id);

    return {
        ok: true,
        context: {
            tokenId: record.id,
            organizationId: record.organizationId,
            userId: record.createdByUserId,
            scopes: Array.isArray(record.scopes) ? record.scopes : [],
        },
    };
}

export function hasMcpScope(context: McpAuthContext, scope: string) {
    if (scope === 'schema:read' && context.scopes.includes('connections:read')) {
        return true;
    }

    return context.scopes.includes(scope);
}
