import assert from 'node:assert/strict';
import test from 'node:test';
import { canManageOrganizationBilling } from '../../lib/billing/authz';

test('organization billing management is owner only', () => {
    assert.equal(canManageOrganizationBilling('owner'), true);
    assert.equal(canManageOrganizationBilling('admin'), false);
    assert.equal(canManageOrganizationBilling('member'), false);
    assert.equal(canManageOrganizationBilling('viewer'), false);
    assert.equal(canManageOrganizationBilling(null), false);
});
