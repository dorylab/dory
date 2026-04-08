'use client';

import { useEffect, useState } from 'react';
import { env } from 'next-runtime-env';
import { normalizeRuntime } from '@/lib/runtime/runtime';

function hasCloudBaseUrl() {
    return Boolean((env('NEXT_PUBLIC_DORY_CLOUD_API_URL') ?? '').trim());
}

export function useCloudFeatureAvailability() {
    const runtime = normalizeRuntime(env('NEXT_PUBLIC_DORY_RUNTIME'));
    const desktopUsesCloud = runtime === 'desktop' && hasCloudBaseUrl();
    const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return {
        isOffline: desktopUsesCloud && !isOnline,
        canUseCloudFeatures: !desktopUsesCloud || isOnline,
    };
}
