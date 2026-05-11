'use client';

import * as React from 'react';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { normalizeLocale, webLocaleToElectronLocale, writeLocaleCookie } from '@dory/i18n/locale-storage';
import type { Locale } from '@dory/i18n/routing';
import { isDesktopRuntime } from '@dory/shared/runtime';

const LANGUAGE_OPTIONS: Array<{ locale: Locale; label: string }> = [
    { locale: 'en', label: 'English' },
    { locale: 'zh', label: '简体中文' },
];

export function LocaleToggle() {
    const router = useRouter();
    const locale = normalizeLocale(useLocale());
    const t = useTranslations('DoryUI.LocaleToggle');
    const [isPending, startTransition] = React.useTransition();

    const handleSelect = (nextLocale: Locale) => {
        if (nextLocale === locale) {
            return;
        }

        startTransition(() => {
            writeLocaleCookie(nextLocale);
            if (isDesktopRuntime() && window.localeBridge) {
                void window.localeBridge.setLocale(webLocaleToElectronLocale(nextLocale));
                return;
            }
            router.refresh();
        });
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="cursor-pointer" disabled={isPending}>
                    <Languages className="h-[1.2rem] w-[1.2rem]" />
                    <span className="sr-only">{t('ToggleLanguage')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right">
                {LANGUAGE_OPTIONS.map(option => (
                    <DropdownMenuItem key={option.locale} className="cursor-pointer" onClick={() => handleSelect(option.locale)}>
                        {option.locale === locale ? `${option.label} · ${t('Current')}` : option.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
