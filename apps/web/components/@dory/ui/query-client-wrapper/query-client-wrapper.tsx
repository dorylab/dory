'use client';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export default function QueryClientWrapper({ children }: { children: React.ReactNode }) {
    const t = useTranslations('DoryUI');
    const queryClient = useMemo(
        () =>
            new QueryClient({
                queryCache: new QueryCache({
                    onError: error => {
                        const message = error instanceof Error ? error.message : String(error);
                        toast(t('QueryClient.Error', { message }));
                    },
                }),
            }),
        [t],
    );

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
