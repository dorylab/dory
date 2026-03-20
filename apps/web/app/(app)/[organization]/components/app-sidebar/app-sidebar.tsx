'use client';

import { useParams } from 'next/navigation';
import { IconFileAi, IconHelp, IconUsers } from '@tabler/icons-react';
import React from 'react';
import { useTranslations } from 'next-intl';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenuButton } from '@/registry/new-york-v4/ui/sidebar';
import { NavMain } from './nav-main';
import { NavUser } from './nav-user';
import { ArrowUpCircle, Compass, FileChartColumnIncreasing, SquareCode } from 'lucide-react';
import { NavSecondary } from './nav-secondary';
import { ConnectionSwitcher } from './connection-switcher';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import { DoryLogo } from '@/components/@dory/ui/logo';
import { ConnectionDialogRoot } from '../../connections/components/connection-dialog-root';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { User } from 'better-auth';
import { useAtomValue } from 'jotai';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { buildExplorerBasePath, buildExplorerDatabasePath } from '@/lib/explorer/build-path';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
    initialUser?: User | null;
};

export function AppSidebar({ initialUser = null, ...props }: AppSidebarProps) {
    const params = useParams<{ organization: string; connectionId?: string }>();
    const resolvedUser = initialUser ?? null;
    const t = useTranslations('AppSidebar');
    const organization = params.organization;
    const connectionId = params.connectionId;
    const currentConnection = useAtomValue(currentConnectionAtom);
    const defaultDatabase = currentConnection && currentConnection.connection.id === connectionId ? currentConnection.connection.database : null;
    const currentConnectionType = currentConnection && currentConnection.connection.id === connectionId ? currentConnection.connection.type : null;
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

    return (
        <Sidebar {...props}>
            <ConnectionDialogRoot />
            <SidebarHeader className="pb-2">
                <ConnectionSwitcher />
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={navMain} disabled={!connectionId} hasActiveConnection={!!connectionId} />
                <div className="mt-auto space-y-2">
                    <NavSecondary items={navSecondary} disabled={!connectionId} />
                </div>
            </SidebarContent>

            <div className="relative min-h-10 px-5 pb-3 pt-2 group-data-[collapsible=icon]:px-0">
                <div className="flex items-center gap-6 transition-[opacity,transform] duration-0 ease-out group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:translate-y-1 group-data-[collapsible=icon]:opacity-0">
                    <a
                        href="https://github.com/dorylab/dory"
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
                <NavUser user={resolvedUser as any} />
            </SidebarFooter>
        </Sidebar>
    );
}
