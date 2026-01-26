import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import SWRConfigWrapper from '@/components/@dory/ui/swr-config-wrapper';
import QueryClientWrapper from '@/components/@dory/ui/query-client-wrapper/query-client-wrapper';

export default async function AppRootLayout({ children }: { children: React.ReactNode }) {
    const auth = await getAuth();
    const headersList = await headers();
    const session = await auth.api.getSession({
        headers: headersList,
    });
    const userAgent = headersList.get('user-agent') ?? '';
    const isElectron = userAgent.includes('Electron');

    if (!session && !isElectron) redirect('/sign-in');

    return (
        <SWRConfigWrapper>
            <QueryClientWrapper>
                {/* <div
                    className="
                        absolute inset-0 
                        bg-[url('/images/background.png')]
                        bg-cover bg-center bg-no-repeat
                        opacity-[0.12]
                        z-0
                    "
                ></div> */}
                {children}
            </QueryClientWrapper>
        </SWRConfigWrapper>
    );
}
