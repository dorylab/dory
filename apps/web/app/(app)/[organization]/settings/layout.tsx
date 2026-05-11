import type React from 'react';
import { getTranslations } from 'next-intl/server';
import { isBillingSettingsVisibleForServer } from '@dory/shared/runtime';
import { OrganizationSettingsTabs } from './organization-settings-tabs';

export default async function OrganizationSettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    const t = await getTranslations('OrganizationSettings');
    const navItems: Array<{ slug: 'organization' | 'billing'; label: string }> = [
        { slug: 'organization', label: t('Nav.Organization') },
        ...(isBillingSettingsVisibleForServer() ? ([{ slug: 'billing', label: t('Nav.Billing') }] as const) : []),
    ];

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">{t('Title')}</h1>
                <p className="text-sm text-muted-foreground">{t('Description')}</p>
            </div>

            <OrganizationSettingsTabs organization={organization} items={navItems} />

            {children}
        </div>
    );
}
