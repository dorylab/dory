import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { assertActionAllowed, type ActionContext, type ActionId } from '@dory/actions';
import type { WebActionServices } from '../../lib/actions/server/types';
import type { DesktopAuthSnapshot } from '../../lib/auth/desktop-auth-snapshot';
import type { OrganizationAccess } from '../../lib/server/authz/types';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
} as NodeJS.Module;

const [{ resolveDesktopLocalActionSnapshot }, { webActionRegistry }] = await Promise.all([
    import('../../lib/actions/server/context.desktop-local'),
    import('../../lib/actions/server/registry'),
]);

function action(id: ActionId) {
    const item = webActionRegistry.get(id);
    assert.ok(item, `missing action ${id}`);
    return item;
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

function snapshot(access: OrganizationAccess | null = organizationAccess()): DesktopAuthSnapshot {
    return {
        version: 1,
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
        access,
        accessUpdatedAt: access ? '2026-06-05T00:00:00.000Z' : null,
        accessExpiresAt: access ? '2026-06-12T00:00:00.000Z' : null,
        updatedAt: '2026-06-05T00:00:00.000Z',
        expiresAt: '2026-06-12T00:00:00.000Z',
    };
}

test('desktop auth metadata marks local workspace actions', () => {
    assert.equal(action('connection.list').desktopAuth, 'local-workspace');
    assert.equal(action('connection.delete').desktopAuth, 'local-workspace');
    assert.equal(action('tab.list').desktopAuth, 'local-workspace');
    assert.equal(action('savedQuery.list').desktopAuth, 'local-workspace');
    assert.equal(action('schema.listTables').desktopAuth, 'local-workspace');
    assert.equal(action('schema.getGraph').desktopAuth, 'local-workspace');
    assert.equal(action('table.preview').desktopAuth, 'local-workspace');
    assert.equal(action('query.execute').desktopAuth, 'local-workspace');
    assert.equal(action('query.readOnlyExecute').desktopAuth, 'local-workspace');
    assert.equal(action('query.cancel').desktopAuth, 'local-workspace');
    assert.equal(action('chart.buildResultContext').desktopAuth, 'local-workspace');
    assert.equal(action('chart.buildChartProfile').desktopAuth, 'local-workspace');
    assert.equal(action('comparison.schema.create').desktopAuth, 'local-workspace');
    assert.equal(action('comparison.get').desktopAuth, 'local-workspace');
    assert.equal(action('comparison.aiReview').desktopAuth, 'local-workspace');
});

test('web action context does not import desktop snapshot auth', () => {
    const source = fs.readFileSync(path.resolve('lib/actions/server/context.ts'), 'utf8');
    assert.equal(source.includes('desktop-auth-snapshot'), false);
    assert.equal(source.includes('resolveDesktopLocalActionSnapshot'), false);
});

test('desktop auth metadata keeps cloud-backed actions cloud required', () => {
    assert.equal(action('ai.tableSummary').desktopAuth, 'cloud-required');
    assert.equal(action('ai.resultInsights').desktopAuth, 'cloud-required');
    assert.equal(action('chart.runAnalysis').desktopAuth, 'cloud-required');
    assert.equal(action('query.auditSearch').desktopAuth, 'cloud-required');
});

test('desktop local action snapshot resolves only matching local workspace actions', () => {
    const resolved = resolveDesktopLocalActionSnapshot({ actionId: 'connection.list' }, { snapshot: snapshot() });
    assert.equal(resolved?.userId, 'user_1');
    assert.equal(resolved?.organizationId, 'org_1');
    assert.equal(resolved?.access.organizationId, 'org_1');

    assert.equal(resolveDesktopLocalActionSnapshot({ actionId: 'ai.tableSummary' }, { snapshot: snapshot() }), null);
    assert.equal(resolveDesktopLocalActionSnapshot({ actionId: 'connection.list', organizationId: 'org_other' }, { snapshot: snapshot() }), null);
    assert.equal(resolveDesktopLocalActionSnapshot({ actionId: 'connection.list' }, { snapshot: snapshot(null) }), null);
});

test('desktop local action snapshot still uses action permission checks', async () => {
    const access = organizationAccess({
        permissions: {
            ...organizationAccess().permissions,
            connection: { read: false, create: false, update: false, delete: false },
        },
    });
    const resolved = resolveDesktopLocalActionSnapshot({ actionId: 'connection.list' }, { snapshot: snapshot(access) });
    assert.ok(resolved);

    const ctx = {
        organizationId: resolved.organizationId,
        userId: resolved.userId,
        access: resolved.access,
        actor: {
            type: 'user',
            scopes: ['connections:read'],
            id: resolved.userId,
        },
        services: {},
    } as unknown as ActionContext<WebActionServices>;

    await assert.rejects(() => assertActionAllowed(ctx, action('connection.list'), {}), /Missing permission connection:read/);
});
