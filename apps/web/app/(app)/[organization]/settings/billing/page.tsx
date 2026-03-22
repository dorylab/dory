import { redirect } from 'next/navigation';
import { isBillingEnabledForServer } from '@/lib/runtime/runtime';
import BillingSettingsPageClient from './page.client';

export default async function OrganizationBillingSettingsPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;

    if (!isBillingEnabledForServer()) {
        redirect(`/${organization}/settings/organization`);
    }

    return <BillingSettingsPageClient />;
}
