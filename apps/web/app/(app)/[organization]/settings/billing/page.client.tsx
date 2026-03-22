'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { getOrganizationBillingStatus, openOrganizationBillingPortal, upgradeOrganizationToPro } from '@/lib/billing/api';
import { getOrganizationAccess, getFullOrganization } from '@/lib/organization/api';

function formatDate(value: string | null) {
    if (!value) {
        return 'N/A';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function getStatusDescription(status: string | null) {
    if (!status) {
        return 'No paid subscription is active for this organization.';
    }

    if (status === 'canceled') {
        return 'The paid subscription has been canceled. The organization remains on Hobby.';
    }

    if (status === 'incomplete' || status === 'incomplete_expired' || status === 'past_due' || status === 'unpaid') {
        return 'The last paid subscription is not active. The organization remains on Hobby until Stripe reports an active or trialing Pro subscription.';
    }

    return `Stripe reports the latest subscription status as ${status}.`;
}

export default function BillingSettingsPageClient() {
    const params = useParams<{ organization: string }>();
    const organizationSlug = params.organization;

    const organizationQuery = useQuery({
        queryKey: ['organization-full', organizationSlug],
        queryFn: () => getFullOrganization({ organizationSlug }),
    });
    const accessQuery = useQuery({
        queryKey: ['organization-access', organizationSlug, organizationQuery.data?.id],
        queryFn: () => getOrganizationAccess(organizationQuery.data!.id),
        enabled: Boolean(organizationQuery.data?.id),
    });
    const billingStatusQuery = useQuery({
        queryKey: ['organization-billing', organizationSlug, organizationQuery.data?.id],
        queryFn: () => getOrganizationBillingStatus(organizationQuery.data!.id),
        enabled: Boolean(organizationQuery.data?.id),
    });

    const upgradeMutation = useMutation({
        mutationFn: async () => {
            if (!organizationQuery.data?.id) {
                throw new Error('Organization not found');
            }

            await upgradeOrganizationToPro(organizationQuery.data.id, organizationSlug);
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : 'Failed to start checkout');
        },
    });

    const portalMutation = useMutation({
        mutationFn: async () => {
            if (!organizationQuery.data?.id || !billingStatusQuery.data?.subscriptionId) {
                throw new Error('No manageable subscription found');
            }

            await openOrganizationBillingPortal(organizationQuery.data.id, organizationSlug, billingStatusQuery.data.subscriptionId);
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : 'Failed to open billing portal');
        },
    });

    const canManageBilling = accessQuery.data?.role === 'owner';
    const billingStatus = billingStatusQuery.data;
    const organization = organizationQuery.data;
    const isLoading = organizationQuery.isLoading || accessQuery.isLoading || billingStatusQuery.isLoading;
    const currentPlanLabel = billingStatus?.plan === 'pro' ? 'Pro' : 'Hobby';

    const detailRows = useMemo(
        () => [
            { label: 'Plan', value: currentPlanLabel },
            { label: 'Subscription status', value: billingStatus?.subscriptionStatus ?? 'No subscription' },
            { label: 'Stripe subscription ID', value: billingStatus?.stripeSubscriptionId ?? 'N/A' },
            { label: 'Current period end', value: formatDate(billingStatus?.periodEnd ?? null) },
        ],
        [billingStatus, currentPlanLabel],
    );

    if (organizationQuery.isError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Billing</CardTitle>
                    <CardDescription>Unable to load organization billing.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        {organizationQuery.error instanceof Error ? organizationQuery.error.message : 'Failed to load organization details.'}
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (!isLoading && !organization) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Billing</CardTitle>
                    <CardDescription>Unable to load organization billing.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">The current organization could not be resolved from this URL.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Billing</CardTitle>
                <CardDescription>Review the current organization plan, upgrade to Pro, or manage billing in Stripe.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="rounded-lg border bg-muted/30 px-4 py-4">
                    <div className="text-sm font-medium">Current plan</div>
                    <div className="mt-2 text-2xl font-semibold">{isLoading ? 'Loading...' : currentPlanLabel}</div>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {isLoading ? 'Loading billing status...' : getStatusDescription(billingStatus?.subscriptionStatus ?? null)}
                    </p>
                </div>

                <div className="grid gap-3">
                    {detailRows.map(row => (
                        <div key={row.label} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                            <span className="font-medium">{row.label}</span>
                            <span className="text-muted-foreground">{row.value}</span>
                        </div>
                    ))}
                </div>

                {billingStatus?.cancelAtPeriodEnd ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        Cancellation is scheduled for {formatDate(billingStatus.cancelAt || billingStatus.periodEnd)}.
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                    {billingStatus?.plan !== 'pro' && canManageBilling ? (
                        <Button onClick={() => upgradeMutation.mutate()} disabled={upgradeMutation.isPending || isLoading || !organization}>
                            {upgradeMutation.isPending ? 'Redirecting...' : 'Upgrade to Pro'}
                        </Button>
                    ) : null}

                    {billingStatus?.isManageable && canManageBilling ? (
                        <Button variant="outline" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending || isLoading || !organization}>
                            {portalMutation.isPending ? 'Opening...' : 'Manage billing'}
                        </Button>
                    ) : null}
                </div>

                {!canManageBilling ? (
                    <p className="text-sm text-muted-foreground">Only organization owners can upgrade, cancel, or manage billing. Your current role is read-only here.</p>
                ) : null}
            </CardContent>
        </Card>
    );
}
