import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrganizationBillingStatus } from '../../lib/billing/normalize';
import type { BillingSubscriptionRecord } from '../../lib/billing/types';

function createSubscriptionRecord(overrides: Partial<BillingSubscriptionRecord>): BillingSubscriptionRecord {
    return {
        id: 'sub_internal_1',
        plan: 'pro',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        status: 'incomplete',
        periodEnd: '2026-03-22T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
        endedAt: null,
        createdAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-22T00:00:00.000Z',
        ...overrides,
    };
}

test('normalizes no subscriptions to hobby', () => {
    assert.deepEqual(normalizeOrganizationBillingStatus([], true), {
        plan: 'hobby',
        subscriptionStatus: null,
        subscriptionId: null,
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
        endedAt: null,
        periodEnd: null,
        isManageable: false,
    });
});

test('normalizes active pro subscription to pro plan', () => {
    const status = normalizeOrganizationBillingStatus([createSubscriptionRecord({ status: 'active' })], true);

    assert.equal(status.plan, 'pro');
    assert.equal(status.subscriptionStatus, 'active');
    assert.equal(status.subscriptionId, 'sub_internal_1');
    assert.equal(status.stripeSubscriptionId, 'sub_123');
    assert.equal(status.isManageable, true);
});

test('normalizes trialing pro subscription to pro plan', () => {
    const status = normalizeOrganizationBillingStatus([createSubscriptionRecord({ status: 'trialing' })], true);

    assert.equal(status.plan, 'pro');
    assert.equal(status.subscriptionStatus, 'trialing');
});

test('keeps canceled subscriptions on hobby while exposing status', () => {
    const status = normalizeOrganizationBillingStatus(
        [
            createSubscriptionRecord({
                status: 'canceled',
                canceledAt: '2026-03-22T01:00:00.000Z',
                endedAt: '2026-03-22T02:00:00.000Z',
            }),
        ],
        true,
    );

    assert.equal(status.plan, 'hobby');
    assert.equal(status.subscriptionStatus, 'canceled');
    assert.equal(status.canceledAt, '2026-03-22T01:00:00.000Z');
    assert.equal(status.endedAt, '2026-03-22T02:00:00.000Z');
});

test('keeps incomplete subscriptions on hobby while exposing status', () => {
    const status = normalizeOrganizationBillingStatus([createSubscriptionRecord({ status: 'incomplete' })], true);

    assert.equal(status.plan, 'hobby');
    assert.equal(status.subscriptionStatus, 'incomplete');
});

test('prefers active subscription over newer canceled subscription', () => {
    const status = normalizeOrganizationBillingStatus(
        [
            createSubscriptionRecord({
                id: 'sub_active',
                status: 'active',
                updatedAt: '2026-03-21T00:00:00.000Z',
            }),
            createSubscriptionRecord({
                id: 'sub_canceled',
                status: 'canceled',
                updatedAt: '2026-03-22T00:00:00.000Z',
            }),
        ],
        true,
    );

    assert.equal(status.plan, 'pro');
    assert.equal(status.subscriptionId, 'sub_active');
});
