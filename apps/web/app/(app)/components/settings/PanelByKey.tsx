'use client';

import dynamic from 'next/dynamic';
import type { CategoryKey } from './types';
import { AppearancePanel } from './AppearancePanel/AppearancePanel';
import { EditorPanel } from './EditorPanel/EditorPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { DataPanel } from './DataPanel';
import { ShortcutsPanel } from './ShortcutsPanel';
import { SecurityPanel } from './SecurityPanel';
import { AboutPanel } from './AboutPanel';
import { AgentAccessPanel } from './AgentAccessPanel';
import type { AISettingsPageClientProps } from '../../[organization]/settings/ai/page.client';
import type { BillingSettingsPageClientProps } from '../../[organization]/settings/billing/page.client';
import { OrganizationPanel } from './OrganizationPanel';
import { StoragePanel } from './StoragePanel';
import { useSettings } from './settings-provider';

const AISettingsPageClient = dynamic<AISettingsPageClientProps>(() => import('../../[organization]/settings/ai/page.client'));
const BillingSettingsPageClient = dynamic<BillingSettingsPageClientProps>(() => import('../../[organization]/settings/billing/page.client'));

export function PanelByKey({
    keyName,
    currentOrganizationId,
    initialUserId,
    runtime,
    billingManagementAvailable,
    desktopBillingHandoff,
}: {
    keyName: CategoryKey;
    currentOrganizationId?: string | null;
    initialUserId?: string | null;
    runtime?: string | null;
    billingManagementAvailable: boolean;
    desktopBillingHandoff: boolean;
}) {
    const { openSettings } = useSettings();

    switch (keyName) {
        case 'organization':
            return <OrganizationPanel />;
        case 'ai':
            return <AISettingsPageClient initialRuntime={runtime} onOpenBillingSettings={() => openSettings('billing')} />;
        case 'billing':
            return <BillingSettingsPageClient billingManagementAvailable={billingManagementAvailable} desktopBillingHandoff={desktopBillingHandoff} />;
        case 'storage':
            return <StoragePanel />;
        case 'appearance':
            return <AppearancePanel />;
        case 'editor':
            return <EditorPanel />;
        case 'notifications':
            return <NotificationsPanel />;
        case 'data':
            return <DataPanel />;
        case 'agentAccess':
            return <AgentAccessPanel currentOrganizationId={currentOrganizationId} initialUserId={initialUserId} />;
        case 'shortcuts':
            return <ShortcutsPanel />;
        case 'security':
            return <SecurityPanel />;
        case 'about':
            return <AboutPanel />;
        default:
            return null;
    }
}
