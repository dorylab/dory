'use client';

import { useParams } from 'next/navigation';
import { IconFileAi, IconHelp, IconUsers } from '@tabler/icons-react';
import { IconBrandGithub } from '@tabler/icons-react';
import React from 'react';
import { useTranslations } from 'next-intl';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenuButton } from '@/registry/new-york-v4/ui/sidebar';
import { NavMain } from './nav-main';
import { NavUser } from './nav-user';
import { ArrowUpCircle, Bot, Compass, FileChartColumnIncreasing, SquareCode, Star, X } from 'lucide-react';
import { NavSecondary } from './nav-secondary';
import { ConnectionSwitcher } from './connection-switcher';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import { DoryLogo } from '@/components/@dory/ui/logo';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { User } from 'better-auth';
import { useAtomValue } from 'jotai';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { buildExplorerBasePath, buildExplorerDatabasePath } from '@/lib/explorer/build-path';
import { Button } from '@/registry/new-york-v4/ui/button';
import { cn } from '@dory/web-utils';
import type { ConnectionListItem } from '@dory/shared/types/connections';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
    initialUser?: User | null;
    organizationId: string;
    enterpriseLicense: boolean;
};

const GITHUB_REPO_URL = 'https://github.com/dorylab/dory';
const SIDEBAR_STAR_NOTIFICATION_KEY = 'dory:sidebar:star-notification:v1';

function parseConnectionOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return {};
}

function getExplorerDefaultDatabase(connection?: ConnectionListItem['connection'] | null) {
    if (!connection) return null;

    const database = connection.database?.trim();
    if (connection.type !== 'duckdb') {
        return database || null;
    }

    const options = parseConnectionOptions(connection.options);
    if (options.mode === 'motherduck') {
        return database || null;
    }

    return null;
}

export function AppSidebar({ initialUser = null, organizationId, enterpriseLicense, ...props }: AppSidebarProps) {
    const params = useParams<{ organization: string; connectionId?: string }>();
    const resolvedUser = initialUser ?? null;
    const t = useTranslations('AppSidebar');
    const organization = params.organization;
    const connectionId = params.connectionId;
    const currentConnection = useAtomValue(currentConnectionAtom);
    const currentConnectionRecord = currentConnection?.connection;
    const currentRouteConnection = currentConnectionRecord && currentConnectionRecord.id === connectionId ? currentConnectionRecord : null;
    const defaultDatabase = currentRouteConnection ? getExplorerDefaultDatabase(currentRouteConnection) : null;
    const currentConnectionType = currentRouteConnection?.type ?? null;
    const supportsOperationalPages = currentConnectionType === 'clickhouse';
    const explorerUrl =
        connectionId && defaultDatabase
            ? buildExplorerDatabasePath({ organization, connectionId }, defaultDatabase)
            : connectionId
              ? buildExplorerBasePath({ organization, connectionId })
              : `/${organization}/connections`;
    const [updaterState, setUpdaterState] = React.useState<{ readyToInstall: boolean; version: string | null }>({
        readyToInstall: false,
        version: null,
    });
    const [isRestartingUpdate, setIsRestartingUpdate] = React.useState(false);
    const restartInFlightRef = React.useRef(false);
    const updateTooltip = updaterState.version ? t('UpdateTooltip', { version: updaterState.version }) : t('UpdateTooltipUnknown');
    const [showStarNotification, setShowStarNotification] = React.useState<boolean | null>(null);

    const navMain = [
        {
            title: t('SQLConsole'),
            url: connectionId ? `/${organization}/${connectionId}/sql-console` : `/${organization}/connections`,
            icon: SquareCode,
            requiresConnection: true,
        },
        {
            title: t('Explorer'),
            url: explorerUrl,
            matchPrefix: connectionId ? buildExplorerBasePath({ organization, connectionId }) : undefined,
            icon: Compass,
            requiresConnection: true,
        },
        {
            title: t('Chatbot'),
            url: connectionId ? `/${organization}/${connectionId}/chatbot` : `/${organization}/chatbot`,
            icon: IconFileAi,
            requiresConnection: true,
        },
        {
            title: 'Agent Runs',
            url: `/${organization}/agent-runs`,
            icon: Bot,
            requiresConnection: false,
        },
        ...(supportsOperationalPages
            ? [
                  {
                      title: t('Monitoring'),
                      url: connectionId ? `/${organization}/${connectionId}/monitoring` : `/${organization}/connections`,
                      icon: FileChartColumnIncreasing,
                      requiresConnection: true,
                  },
                  {
                      title: t('Privileges'),
                      url: connectionId ? `/${organization}/${connectionId}/privileges` : `/${organization}/privileges`,
                      icon: IconUsers,
                      requiresConnection: true,
                  },
              ]
            : []),
    ];

    const navSecondary = [
        {
            title: t('GetHelp'),
            url: 'https://github.com/dorylab/dory/discussions',
            icon: IconHelp,
            external: true,
        },
    ];

    React.useEffect(() => {
        if (!window.updateBridge) return;
        let disposed = false;

        window.updateBridge
            .getState()
            .then(state => {
                if (disposed) return;
                setUpdaterState(state);
            })
            .catch(() => undefined);

        const unsubscribe = window.updateBridge.onStateChanged(state => {
            if (disposed) return;
            setUpdaterState(state);
        });

        return () => {
            disposed = true;
            unsubscribe?.();
        };
    }, []);

    React.useEffect(() => {
        try {
            setShowStarNotification(window.localStorage.getItem(SIDEBAR_STAR_NOTIFICATION_KEY) !== 'dismissed');
        } catch {
            setShowStarNotification(true);
        }
    }, []);

    const handleRestartAndInstall = async () => {
        if (!window.updateBridge || restartInFlightRef.current) return;
        restartInFlightRef.current = true;
        setIsRestartingUpdate(true);
        try {
            const accepted = await window.updateBridge.restartAndInstall();
            if (!accepted) {
                restartInFlightRef.current = false;
                setIsRestartingUpdate(false);
            }
        } catch {
            restartInFlightRef.current = false;
            setIsRestartingUpdate(false);
        }
    };

    const dismissStarNotification = React.useCallback(() => {
        try {
            window.localStorage.setItem(SIDEBAR_STAR_NOTIFICATION_KEY, 'dismissed');
        } catch {
            // Ignore storage errors and only update local UI state.
        }
        setShowStarNotification(false);
    }, []);

    return (
        <Sidebar {...props}>
            <SidebarHeader className="pb-2">
                <ConnectionSwitcher />
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={navMain} disabled={!connectionId} hasActiveConnection={!!connectionId} />
                <div className="mt-auto space-y-2">
                    {showStarNotification ? (
                        <div className="px-2 group-data-[collapsible=icon]:hidden">
                            <div className="relative rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/40 p-2.5 text-sm text-sidebar-foreground shadow-sm">
                                <div className="space-y-1.5 pr-6">
                                    <div className="flex min-w-0 items-center gap-1">
                                        <div className="inline-flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                                            <Star className="h-3 w-3 fill-current" />
                                        </div>
                                        <p className="truncate whitespace-nowrap text-[12px] font-medium leading-none tracking-[-0.02em]">{t('StarNotificationTitle')}</p>
                                    </div>
                                    <p className="text-xs leading-4.5 text-muted-foreground">{t('StarNotificationDescription')}</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className={cn('absolute right-2 top-2 h-5 w-5 shrink-0 rounded-full text-muted-foreground hover:text-foreground')}
                                    onClick={dismissStarNotification}
                                    aria-label={t('DismissStarNotification')}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                                <Button asChild size="sm" className="mt-2.5 w-full justify-center rounded-xl px-3 text-[13px]">
                                    <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className="min-w-0 gap-1.5">
                                        <IconBrandGithub size={14} />
                                        <span className="truncate whitespace-nowrap">{t('StarNotificationAction')}</span>
                                    </a>
                                </Button>
                            </div>
                        </div>
                    ) : null}
                    <NavSecondary items={navSecondary} />
                </div>
            </SidebarContent>

            <div className="relative min-h-10 px-5 pb-3 pt-2 group-data-[collapsible=icon]:px-0">
                <div className="flex items-center gap-6 transition-[opacity,transform] duration-0 ease-out group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:translate-y-1 group-data-[collapsible=icon]:opacity-0">
                    <a
                        href={GITHUB_REPO_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Dory"
                    >
                        <DoryLogo className="h-5 w-auto" />
                    </a>
                    {updaterState.readyToInstall ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge asChild>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isRestartingUpdate) return;
                                            void handleRestartAndInstall();
                                        }}
                                        aria-disabled={isRestartingUpdate}
                                        className={isRestartingUpdate ? 'pointer-events-none opacity-60' : 'cursor-pointer'}
                                    >
                                        {isRestartingUpdate ? t('Updating') : t('Update')}
                                    </button>
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="right">{updateTooltip}</TooltipContent>
                        </Tooltip>
                    ) : null}
                </div>
                {updaterState.readyToInstall ? (
                    <div className="pointer-events-none absolute inset-x-0 top-2 flex translate-y-0.5 justify-center opacity-0 transition-[opacity,transform] duration-150 ease-out group-data-[collapsible=icon]:pointer-events-auto group-data-[collapsible=icon]:translate-y-0 group-data-[collapsible=icon]:opacity-100">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <SidebarMenuButton
                                    type="button"
                                    aria-disabled={isRestartingUpdate}
                                    aria-label={isRestartingUpdate ? t('Updating') : t('Update')}
                                    onClick={() => {
                                        if (isRestartingUpdate) return;
                                        void handleRestartAndInstall();
                                    }}
                                    className={isRestartingUpdate ? 'pointer-events-none opacity-60' : undefined}
                                >
                                    <ArrowUpCircle className="h-4 w-4 shrink-0" />
                                    <span>{isRestartingUpdate ? t('Updating') : t('Update')}</span>
                                </SidebarMenuButton>
                            </TooltipTrigger>
                            <TooltipContent side="right" align="center">
                                {updateTooltip}
                            </TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
            </div>

            <Separator />

            <SidebarFooter>
                <NavUser user={resolvedUser} organizationId={organizationId} enterpriseLicense={enterpriseLicense} />
            </SidebarFooter>
        </Sidebar>
    );
}
