import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    buildDesktopAuthSnapshotBootstrapState,
    buildDesktopAuthSnapshotSession,
    clearDesktopAuthSnapshot,
    getDesktopAuthSnapshotPath,
    readDesktopAuthSnapshot,
    writeDesktopAuthSnapshot,
    type DesktopAuthSnapshotInput,
} from '../../lib/auth/desktop-auth-snapshot';
import type { OrganizationAccess } from '../../lib/server/authz/types';

function createTempUserDataPath() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'dory-desktop-auth-snapshot-'));
}

function desktopEnv(userDataPath: string) {
    return {
        DORY_RUNTIME: 'desktop',
        DORY_DESKTOP_USER_DATA_PATH: userDataPath,
    };
}

function organizationAccess(overrides: Partial<OrganizationAccess> = {}): OrganizationAccess {
    return {
        source: 'desktop_cloud',
        organizationId: 'org_1',
        userId: 'user_1',
        isMember: true,
        role: 'owner',
        permissions: {
            organization: { read: true, update: true, delete: true },
            member: { read: true, create: true, update: true, delete: true },
            invitation: { read: true, create: true, cancel: true },
            workspace: { read: true, write: true },
            connection: { read: true, create: true, update: true, delete: true },
        },
        organization: {
            id: 'org_1',
            slug: 'team',
            name: 'Team',
        },
        ...overrides,
    };
}

function snapshotInput(overrides: Partial<DesktopAuthSnapshotInput> = {}): DesktopAuthSnapshotInput {
    return {
        user: {
            id: 'user_1',
            email: 'user@example.com',
            name: 'User',
            image: null,
            emailVerified: true,
        },
        activeOrganizationId: 'org_1',
        organization: {
            id: 'org_1',
            slug: 'team',
            name: 'Team',
        },
        access: organizationAccess(),
        ...overrides,
    };
}

test('desktop auth snapshot returns null when missing', () => {
    const userDataPath = createTempUserDataPath();

    assert.equal(readDesktopAuthSnapshot({ env: desktopEnv(userDataPath), now: 1_000 }), null);
});

test('desktop auth snapshot ignores non-desktop runtime', () => {
    const userDataPath = createTempUserDataPath();
    const env = {
        DORY_RUNTIME: 'web',
        DORY_DESKTOP_USER_DATA_PATH: userDataPath,
    };

    assert.equal(getDesktopAuthSnapshotPath(env), null);
    assert.equal(writeDesktopAuthSnapshot(snapshotInput(), { env, now: 1_000 }), null);
    assert.equal(readDesktopAuthSnapshot({ env, now: 1_000 }), null);
});

test('desktop auth snapshot ignores corrupt json', () => {
    const userDataPath = createTempUserDataPath();
    const env = desktopEnv(userDataPath);
    const snapshotPath = getDesktopAuthSnapshotPath(env);

    assert.ok(snapshotPath);
    fs.writeFileSync(snapshotPath, '{bad json');

    assert.equal(readDesktopAuthSnapshot({ env, now: 1_000 }), null);
});

test('desktop auth snapshot ignores expired snapshot', () => {
    const userDataPath = createTempUserDataPath();
    const env = desktopEnv(userDataPath);

    writeDesktopAuthSnapshot(snapshotInput(), { env, now: 1_000, ttlMs: 500 });

    assert.equal(readDesktopAuthSnapshot({ env, now: 1_501 }), null);
});

test('desktop auth snapshot writes, reads, and builds bootstrap session', () => {
    const userDataPath = createTempUserDataPath();
    const env = desktopEnv(userDataPath);

    const written = writeDesktopAuthSnapshot(snapshotInput(), { env, now: 1_000, ttlMs: 10_000 });
    const read = readDesktopAuthSnapshot({ env, now: 2_000 });

    assert.deepEqual(read, written);
    assert.equal(read?.user.id, 'user_1');
    assert.equal(read?.organization?.slug, 'team');
    assert.equal(read?.access?.userId, 'user_1');
    assert.equal(read?.access?.permissions.connection.read, true);
    assert.equal(read?.accessUpdatedAt, '1970-01-01T00:00:01.000Z');
    assert.equal(read?.accessExpiresAt, '1970-01-01T00:00:11.000Z');

    const session = buildDesktopAuthSnapshotSession(read!);
    assert.equal(session.user.id, 'user_1');
    assert.equal(session.session.userId, 'user_1');
    assert.equal(session.session.activeOrganizationId, 'org_1');
    assert.equal(session.session.expiresAt.toISOString(), read?.expiresAt);
});

test('desktop auth snapshot keeps legacy snapshots without access usable for bootstrap', () => {
    const userDataPath = createTempUserDataPath();
    const env = desktopEnv(userDataPath);
    const snapshot = writeDesktopAuthSnapshot(snapshotInput({ access: null }), { env, now: 1_000, ttlMs: 10_000 });
    const read = readDesktopAuthSnapshot({ env, now: 2_000 });

    assert.deepEqual(read, snapshot);
    assert.equal(read?.access, null);

    const state = buildDesktopAuthSnapshotBootstrapState(read!);
    assert.equal(state.session.user.id, 'user_1');
    assert.equal(state.organization?.id, 'org_1');
});

test('desktop auth snapshot bootstrap state reuses matching organization', () => {
    const userDataPath = createTempUserDataPath();
    const env = desktopEnv(userDataPath);
    const snapshot = writeDesktopAuthSnapshot(snapshotInput(), { env, now: 1_000, ttlMs: 10_000 });

    assert.ok(snapshot);

    const stateBySlug = buildDesktopAuthSnapshotBootstrapState(snapshot, { organizationSlugOrId: 'team' });
    assert.equal(stateBySlug.session.user.id, 'user_1');
    assert.equal(stateBySlug.organization?.id, 'org_1');

    const stateByOtherSlug = buildDesktopAuthSnapshotBootstrapState(snapshot, { organizationSlugOrId: 'other-team' });
    assert.equal(stateByOtherSlug.session.user.id, 'user_1');
    assert.equal(stateByOtherSlug.activeOrganizationId, 'org_1');
    assert.equal(stateByOtherSlug.organization, null);
});

test('desktop auth snapshot clear removes persisted state', () => {
    const userDataPath = createTempUserDataPath();
    const env = desktopEnv(userDataPath);

    writeDesktopAuthSnapshot(snapshotInput(), { env, now: 1_000 });
    clearDesktopAuthSnapshot({ env });

    assert.equal(readDesktopAuthSnapshot({ env, now: 2_000 }), null);
});
