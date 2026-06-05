import fs from 'node:fs';
import path from 'node:path';

import { normalizeRuntime } from '@dory/shared/runtime';
import type { OrganizationAccess } from '@/lib/server/authz/types';

export const DESKTOP_AUTH_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DESKTOP_AUTH_SNAPSHOT_FILE_NAME = 'desktop-auth-snapshot.json';
const DESKTOP_AUTH_SNAPSHOT_VERSION = 1;

type RuntimeEnv = Partial<Record<keyof NodeJS.ProcessEnv, string | undefined>>;

export type DesktopAuthSnapshotUser = {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    isAnonymous?: boolean;
};

export type DesktopAuthSnapshotOrganization = {
    id: string;
    slug: string;
    name: string;
};

export type DesktopAuthSnapshot = {
    version: 1;
    user: DesktopAuthSnapshotUser;
    activeOrganizationId: string | null;
    organization: DesktopAuthSnapshotOrganization | null;
    access: OrganizationAccess | null;
    accessUpdatedAt: string | null;
    accessExpiresAt: string | null;
    updatedAt: string;
    expiresAt: string;
};

export type DesktopAuthSnapshotInput = {
    user: DesktopAuthSnapshotUser;
    activeOrganizationId: string | null;
    organization: DesktopAuthSnapshotOrganization | null;
    access?: OrganizationAccess | null;
};

export type DesktopAuthSnapshotSession = {
    user: DesktopAuthSnapshotUser;
    session: {
        id: string;
        userId: string;
        activeOrganizationId: string | null;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date;
    };
};

export type DesktopAuthSnapshotBootstrapState = {
    session: DesktopAuthSnapshotSession;
    activeOrganizationId: string | null;
    organization: DesktopAuthSnapshotOrganization | null;
};

function isDesktopRuntimeEnv(env: RuntimeEnv) {
    return normalizeRuntime(env.DORY_RUNTIME ?? env.NEXT_PUBLIC_DORY_RUNTIME) === 'desktop';
}

function readEnvValue(env: RuntimeEnv, name: keyof NodeJS.ProcessEnv): string | null {
    const value = env[name];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

export function getDesktopAuthSnapshotPath(env: RuntimeEnv = process.env): string | null {
    if (!isDesktopRuntimeEnv(env)) return null;

    const userDataPath = readEnvValue(env, 'DORY_DESKTOP_USER_DATA_PATH');
    if (!userDataPath) return null;

    return path.join(userDataPath, DESKTOP_AUTH_SNAPSHOT_FILE_NAME);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}

function asNullableString(value: unknown): string | null {
    return value === null || value === undefined ? null : asString(value);
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function parseDateMs(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

function parseUser(value: unknown): DesktopAuthSnapshotUser | null {
    const record = asRecord(value);
    if (!record) return null;

    const id = asString(record.id);
    const emailVerified = asBoolean(record.emailVerified);
    if (!id || emailVerified === null) return null;

    const user: DesktopAuthSnapshotUser = {
        id,
        email: asNullableString(record.email),
        name: asNullableString(record.name),
        image: asNullableString(record.image),
        emailVerified,
    };

    const isAnonymous = asBoolean(record.isAnonymous);
    if (isAnonymous !== null) {
        user.isAnonymous = isAnonymous;
    }

    return user;
}

function parseOrganization(value: unknown): DesktopAuthSnapshotOrganization | null {
    if (value === null || value === undefined) return null;

    const record = asRecord(value);
    if (!record) return null;

    const id = asString(record.id);
    const slug = asString(record.slug);
    const name = asString(record.name);
    if (!id || !slug || !name) return null;

    return {
        id,
        slug,
        name,
    };
}

function parseAccess(value: unknown, now: number, accessExpiresAt: unknown): OrganizationAccess | null {
    if (value === null || value === undefined) return null;

    const expiresAtMs = parseDateMs(accessExpiresAt);
    if (expiresAtMs === null || expiresAtMs <= now) return null;

    const record = asRecord(value);
    if (!record) return null;

    const organizationId = asString(record.organizationId);
    const userId = asString(record.userId);
    const permissions = asRecord(record.permissions);
    if (!organizationId || !userId || !permissions || typeof record.isMember !== 'boolean') {
        return null;
    }

    return {
        source: record.source === 'desktop_cloud' || record.source === 'local' ? record.source : 'desktop_cloud',
        organizationId,
        userId,
        isMember: record.isMember,
        role: record.role === 'owner' || record.role === 'admin' || record.role === 'member' || record.role === 'viewer' ? record.role : null,
        permissions: permissions as OrganizationAccess['permissions'],
        organization: parseOrganization(record.organization),
    };
}

function parseSnapshot(value: unknown, now: number): DesktopAuthSnapshot | null {
    const record = asRecord(value);
    if (!record || record.version !== DESKTOP_AUTH_SNAPSHOT_VERSION) return null;

    const user = parseUser(record.user);
    const activeOrganizationId = asNullableString(record.activeOrganizationId);
    const organization = parseOrganization(record.organization);
    const accessUpdatedAtMs = parseDateMs(record.accessUpdatedAt);
    const accessExpiresAtMs = parseDateMs(record.accessExpiresAt);
    const access = parseAccess(record.access, now, record.accessExpiresAt);
    const updatedAtMs = parseDateMs(record.updatedAt);
    const expiresAtMs = parseDateMs(record.expiresAt);

    if (!user || updatedAtMs === null || expiresAtMs === null || expiresAtMs <= now) {
        return null;
    }

    return {
        version: DESKTOP_AUTH_SNAPSHOT_VERSION,
        user,
        activeOrganizationId,
        organization,
        access,
        accessUpdatedAt: accessUpdatedAtMs === null ? null : new Date(accessUpdatedAtMs).toISOString(),
        accessExpiresAt: accessExpiresAtMs === null ? null : new Date(accessExpiresAtMs).toISOString(),
        updatedAt: new Date(updatedAtMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
    };
}

export function readDesktopAuthSnapshot(options: { env?: RuntimeEnv; now?: number } = {}): DesktopAuthSnapshot | null {
    const snapshotPath = getDesktopAuthSnapshotPath(options.env);
    if (!snapshotPath) return null;

    try {
        const raw = fs.readFileSync(snapshotPath, 'utf8');
        return parseSnapshot(JSON.parse(raw), options.now ?? Date.now());
    } catch {
        return null;
    }
}

export function writeDesktopAuthSnapshot(
    input: DesktopAuthSnapshotInput,
    options: { env?: RuntimeEnv; now?: number; ttlMs?: number } = {},
): DesktopAuthSnapshot | null {
    const snapshotPath = getDesktopAuthSnapshotPath(options.env);
    if (!snapshotPath || !input.user.id) return null;

    const now = options.now ?? Date.now();
    const snapshot: DesktopAuthSnapshot = {
        version: DESKTOP_AUTH_SNAPSHOT_VERSION,
        user: input.user,
        activeOrganizationId: input.activeOrganizationId,
        organization: input.organization,
        access: input.access ?? null,
        accessUpdatedAt: input.access ? new Date(now).toISOString() : null,
        accessExpiresAt: input.access ? new Date(now + (options.ttlMs ?? DESKTOP_AUTH_SNAPSHOT_TTL_MS)).toISOString() : null,
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + (options.ttlMs ?? DESKTOP_AUTH_SNAPSHOT_TTL_MS)).toISOString(),
    };

    const dir = path.dirname(snapshotPath);
    const tmpPath = path.join(dir, `.${DESKTOP_AUTH_SNAPSHOT_FILE_NAME}.${process.pid}.${Date.now()}.tmp`);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmpPath, snapshotPath);
    fs.chmodSync(snapshotPath, 0o600);

    return snapshot;
}

export function clearDesktopAuthSnapshot(options: { env?: RuntimeEnv } = {}) {
    const snapshotPath = getDesktopAuthSnapshotPath(options.env);
    if (!snapshotPath) return;

    try {
        fs.rmSync(snapshotPath, { force: true });
    } catch {
        // Snapshot cleanup should not block sign-out or auth refresh.
    }
}

export function buildDesktopAuthSnapshotSession(snapshot: DesktopAuthSnapshot): DesktopAuthSnapshotSession {
    const updatedAt = new Date(snapshot.updatedAt);
    return {
        user: snapshot.user,
        session: {
            id: `desktop-auth-snapshot:${snapshot.user.id}`,
            userId: snapshot.user.id,
            activeOrganizationId: snapshot.activeOrganizationId,
            createdAt: updatedAt,
            updatedAt,
            expiresAt: new Date(snapshot.expiresAt),
        },
    };
}

export function buildDesktopAuthSnapshotBootstrapState(
    snapshot: DesktopAuthSnapshot,
    options: { organizationSlugOrId?: string | null } = {},
): DesktopAuthSnapshotBootstrapState {
    const requestedOrganization = options.organizationSlugOrId ?? null;
    const snapshotOrganizationMatches =
        !requestedOrganization ||
        requestedOrganization === snapshot.activeOrganizationId ||
        requestedOrganization === snapshot.organization?.id ||
        requestedOrganization === snapshot.organization?.slug;

    return {
        session: buildDesktopAuthSnapshotSession(snapshot),
        activeOrganizationId: snapshot.activeOrganizationId,
        organization: snapshotOrganizationMatches ? snapshot.organization : null,
    };
}
