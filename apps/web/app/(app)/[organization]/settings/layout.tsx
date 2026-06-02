import type React from 'react';
import { getTranslations } from 'next-intl/server';
import { isBillingSettingsVisibleForServer } from '@dory/shared/runtime';
import { OrganizationSettingsShell } from './organization-settings-shell';
import type { OrganizationSettingsTab } from './organization-settings-tabs';

export default async function OrganizationSettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    const t = await getTranslations('OrganizationSettings');
    const navItems: OrganizationSettingsTab[] = [
        { slug: 'organization', label: t('Nav.Organization') },
        { slug: 'members', label: t('Nav.Members') },
        { slug: 'ai', label: t('Nav.Ai') },
        ...(isBillingSettingsVisibleForServer() ? ([{ slug: 'billing', label: t('Nav.Billing') }] as const) : []),
    ];
    const meta: Record<OrganizationSettingsTab['slug'], { title: string; description: string }> = {
        organization: {
            title: t('Nav.Organization'),
            description: t('Organization.CardDescription'),
        },
        members: {
            title: t('Members.Title'),
            description: t('Members.Description'),
        },
        ai: {
            title: t('Ai.Title'),
            description: t('Ai.Description'),
        },
        'query-audit': {
            title: t('QueryAudit.Title'),
            description: t('QueryAudit.Description'),
        },
        billing: {
            title: t('Billing.Title'),
            description: t('Billing.Description'),
        },
    };

    return (
        <OrganizationSettingsShell organization={organization} items={navItems} meta={meta}>
            {children}
        </OrganizationSettingsShell>
    );
}
