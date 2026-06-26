import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { getDBService, type DBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { migrateDB } from '@dory/database/postgres/migrate';
import { migratePgliteDB } from '@dory/database/pglite/migrate-pglite';
import { resetPgliteClient } from '@dory/database/postgres/client/pglite';
import { organizationMembers, organizations, user } from '@dory/database/postgres/schemas';
import { registerDatabaseDrivers } from '@dory/drivers/database/register';
import { newEntityId } from '@dory/shared/id';
import type { ActionActorType, ActionContext, ActionDefinition, ActionId, ExecuteActionOptions } from '@dory/actions';
import { executeAction as executeRegisteredAction } from '@dory/actions';
import { eq, or, isNull } from 'drizzle-orm';

import { resolveDoryStorageProfile, type DoryStorageProfile, type DoryStorageProfileName } from '../storage';
import { readDesktopAuthSnapshotAccess, resolveDoryOrganizationAccess, type DoryMcpAuthContext } from '../tokens';
import { createWebActionAuditSink } from '../../../../apps/web/lib/actions/server/action-audit';
import { webActionRegistry } from '../../../../apps/web/lib/actions/server/registry';
import type { WebActionServices } from '../../../../apps/web/lib/actions/server/types';

export type BootstrapDoryRuntimeOptions = {
    profile?: DoryStorageProfileName;
    userDataDir?: string;
    pglitePath?: string;
    databaseUrl?: string;
    trustedOrigins?: string[];
    skipMigrate?: boolean;
};

export type DoryRuntimeIdentity = {
    userId: string;
    organizationId: string;
};

export type BootstrappedDoryRuntime = {
    profile: DoryStorageProfile;
    db: DBService;
    identity: DoryRuntimeIdentity;
};

function applyRuntimeEnv(profile: DoryStorageProfile, trustedOrigins: string[] = []) {
    process.env.DORY_RUNTIME = 'headless';
    process.env.NEXT_PUBLIC_DORY_RUNTIME = 'headless';
    process.env.DB_TYPE = profile.dbType;
    process.env.DS_SECRET_KEY = profile.dsSecretKey;
    process.env.BETTER_AUTH_SECRET = profile.betterAuthSecret;
    process.env.DORY_DESKTOP_USER_DATA_PATH = profile.userDataDir;

    if (profile.dbType === 'postgres') {
        process.env.DATABASE_URL = profile.databaseUrl;
        delete process.env.PGLITE_DB_PATH;
    } else {
        if (!profile.pglitePath) throw new Error('Missing PGlite path.');
        mkdirSync(path.dirname(profile.pglitePath), { recursive: true });
        process.env.PGLITE_DB_PATH = profile.pglitePath;
        delete process.env.DATABASE_URL;
    }

    if (trustedOrigins.length) {
        process.env.TRUSTED_ORIGINS = trustedOrigins.join(',');
    }
}

async function findExistingIdentity(): Promise<DoryRuntimeIdentity | null> {
    const client = await getClient();
    const [member] = await client
        .select({
            userId: organizationMembers.userId,
            organizationId: organizationMembers.organizationId,
        })
        .from(organizationMembers)
        .where(or(eq(organizationMembers.status, 'active'), isNull(organizationMembers.status)))
        .limit(1);

    if (member?.userId && member.organizationId) {
        return {
            userId: member.userId,
            organizationId: member.organizationId,
        };
    }

    const [org] = await client
        .select({
            userId: organizations.ownerUserId,
            organizationId: organizations.id,
        })
        .from(organizations)
        .limit(1);

    if (org?.userId && org.organizationId) {
        return {
            userId: org.userId,
            organizationId: org.organizationId,
        };
    }

    return null;
}

async function ensureHeadlessIdentity(profile: DoryStorageProfile): Promise<DoryRuntimeIdentity> {
    if (profile.profile === 'desktop') {
        const snapshot = readDesktopAuthSnapshotAccess({ userDataDir: profile.userDataDir });
        if (snapshot) {
            return {
                userId: snapshot.userId,
                organizationId: snapshot.organizationId,
            };
        }
    }

    const existing = await findExistingIdentity();
    if (existing) return existing;

    if (profile.profile === 'desktop') {
        throw new Error(`No desktop auth snapshot or local organization found in ${profile.userDataDir}. Open Dory Desktop once or pass --user-data-dir to the active desktop profile.`);
    }

    const client = await getClient();
    const userId = newEntityId();
    const organizationId = newEntityId();
    const now = new Date();

    await client.transaction(async tx => {
        await tx.insert(user).values({
            id: userId,
            name: 'Dory Headless',
            email: `headless-${userId}@local.dory`,
            isAnonymous: true,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
        });
        await tx.insert(organizations).values({
            id: organizationId,
            name: 'Headless Dory',
            ownerUserId: userId,
            slug: `headless-${organizationId.slice(0, 8)}`,
            provisioningKind: 'system_default',
            metadata: JSON.stringify({ mcp: { enabled: true } }),
            createdAt: now,
            updatedAt: now,
        });
        await tx.insert(organizationMembers).values({
            userId,
            organizationId,
            role: 'owner',
            status: 'active',
            createdAt: now,
            joinedAt: now,
        });
    });

    return { userId, organizationId };
}

export async function bootstrapDoryRuntime(options: BootstrapDoryRuntimeOptions = {}): Promise<BootstrappedDoryRuntime> {
    const profile = resolveDoryStorageProfile(options);
    applyRuntimeEnv(profile, options.trustedOrigins);
    registerDatabaseDrivers();

    if (!options.skipMigrate) {
        if (profile.dbType === 'pglite') {
            await migratePgliteDB();
        } else {
            await migrateDB();
        }
    }

    const db = await getDBService();
    const identity = await ensureHeadlessIdentity(profile);
    return { profile, db, identity };
}

export function createHeadlessActionContext(input: {
    db: DBService;
    auth: DoryMcpAuthContext;
    requestOrigin?: string | null;
}): ActionContext<WebActionServices> {
    return {
        organizationId: input.auth.organizationId,
        userId: input.auth.userId,
        access: input.auth.access,
        actor: {
            type: 'mcp',
            scopes: input.auth.scopes,
            id: input.auth.tokenId,
        },
        runtime: 'headless',
        locale: null,
        currentConnectionId: null,
        requestId: randomUUID(),
        audit: createWebActionAuditSink(input.db),
        services: {
            db: input.db,
            requestOrigin: input.requestOrigin ?? input.auth.requestOrigin ?? null,
        },
    };
}

export async function createHeadlessUserActionContext(input: {
    db: DBService;
    userId: string;
    organizationId: string;
    actorType?: Extract<ActionActorType, 'user' | 'automation'>;
    requestOrigin?: string | null;
}): Promise<ActionContext<WebActionServices>> {
    const access = await resolveDoryOrganizationAccess(input.db, input.organizationId, input.userId);
    return {
        organizationId: input.organizationId,
        userId: input.userId,
        access,
        actor: {
            type: input.actorType ?? 'user',
            scopes: [
                'connections:read',
                'connections:write',
                'schema:read',
                'query:read',
                'query:write',
                'tabs:read',
                'tabs:write',
                'saved_queries:read',
                'saved_queries:write',
                'analysis:run',
                'monitoring:read',
                'action:destructive',
            ],
            id: input.userId,
        },
        runtime: 'headless',
        locale: null,
        currentConnectionId: null,
        requestId: randomUUID(),
        audit: createWebActionAuditSink(input.db),
        services: {
            db: input.db,
            requestOrigin: input.requestOrigin ?? null,
        },
    };
}

export function createMcpActionContextFromAuth(input: {
    db: DBService;
    auth: DoryMcpAuthContext;
    requestOrigin?: string | null;
}): ActionContext<WebActionServices> {
    return createHeadlessActionContext(input);
}

export type DoryActionMetadata = {
    id: ActionId;
    version: number;
    domain: string;
    kind: string;
    risk: string;
    effects: string[];
    actors: string[];
    defaultProjection: Record<string, string>;
    projections: string[];
    scopes: string[];
    organizationPermissions: Array<{ resource: string; action: string }>;
    mcp: {
        name: string;
        title: string;
        description: string;
        exposed?: boolean;
    } | null;
};

function toDoryActionMetadata(action: ActionDefinition<any, any, WebActionServices>): DoryActionMetadata {
    return {
        id: action.id,
        version: action.version,
        domain: action.domain,
        kind: action.kind,
        risk: action.risk,
        effects: action.effects ?? [],
        actors: action.exposure.actors,
        defaultProjection: action.exposure.defaultProjection ?? {},
        projections: Object.keys(action.exposure.projections ?? {}),
        scopes: action.permission.scopes ?? [],
        organizationPermissions: action.permission.organization ?? [],
        mcp: action.exposure.mcp ?? null,
    };
}

export function listDoryActions(): DoryActionMetadata[] {
    return webActionRegistry.list().map(toDoryActionMetadata).sort((a, b) => a.id.localeCompare(b.id));
}

export function getDoryAction(actionId: string): DoryActionMetadata | null {
    const action = webActionRegistry.get(actionId as ActionId);
    return action ? toDoryActionMetadata(action) : null;
}

export function executeDoryAction<TOutput = unknown>(
    ctx: ActionContext<WebActionServices>,
    actionId: ActionId,
    input: unknown,
    options?: ExecuteActionOptions,
) {
    return executeRegisteredAction<TOutput, WebActionServices>(webActionRegistry, ctx, actionId, input, options);
}

export async function shutdownDoryRuntime() {
    if (process.env.DB_TYPE === 'pglite') {
        await resetPgliteClient();
    }
}
