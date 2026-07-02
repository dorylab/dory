import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMcpRecoveryOrganizationSlugOrId } from '../../lib/client/mcp-recovery';

test('desktop MCP recovery prefers concrete organization ids over route slugs', () => {
    assert.equal(
        resolveMcpRecoveryOrganizationSlugOrId({
            initialOrganizationId: 'org-id',
            initialActiveOrganizationId: 'active-org-id',
            routeOrganizationSlugOrId: 'workspace-slug',
        }),
        'org-id',
    );
    assert.equal(
        resolveMcpRecoveryOrganizationSlugOrId({
            initialActiveOrganizationId: 'active-org-id',
            routeOrganizationSlugOrId: 'workspace-slug',
        }),
        'active-org-id',
    );
    assert.equal(
        resolveMcpRecoveryOrganizationSlugOrId({
            routeOrganizationSlugOrId: 'workspace-slug',
        }),
        'workspace-slug',
    );
});
