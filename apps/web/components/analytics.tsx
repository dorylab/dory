'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { env } from 'next-runtime-env';
import posthog from 'posthog-js';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { posthogBaseProperties } from '@/lib/posthog-config';
import { normalizeRuntime } from '@/lib/runtime/runtime';

export function Analytics() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const hasInitializedRef = useRef(false);

    useEffect(() => {
        if (hasInitializedRef.current) {
            return;
        }

        const posthogKey = env('NEXT_PUBLIC_POSTHOG_KEY');
        const posthogHost = env('NEXT_PUBLIC_POSTHOG_HOST');

        if (!posthogKey || !posthogHost) {
            return;
        }

        posthog.init(posthogKey, {
            api_host: '/ingest',
            ui_host: 'https://us.posthog.com',
            defaults: '2026-01-30',
            capture_exceptions: true,
            capture_pageview: false,
            debug: process.env.NODE_ENV === 'development',
        });
        posthog.register({
            ...posthogBaseProperties,
            runtime: normalizeRuntime(env('NEXT_PUBLIC_DORY_RUNTIME')) ?? 'web',
        });

        hasInitializedRef.current = true;
    }, []);

    useEffect(() => {
        if (!hasInitializedRef.current) {
            return;
        }

        const search = searchParams.toString();
        const currentUrl = search ? `${pathname}?${search}` : pathname;

        posthog.capture('$pageview', {
            $current_url: currentUrl,
        });
    }, [pathname, searchParams]);

    return <VercelAnalytics />;
}
