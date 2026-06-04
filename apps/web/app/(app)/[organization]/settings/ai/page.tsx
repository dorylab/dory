import { getRuntimeForServer } from '@dory/shared/runtime';
import AISettingsPageClient from './page.client';

export default function OrganizationAISettingsPage() {
    return <AISettingsPageClient initialRuntime={getRuntimeForServer() ?? 'web'} />;
}
