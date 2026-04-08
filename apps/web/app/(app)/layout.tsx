import { redirect } from 'next/navigation';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import SWRConfigWrapper from '@/components/@dory/ui/swr-config-wrapper';
import QueryClientWrapper from '@/components/@dory/ui/query-client-wrapper/query-client-wrapper';
import { AppCapabilitiesProvider } from '@/components/app-capabilities-provider';

export default async function AppRootLayout({ children }: { children: React.ReactNode }) {
    const bootstrap = await getAppBootstrapState();
    if (!bootstrap.session) redirect('/sign-in');

    return (
        <AppCapabilitiesProvider value={{ isOffline: bootstrap.isOffline, canUseCloudFeatures: bootstrap.canUseCloudFeatures }}>
            <SWRConfigWrapper>
                <QueryClientWrapper>{children}</QueryClientWrapper>
            </SWRConfigWrapper>
        </AppCapabilitiesProvider>
    );
}
