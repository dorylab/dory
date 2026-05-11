'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
    electronLocaleToWebLocale,
    normalizeLocale,
    readLocaleCookie,
    writeLocaleCookie,
    type ElectronLocale,
} from '@dory/i18n/locale-storage';
import type { Locale } from '@dory/i18n/routing';
import { isDesktopRuntime } from '@dory/shared/runtime';

export function ElectronLocaleSync() {
    const router = useRouter();
    const locale = normalizeLocale(useLocale());
    const currentLocaleRef = React.useRef<Locale>(locale);

    React.useEffect(() => {
        currentLocaleRef.current = locale;
    }, [locale]);

    React.useEffect(() => {
        if (!isDesktopRuntime() || !window.localeBridge) {
            return;
        }

        let disposed = false;

        const syncLocale = (electronLocale: ElectronLocale) => {
            if (disposed) return;

            const nextLocale = electronLocaleToWebLocale(electronLocale);
            const cookieLocale = readLocaleCookie();
            if (cookieLocale === nextLocale && currentLocaleRef.current === nextLocale) {
                return;
            }

            writeLocaleCookie(nextLocale);
            router.refresh();
        };

        window.localeBridge
            .getLocale()
            .then(syncLocale)
            .catch(() => undefined);

        const unsubscribe = window.localeBridge.onLocaleChanged(syncLocale);

        return () => {
            disposed = true;
            unsubscribe?.();
        };
    }, [router]);

    return null;
}
