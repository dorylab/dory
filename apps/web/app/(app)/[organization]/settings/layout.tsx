import type React from 'react';
import { getTranslations } from 'next-intl/server';
import { isBillingSettingsVisibleForServer } from '@dory/shared/runtime';
import { OrganizationSettingsTabs } from './organization-settings-tabs';

export default async function OrganizationSettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    const t = await getTranslations('OrganizationSettings');
    const navItems: Array<{ slug: 'organization' | 'members' | 'ai' | 'query-audit' | 'billing'; label: string }> = [
        { slug: 'organization', label: t('Nav.Organization') },
        { slug: 'members', label: t('Nav.Members') },
        { slug: 'ai', label: t('Nav.Ai') },
        { slug: 'query-audit', label: t('Nav.QueryAudit') },
        ...(isBillingSettingsVisibleForServer() ? ([{ slug: 'billing', label: t('Nav.Billing') }] as const) : []),
    ];

    return (
        <div className="mx-auto grid h-full min-h-0 w-full max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[136px_minmax(0,1fr)] md:gap-0 md:px-6 md:py-6">
            <OrganizationSettingsTabs organization={organization} items={navItems} />
            <div className="min-w-0 overflow-auto md:pl-6">{children}</div>
        </div>
    );
}
