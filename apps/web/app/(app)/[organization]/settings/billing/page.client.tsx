'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { getOrganizationBillingStatus, openOrganizationBillingPortal, upgradeOrganizationToPro } from '@/lib/billing/api';
import { getOrganizationAccess, getFullOrganization } from '@/lib/organization/api';

function formatDate(value: string | null, fallback: string) {
    if (!value) {
        return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

type BillingSettingsPageClientProps = {
    billingManagementAvailable: boolean;
    desktopBillingHandoff: boolean;
};

export default function BillingSettingsPageClient({ billingManagementAvailable, desktopBillingHandoff }: BillingSettingsPageClientProps) {
    const params = useParams<{ organization: string }>();
    const organizationSlug = params.organization;
    const t = useTranslations('OrganizationSettings.Billing');
    const formatWithFallback = (value: string | null) => formatDate(value, t('NotAvailable'));

    const organizationQuery = useQuery({
        queryKey: ['organization-full', organizationSlug],
        queryFn: () => getFullOrganization({ organizationSlug }),
        retry: false,
    });
    const accessQuery = useQuery({
        queryKey: ['organization-access', organizationSlug, organizationQuery.data?.id],
        queryFn: () => getOrganizationAccess(organizationQuery.data!.id),
        enabled: Boolean(organizationQuery.data?.id),
        retry: false,
    });
    const billingStatusQuery = useQuery({
        queryKey: ['organization-billing', organizationSlug, organizationQuery.data?.id],
        queryFn: () => getOrganizationBillingStatus(organizationQuery.data!.id),
        enabled: Boolean(organizationQuery.data?.id),
        retry: false,
        refetchOnWindowFocus: desktopBillingHandoff && billingManagementAvailable,
    });
    const refetchBillingStatus = billingStatusQuery.refetch;

    useEffect(() => {
        if (!desktopBillingHandoff || !billingManagementAvailable || !organizationQuery.data?.id) {
            return;
        }

        const handleFocus = () => {
            void refetchBillingStatus();
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [billingManagementAvailable, desktopBillingHandoff, organizationQuery.data?.id, refetchBillingStatus]);

    const upgradeMutation = useMutation({
        mutationFn: async () => {
            if (!billingManagementAvailable) {
                throw new Error(t('DesktopCloudUnavailable'));
            }

            if (!organizationQuery.data?.id) {
                throw new Error(t('Errors.OrganizationNotFound'));
            }

            await upgradeOrganizationToPro(organizationQuery.data.id, organizationSlug);
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Errors.CheckoutFailed'));
        },
    });

    const portalMutation = useMutation({
        mutationFn: async () => {
            if (!billingManagementAvailable) {
                throw new Error(t('DesktopCloudUnavailable'));
            }

            if (!organizationQuery.data?.id || !billingStatusQuery.data?.subscriptionId) {
                throw new Error(t('Errors.NoManageableSubscription'));
            }

            await openOrganizationBillingPortal(organizationQuery.data.id, organizationSlug, billingStatusQuery.data.subscriptionId);
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Errors.PortalFailed'));
        },
    });

    async function refreshBillingStatus() {
        await refetchBillingStatus();
        toast.success(t('RefreshComplete'));
    }

    const canManageBilling = billingManagementAvailable && accessQuery.data?.role === 'owner';
    const billingStatus = billingStatusQuery.data;
    const organization = organizationQuery.data;
    const isOrganizationLoading = organizationQuery.isLoading;
    const isBillingLoading = organizationQuery.isSuccess && billingStatusQuery.isLoading;
    const isLoading = isOrganizationLoading || isBillingLoading;
    const isProPlan = billingStatus?.plan === 'pro';
    const showProPlan = !isLoading && !billingStatusQuery.isError && billingStatus?.plan !== 'pro';
    const currentPeriodEnd = isProPlan ? formatWithFallback(billingStatus?.periodEnd ?? null) : null;
    const currentPlanTitle = billingStatus?.plan === 'pro' ? t('Plan.Pro') : t('Hobby.Title');
    const currentPlanPrice = billingStatus?.plan === 'pro' ? t('Pro.Price') : t('Hobby.Price');
    const upgradeLabel = desktopBillingHandoff ? t('DesktopUpgradeToPro') : t('UpgradeToPro');
    const openingLabel = desktopBillingHandoff ? t('OpeningBrowser') : t('Opening');
    const readOnly = !billingManagementAvailable ? t('DesktopCloudUnavailable') : t('ReadOnlyHint');
    const hobbyFeatures = [
        t('Hobby.Features.ConnectPopularDatabases'),
        t('Hobby.Features.SqlEditorAndQueryResults'),
        t('Hobby.Features.AiQuotaIncluded'),
        t('Hobby.Features.BasicCharts'),
        t('Hobby.Features.SavePersonalQueries'),
        t('Hobby.Features.CommunitySupport'),
    ];
    const proFeatures = [
        t('Pro.Features.UnlimitedDatabaseConnections'),
        t('Pro.Features.HigherAiQuotaAndFasterResponses'),
        t('Pro.Features.ByokAiFeatures'),
        t('Pro.Features.AdvancedChartsAndExports'),
        t('Pro.Features.EarlyAccessToUpcomingFeatures'),
        t('Pro.Features.PrioritySupport'),
    ];

    if (organizationQuery.isError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('Title')}</CardTitle>
                    <CardDescription>{t('UnavailableDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        {organizationQuery.error instanceof Error ? organizationQuery.error.message : t('Errors.LoadOrganizationFailed')}
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (!isLoading && !organization) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('Title')}</CardTitle>
                    <CardDescription>{t('UnavailableDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">{t('Errors.UnresolvedFromUrl')}</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('Title')}</CardTitle>
                <CardDescription>{t('Description')}</CardDescription>
                {billingManagementAvailable ? (
                    <CardAction>
                        <Button variant="outline" size="sm" onClick={() => void refreshBillingStatus()} disabled={billingStatusQuery.isFetching || !organization}>
                            <RefreshCw className={billingStatusQuery.isFetching ? 'size-4 animate-spin' : 'size-4'} />
                            {billingStatusQuery.isFetching ? t('Refreshing') : t('RefreshBillingStatus')}
                        </Button>
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-6">
                {!billingManagementAvailable ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{t('DesktopCloudUnavailable')}</div>
                ) : null}

                <div className={showProPlan ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}>
                    <div className="relative rounded-lg border bg-muted/30 px-4 py-4">
                        <div className="absolute right-4 top-4 inline-flex h-5 items-center rounded-full border border-sidebar-border bg-background px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {t('CurrentPlan')}
                        </div>
                        <div className="mt-2 text-2xl font-semibold">{isLoading ? t('Loading') : currentPlanTitle}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{isLoading ? null : currentPlanPrice}</div>

                        {!isLoading && !billingStatusQuery.isError ? (
                            <ul className="mt-4 space-y-3 text-sm">
                                {(isProPlan ? proFeatures : hobbyFeatures).map(feature => (
                                    <li key={feature} className="flex items-center gap-2">
                                        <Check className="size-4 text-primary" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}

                        {currentPeriodEnd ? (
                            <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4 text-sm">
                                <span className="font-medium text-muted-foreground">{t('Details.CurrentPeriodEnd')}</span>
                                <span className="text-right text-muted-foreground">{currentPeriodEnd}</span>
                            </div>
                        ) : null}
                    </div>

                    {showProPlan ? (
                        <div className="flex flex-col rounded-lg border bg-background px-4 py-4">
                            <div className="mt-2 text-2xl font-semibold">{t('Pro.Title')}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{t('Pro.Price')}</div>
                            <ul className="mt-4 space-y-3 text-sm">
                                {proFeatures.map(feature => (
                                    <li key={feature} className="flex items-center gap-2">
                                        <Check className="size-4 text-primary" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-auto pt-5">
                                {canManageBilling ? (
                                    <Button className="w-full" onClick={() => upgradeMutation.mutate()} disabled={upgradeMutation.isPending || isLoading || !organization}>
                                        {upgradeMutation.isPending ? t('Redirecting') : upgradeLabel}
                                    </Button>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{readOnly}</p>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>

                {billingStatus?.cancelAtPeriodEnd ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        {t('CancellationScheduled', { date: formatWithFallback(billingStatus.cancelAt || billingStatus.periodEnd) })}
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                    {billingStatus?.isManageable && canManageBilling ? (
                        <Button variant="outline" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending || isLoading || !organization}>
                            {portalMutation.isPending ? openingLabel : t('ManageBilling')}
                            {desktopBillingHandoff && !portalMutation.isPending ? <ExternalLink className="size-4" /> : null}
                        </Button>
                    ) : null}
                </div>

                {!canManageBilling && !showProPlan ? <p className="text-sm text-muted-foreground">{readOnly}</p> : null}
            </CardContent>
        </Card>
    );
}
