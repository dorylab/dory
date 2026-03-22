import type { BillingSubscriptionRecord, OrganizationBillingStatus } from './types';

function isActiveOrTrialingSubscription(record: BillingSubscriptionRecord): boolean {
    return (record.status === 'active' || record.status === 'trialing') && record.plan === 'pro';
}

function toIsoString(value: Date | string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return value;
}

function getSortTimestamp(record: BillingSubscriptionRecord): number {
    const updatedAt = new Date(record.updatedAt).getTime();
    if (!Number.isNaN(updatedAt)) {
        return updatedAt;
    }

    return new Date(record.createdAt).getTime();
}

function selectRelevantSubscription(records: BillingSubscriptionRecord[]): BillingSubscriptionRecord | null {
    const activeOrTrialing = records.find(isActiveOrTrialingSubscription);
    if (activeOrTrialing) {
        return activeOrTrialing;
    }

    return [...records].sort((left, right) => getSortTimestamp(right) - getSortTimestamp(left))[0] ?? null;
}

export function normalizeOrganizationBillingStatus(records: BillingSubscriptionRecord[], canManageBilling: boolean): OrganizationBillingStatus {
    const selected = selectRelevantSubscription(records);
    const activeOrTrialing = selected ? isActiveOrTrialingSubscription(selected) : false;

    return {
        plan: activeOrTrialing ? 'pro' : 'hobby',
        subscriptionStatus: selected?.status ?? null,
        subscriptionId: selected?.id ?? null,
        stripeSubscriptionId: selected?.stripeSubscriptionId ?? null,
        cancelAtPeriodEnd: selected?.cancelAtPeriodEnd ?? false,
        cancelAt: toIsoString(selected?.cancelAt),
        canceledAt: toIsoString(selected?.canceledAt),
        endedAt: toIsoString(selected?.endedAt),
        periodEnd: toIsoString(selected?.periodEnd),
        isManageable: Boolean(canManageBilling && selected && (selected.stripeCustomerId || selected.stripeSubscriptionId || selected.id)),
    };
}
