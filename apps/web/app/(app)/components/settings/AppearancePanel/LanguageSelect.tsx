'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { normalizeLocale, webLocaleToElectronLocale, writeLocaleCookie } from '@dory/i18n/locale-storage';
import type { Locale } from '@dory/i18n/routing';
import { isDesktopRuntime } from '@dory/shared/runtime';

const LANGUAGE_OPTIONS: Array<{ locale: Locale; label: string }> = [
    { locale: 'en', label: 'English' },
    { locale: 'es', label: 'Español' },
    { locale: 'zh', label: '简体中文' },
    { locale: 'ja', label: '日本語' },
];

export function LanguageSelect() {
    const router = useRouter();
    const t = useTranslations('DoryUI.Settings');
    const locale = normalizeLocale(useLocale());
    const [isPending, startTransition] = React.useTransition();

    const handleChange = (nextLocale: string) => {
        const normalized = normalizeLocale(nextLocale);
        if (normalized === locale) {
            return;
        }

        startTransition(() => {
            writeLocaleCookie(normalized);
            if (isDesktopRuntime() && window.localeBridge) {
                void window.localeBridge.setLocale(webLocaleToElectronLocale(normalized));
                return;
            }
            router.refresh();
        });
    };

    return (
        <Select value={locale} onValueChange={handleChange} disabled={isPending}>
            <SelectTrigger className="h-8 w-[180px] justify-between">
                <SelectValue placeholder={t('Language.Placeholder')} />
            </SelectTrigger>
            <SelectContent align="end">
                {LANGUAGE_OPTIONS.map(option => (
                    <SelectItem key={option.locale} value={option.locale}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
