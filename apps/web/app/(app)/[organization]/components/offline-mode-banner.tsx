'use client';

import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/registry/new-york-v4/ui/alert';

export function OfflineModeBanner() {
    const t = useTranslations('Offline');

    return (
        <Alert className="border-amber-300/40 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <AlertDescription>{t('DesktopBanner')}</AlertDescription>
        </Alert>
    );
}
