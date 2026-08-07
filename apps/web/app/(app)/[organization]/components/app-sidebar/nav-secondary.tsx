'use client';

import * as React from 'react';
import { IconBrandDiscord, IconBrandGithub, IconBrandX, IconHelp } from '@tabler/icons-react';
import { BookOpen, Bug, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/registry/new-york-v4/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { SidebarSettingsEntry, SidebarThemeEntry } from './nav-settings';
import { cn } from '@dory/web-utils';

const HELP_LINKS = [
    {
        label: 'Documentation',
        href: 'https://getdory.dev/docs',
        icon: BookOpen,
    },
    {
        label: 'DiscordCommunity',
        href: 'https://discord.gg/qDVMqFDbdg',
        icon: IconBrandDiscord,
    },
    {
        label: 'GitHubDiscussions',
        href: 'https://github.com/dorylab/dory/discussions',
        icon: IconBrandGithub,
    },
    {
        label: 'ReportIssue',
        href: 'https://github.com/dorylab/dory/issues',
        icon: Bug,
    },
    {
        label: 'X',
        href: 'https://x.com/dorystudio',
        icon: IconBrandX,
    },
] as const;

function SidebarHelpCommunityEntry() {
    const t = useTranslations('AppSidebar');
    const { isMobile, state } = useSidebar();
    const [open, setOpen] = React.useState(false);

    return (
        <SidebarMenuItem>
            <Popover open={open} onOpenChange={setOpen}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <SidebarMenuButton type="button" aria-label={t('HelpCommunity')} className="w-full justify-start group-data-[collapsible=icon]:justify-center">
                                <IconHelp className="h-4 w-4 shrink-0" />
                                <span>{t('HelpCommunity')}</span>
                                <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </SidebarMenuButton>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center" hidden={state !== 'collapsed' || isMobile}>
                        {t('HelpCommunity')}
                    </TooltipContent>
                </Tooltip>
                <PopoverContent side="right" align="end" sideOffset={8} className="w-64 p-2">
                    <p className="px-2 py-1.5 text-sm font-medium">{t('NeedHelp')}</p>
                    <div className="mt-1 space-y-0.5">
                        {HELP_LINKS.map(item => {
                            const Icon = item.icon;

                            return (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                </a>
                            );
                        })}
                    </div>
                </PopoverContent>
            </Popover>
        </SidebarMenuItem>
    );
}

export function NavSecondary({ ...props }: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
    return (
        <SidebarGroup {...props} className={cn(props.className)}>
            <SidebarGroupContent>
                <SidebarMenu>
                    <SidebarThemeEntry />
                    <SidebarSettingsEntry />
                    <SidebarHelpCommunityEntry />
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}
