export type OrganizationPlan = 'hobby' | 'pro';

export type BillingSubscriptionStatus =
    | 'active'
    | 'trialing'
    | 'incomplete'
    | 'incomplete_expired'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused'
    | string;

export type BillingSubscriptionRecord = {
    id: string;
    plan: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    status: BillingSubscriptionStatus;
    periodEnd: Date | string | null;
    cancelAtPeriodEnd: boolean | null;
    cancelAt: Date | string | null;
    canceledAt: Date | string | null;
    endedAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
};

export type OrganizationBillingStatus = {
    plan: OrganizationPlan;
    subscriptionStatus: BillingSubscriptionStatus | null;
    subscriptionId: string | null;
    stripeSubscriptionId: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
    canceledAt: string | null;
    endedAt: string | null;
    periodEnd: string | null;
    isManageable: boolean;
};
