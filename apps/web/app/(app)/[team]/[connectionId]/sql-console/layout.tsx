'use client';

import React from 'react';
import { useClientDBReady } from './useClientDBReady';
import { useTranslations } from 'next-intl';

export default function SqlConsoleLayout({ children }: React.PropsWithChildren) {
    const { ready, initializing, error } = useClientDBReady();
    const t = useTranslations('SqlConsole');
    if (error) {
        return <div className="h-full flex items-center justify-center text-xs text-red-500">{t('Layout.InitFailed')}</div>;
    }

    return <>{children}</>;
}
