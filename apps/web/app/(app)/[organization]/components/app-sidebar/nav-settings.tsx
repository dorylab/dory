'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Building2, Moon, Settings, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SidebarMenuButton, SidebarMenuItem } from '@/registry/new-york-v4/ui/sidebar';
import { useSettings } from '../../../components/settings/settings';

export function SidebarOrganizationEntry() {
    const params = useParams<{ organization?: string }>();
    const pathname = usePathname();
    const t = useTranslations('AppSidebar');
    const organizationSlug = params.organization ?? pathname?.split('/').filter(Boolean)[0] ?? '';

    if (!organizationSlug) {
        return null;
    }

    return (
        <>
            <SidebarMenuItem>
                <SidebarMenuButton asChild className="w-full justify-start group-data-[collapsible=icon]:justify-center">
                    <Link href={`/${organizationSlug}/settings/organization`}>
                        <Building2 className="h-4 w-4 shrink-0" />
                        <span>{t('Organization')}</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem className="py-1">
                <div className="mx-2 h-px bg-sidebar-border" />
            </SidebarMenuItem>
        </>
    );
}

export function SidebarThemeEntry() {
    const { resolvedTheme, setTheme } = useTheme();
    const t = useTranslations('DoryUI');
    const ThemeIcon = resolvedTheme === 'dark' ? Moon : Sun;

    const toggleTheme = React.useCallback(() => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    }, [resolvedTheme, setTheme]);

    return (
        <SidebarMenuItem>
            <SidebarMenuButton className="w-full justify-start group-data-[collapsible=icon]:justify-center" onClick={toggleTheme}>
                <ThemeIcon className="h-4 w-4 shrink-0" />
                <span>{t('ModeToggle.ToggleTheme')}</span>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

export function SidebarSettingsEntry() {
    const t = useTranslations('DoryUI.Settings');
    const { openSettings } = useSettings();

    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                className="w-full justify-start group-data-[collapsible=icon]:justify-center"
                onClick={() => {
                    openSettings();
                }}
            >
                <Settings className="h-4 w-4" />
                <span>{t('Title')}</span>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}
