import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrganizationPermissionMap } from '../../lib/auth/organization-ac';
import { finalizeDesktopOrganizationAccessResult } from '../../lib/server/authz/authz.desktop.shared';
import type { OrganizationAccess } from '../../lib/server/authz/types';
import { getDesktopCloudStateFromFlags } from '../../lib/runtime/cloud-capabilities';

function buildAccess(source: OrganizationAccess['source']): OrganizationAccess {
    return {
        source,
        organizationId: 'org_1',
        userId: 'user_1',
        isMember: true,
        role: 'owner',
        permissions: getOrganizationPermissionMap('owner'),
        organization: {
            id: 'org_1',
            slug: 'workspace',
            name: 'Workspace',
        },
    };
}

test('desktop authz grants access from cloud when cloud membership is confirmed', () => {
    const result = finalizeDesktopOrganizationAccessResult({
        organizationId: 'org_1',
        userId: 'user_1',
        sessionUserId: 'user_1',
        activeOrganizationId: 'org_1',
        cloudAttempt: {
            status: 'granted',
            access: buildAccess('desktop_cloud'),
        },
        localAccess: null,
    });

    assert.equal(result.status, 'granted_from_cloud');
    assert.equal(result.isOffline, false);
    assert.equal(result.access?.source, 'desktop_cloud');
});

test('desktop authz falls back to local access when cloud is unreachable', () => {
    const result = finalizeDesktopOrganizationAccessResult({
        organizationId: 'org_1',
        userId: 'user_1',
        sessionUserId: 'user_1',
        activeOrganizationId: 'org_1',
        cloudAttempt: {
            status: 'unreachable',
        },
        localAccess: buildAccess('local'),
    });

    assert.equal(result.status, 'granted_from_local_fallback');
    assert.equal(result.isOffline, true);
    assert.equal(result.access?.source, 'desktop_local_fallback');
});

test('desktop authz remains unauthenticated when no local session is present', () => {
    const result = finalizeDesktopOrganizationAccessResult({
        organizationId: 'org_1',
        userId: 'user_1',
        sessionUserId: null,
        activeOrganizationId: null,
        cloudAttempt: {
            status: 'unreachable',
        },
        localAccess: buildAccess('local'),
    });

    assert.equal(result.status, 'unauthenticated');
    assert.equal(result.access, null);
});

test('desktop authz denies access when cloud explicitly rejects membership', () => {
    const result = finalizeDesktopOrganizationAccessResult({
        organizationId: 'org_1',
        userId: 'user_1',
        sessionUserId: 'user_1',
        activeOrganizationId: 'org_1',
        cloudAttempt: {
            status: 'denied',
        },
        localAccess: buildAccess('local'),
    });

    assert.equal(result.status, 'denied');
    assert.equal(result.isOffline, false);
    assert.equal(result.access, null);
});

test('cloud capability state disables cloud features only for offline desktop', () => {
    assert.deepEqual(
        getDesktopCloudStateFromFlags({
            runtime: 'desktop',
            hasCloudBaseUrl: true,
            isOffline: true,
        }),
        {
            isOffline: true,
            canUseCloudFeatures: false,
        },
    );

    assert.deepEqual(
        getDesktopCloudStateFromFlags({
            runtime: 'desktop',
            hasCloudBaseUrl: false,
            isOffline: false,
        }),
        {
            isOffline: false,
            canUseCloudFeatures: false,
        },
    );

    assert.deepEqual(
        getDesktopCloudStateFromFlags({
            runtime: 'web',
            hasCloudBaseUrl: true,
            isOffline: true,
        }),
        {
            isOffline: false,
            canUseCloudFeatures: true,
        },
    );
});
