import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { DBService } from '@dory/database';
import type { McpAccessTokenRecord } from '@dory/database/postgres/impl/mcp';
import type { OrganizationPermissionMap, OrganizationRole } from '@dory/shared/types/organization';

export const MCP_TOKEN_PREFIX = 'dory_mcp_';

export const MCP_DEFAULT_SCOPES = [
    'read',
    'write',
    'local_ai:run',
] as const;

export type DoryOrganizationAccess = {
    source: 'local' | 'desktop_cloud';
    organizationId: string;
    userId: string;
    isMember: boolean;
    role: OrganizationRole | null;
    permissions: OrganizationPermissionMap;
    organization: {
        id: string;
        slug?: string | null;
        name?: string | null;
    } | null;
};

export type DoryMcpAuthContext = {
    userId: string;
    organizationId: string;
    tokenId: string | null;
    scopes: string[];
    access: DoryOrganizationAccess;
    requestOrigin?: string | null;
    workspaceOrigin?: string | null;
};

const ROLE_PERMISSIONS: Record<OrganizationRole, OrganizationPermissionMap> = {
    owner: {
        organization: { read: true, update: true, delete: true },
        member: { read: true, create: true, update: true, delete: true },
        invitation: { read: true, create: true, cancel: true },
        workspace: { read: true, write: true },
        connection: { read: true, create: true, update: true, delete: true },
    },
    admin: {
        organization: { read: true, update: true, delete: false },
        member: { read: true, create: true, update: true, delete: true },
        invitation: { read: true, create: true, cancel: true },
        workspace: { read: true, write: true },
        connection: { read: true, create: true, update: true, delete: true },
    },
    member: {
        organization: { read: true, update: false, delete: false },
        member: { read: true, create: false, update: false, delete: false },
        invitation: { read: true, create: false, cancel: false },
        workspace: { read: true, write: true },
        connection: { read: true, create: false, update: false, delete: false },
    },
    viewer: {
        organization: { read: true, update: false, delete: false },
        member: { read: true, create: false, update: false, delete: false },
        invitation: { read: true, create: false, cancel: false },
        workspace: { read: true, write: false },
        connection: { read: true, create: false, update: false, delete: false },
    },
};

function normalizeRole(value: string | null | undefined): OrganizationRole | null {
    return value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}

function parseDateMs(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

function parseSnapshotOrganization(value: unknown): DoryOrganizationAccess['organization'] {
    const record = asRecord(value);
    if (!record) return null;
    const id = asString(record.id);
    if (!id) return null;

    return {
        id,
        slug: asString(record.slug),
        name: asString(record.name),
    };
}

function parseSnapshotAccess(value: unknown, now: number, accessExpiresAt: unknown): DoryOrganizationAccess | null {
    const expiresAt = parseDateMs(accessExpiresAt);
    if (expiresAt === null || expiresAt <= now) return null;

    const record = asRecord(value);
    if (!record) return null;

    const organizationId = asString(record.organizationId);
    const userId = asString(record.userId);
    const permissions = asRecord(record.permissions);
    if (!organizationId || !userId || !permissions || typeof record.isMember !== 'boolean') return null;

    return {
        source: record.source === 'local' ? 'local' : 'desktop_cloud',
        organizationId,
        userId,
        isMember: record.isMember,
        role: normalizeRole(asString(record.role)),
        permissions: permissions as OrganizationPermissionMap,
        organization: parseSnapshotOrganization(record.organization),
    };
}

export function readDesktopAuthSnapshotAccess(options: { userDataDir?: string | null; now?: number } = {}) {
    const userDataDir = options.userDataDir ?? process.env.DORY_DESKTOP_USER_DATA_PATH;
    if (!userDataDir) return null;

    const snapshotPath = path.join(userDataDir, 'desktop-auth-snapshot.json');
    if (!existsSync(snapshotPath)) return null;

    try {
        const now = options.now ?? Date.now();
        const record = asRecord(JSON.parse(readFileSync(snapshotPath, 'utf8')));
        if (!record || record.version !== 1) return null;

        const expiresAt = parseDateMs(record.expiresAt);
        if (expiresAt === null || expiresAt <= now) return null;

        const userRecord = asRecord(record.user);
        const userId = asString(userRecord?.id);
        const activeOrganizationId = asString(record.activeOrganizationId);
        const access = parseSnapshotAccess(record.access, now, record.accessExpiresAt);
        if (!userId || !activeOrganizationId || !access || access.userId !== userId || access.organizationId !== activeOrganizationId) return null;

        return {
            userId,
            organizationId: activeOrganizationId,
            access,
        };
    } catch {
        return null;
    }
}

export async function resolveDoryOrganizationAccess(db: DBService, organizationId: string, userId: string): Promise<DoryOrganizationAccess> {
    const snapshot = readDesktopAuthSnapshotAccess();
    if (snapshot?.userId === userId && snapshot.organizationId === organizationId) {
        return snapshot.access;
    }

    const organization = await db.organizations.getOrganizationBySlugOrId(organizationId);
    const members = await db.organizations.listByUser(userId);
    const member = members.find(item => item.organizationId === organizationId && (item.status === 'active' || item.status == null));
    const role = normalizeRole(member?.role ?? (organization?.ownerUserId === userId ? 'owner' : null));

    if (!role) {
        throw Object.assign(new Error('MCP token owner no longer has access to this organization.'), {
            status: 403,
            code: 'MCP_FORBIDDEN',
        });
    }

    return {
        source: 'local',
        organizationId,
        userId,
        isMember: true,
        role,
        permissions: ROLE_PERMISSIONS[role],
        organization: organization
            ? {
                  id: organization.id,
                  slug: organization.slug ?? null,
                  name: organization.name ?? null,
              }
            : {
                  id: organizationId,
                  slug: organizationId,
                  name: organizationId,
              },
    };
}

export function hashMcpToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

export function generateMcpToken() {
    return `${MCP_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export async function createDoryMcpToken(input: { db: DBService; organizationId: string; userId: string; name?: string | null; scopes?: string[] | null }) {
    const token = generateMcpToken();
    const record = await input.db.mcp.createToken({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        name: input.name?.trim() || 'Dory MCP',
        scopes: input.scopes?.length ? input.scopes : [...MCP_DEFAULT_SCOPES],
        tokenHash: hashMcpToken(token),
        tokenPrefix: token.slice(0, MCP_TOKEN_PREFIX.length + 8),
    });

    return { token, record };
}

export async function buildDoryMcpAuthContextForTokenRecord(
    db: DBService,
    record: McpAccessTokenRecord,
    options: { requestOrigin?: string | null; workspaceOrigin?: string | null } = {},
): Promise<DoryMcpAuthContext> {
    const access = await resolveDoryOrganizationAccess(db, record.organizationId, record.createdByUserId);
    if (!access.permissions.workspace.read || !access.permissions.connection.read) {
        throw Object.assign(new Error('MCP token owner no longer has MCP access to this organization.'), {
            status: 403,
            code: 'MCP_FORBIDDEN',
        });
    }

    return {
        userId: record.createdByUserId,
        organizationId: record.organizationId,
        tokenId: record.id,
        scopes: Array.isArray(record.scopes) ? record.scopes : [],
        access,
        requestOrigin: options.requestOrigin ?? null,
        workspaceOrigin: options.workspaceOrigin ?? null,
    };
}

export async function authenticateDoryMcpToken(
    db: DBService,
    token: string,
    options: { requestOrigin?: string | null; workspaceOrigin?: string | null } = {},
): Promise<{ auth: DoryMcpAuthContext; record: McpAccessTokenRecord }> {
    const normalized = token.trim();
    if (!normalized.startsWith(MCP_TOKEN_PREFIX)) {
        throw Object.assign(new Error('Invalid MCP bearer token.'), { status: 401, code: 'MCP_INVALID_TOKEN' });
    }

    const record = await db.mcp.getActiveTokenByHash(hashMcpToken(normalized));
    if (!record) {
        throw Object.assign(new Error('Invalid MCP bearer token.'), { status: 401, code: 'MCP_INVALID_TOKEN' });
    }

    await db.mcp.markTokenUsed(record.id);
    return {
        record,
        auth: await buildDoryMcpAuthContextForTokenRecord(db, record, options),
    };
}

export async function getFirstActiveDoryMcpToken(db: DBService, organizationId: string, userId?: string | null) {
    const tokens = userId ? await db.mcp.listTokensForUser(organizationId, userId) : await db.mcp.listTokens(organizationId);
    return tokens.find(token => token.enabled && !token.revokedAt) ?? null;
}
