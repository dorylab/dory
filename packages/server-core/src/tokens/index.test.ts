import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readDesktopAuthSnapshotAccess } from './index';

test('desktop auth snapshot access does not expire with time', () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dory-server-core-auth-snapshot-'));
    const snapshotPath = path.join(userDataDir, 'desktop-auth-snapshot.json');

    fs.writeFileSync(
        snapshotPath,
        JSON.stringify({
            version: 1,
            user: {
                id: 'user_1',
            },
            activeOrganizationId: 'org_1',
            access: {
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
            },
            accessExpiresAt: '2020-01-01T00:00:00.000Z',
            expiresAt: '2020-01-01T00:00:00.000Z',
        }),
    );

    const snapshot = readDesktopAuthSnapshotAccess({
        userDataDir,
        now: Date.parse('2030-01-01T00:00:00.000Z'),
    });

    assert.equal(snapshot?.userId, 'user_1');
    assert.equal(snapshot?.organizationId, 'org_1');
    assert.equal(snapshot?.access.role, 'owner');
});
