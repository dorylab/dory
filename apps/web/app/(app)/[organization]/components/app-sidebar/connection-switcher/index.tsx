'use client';

import { ChevronsUpDown, Grip, Loader2, Plus, User } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/registry/new-york-v4/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';

import { cn } from '@dory/web-utils';
import { useHasMounted } from '@/hooks/use-has-mounted';
import {
    connectionErrorAtom,
    connectionListLoadingAtom,
    connectionLoadingAtom,
    connectionLoadingMessageAtom,
    connectionOpenAtom,
    connectionStatusAtom,
    connectionSwitchingAtom,
} from '../../../connections/states';
import { ConnectionCheckStatus, ConnectionIdentity, ConnectionListIdentity, ConnectionListItem } from '@dory/shared/types/connections';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { useConnectConnection } from '../../../connections/hooks/use-connect-connection';
import { useConnections } from '../../../connections/hooks/use-connections';
import { getConnectionLocationLabel } from '@/lib/connection/display';
import { DatabaseTypeIcon } from '../../../connections/components/database-type-icon';
import { FileTypeIcon } from '../../../connections/components/file-type-icon';

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

function getLocalFilesSourceType(connection?: ConnectionListItem['connection'] | null) {
    if (connection?.type !== 'duckdb') return null;
    const options = parseConnectionOptions(connection.options);
    if (options.managedBy !== 'local-files' || options.mode !== 'localFilesDataset') return null;
    return typeof options.sourceType === 'string' ? options.sourceType : null;
}

function ConnectionSourceIcon({ connection, className }: { connection?: ConnectionListItem['connection'] | null; className?: string }) {
    const sourceType = getLocalFilesSourceType(connection);
    if (sourceType) {
        return <FileTypeIcon sourceType={sourceType} className={className} />;
    }

    return <DatabaseTypeIcon type={connection?.type} className={className} />;
}

function getHostLabel(connection: ConnectionListItem['connection'] | null, isLoading: boolean, t: ReturnType<typeof useTranslations>) {
    const hostWithPort = getConnectionLocationLabel(connection);
    if (hostWithPort) return hostWithPort;
    return isLoading ? t('Loading connections') : t('No connections yet');
}

function getActiveIdentity(connection: ConnectionListItem | null): ConnectionListIdentity | null {
    if (!connection?.identities?.length) return null;
    const defaultIdentity = connection.identities.find(id => id.isDefault);
    return defaultIdentity ?? connection.identities[0];
}

function makeLoadingKey(connectionId: string, identityId?: string | null) {
    return identityId ? `${connectionId}:${identityId}` : connectionId;
}

const SWITCH_CONNECT_TIMEOUT_MS = 12_000;

export function ConnectionSwitcher() {
    const { isMobile } = useSidebar();
    const router = useRouter();
    const t = useTranslations('Connections');
    const params = useParams<{ organization?: string | string[]; connectionId?: string | string[]; connection?: string | string[] }>();
    const teamParam = params?.organization;
    const connectionParam = params?.connectionId ?? params?.connection;
    const organizationId = Array.isArray(teamParam) ? teamParam[0] : teamParam;
    const connectionId = Array.isArray(connectionParam) ? connectionParam[0] : connectionParam;
    const hasMounted = useHasMounted();

    const [currentConnection, setCurrentConnection] = useAtom(currentConnectionAtom);
    const [connectLoadings, setConnectLoadings] = useAtom(connectionLoadingAtom);
    const [pendingConnection, setPendingConnection] = useState<ConnectionListItem | null>(null);
    const [pendingIdentity, setPendingIdentity] = useState<ConnectionListIdentity | null>(null);
    const [autoConnectedRouteId, setAutoConnectedRouteId] = useState<string | null>(null);
    const [navigatingConnectionId, setNavigatingConnectionId] = useState<string | null>(null);

    const setConnectionListLoading = useSetAtom(connectionListLoadingAtom);
    const setLoadingMessage = useSetAtom(connectionLoadingMessageAtom);
    const setConnectionError = useSetAtom(connectionErrorAtom);
    const setConnectionOpen = useSetAtom(connectionOpenAtom);
    const setConnectionStatus = useSetAtom(connectionStatusAtom);
    const setConnectionSwitching = useSetAtom(connectionSwitchingAtom);

    const connectionsQuery = useConnections();
    const connections = useMemo<ConnectionListItem[]>(() => connectionsQuery.data ?? [], [connectionsQuery.data]);
    const isLoading = connectionsQuery.isLoading;

    const connectMutation = useConnectConnection();

    const isInitialLoading = isLoading && connections.length === 0;
    const hasActiveConnection = useMemo(() => Object.values(connectLoadings ?? {}).some(Boolean), [connectLoadings]);
    const isSwitcherLoading = isInitialLoading || hasActiveConnection || Boolean(pendingConnection);

    const activeConnection = useMemo(() => {
        if (!connections.length) return null;
        if (!currentConnection) return connections[0];
        return connections.find(c => c.connection.id === currentConnection.connection?.id) ?? connections[0];
    }, [currentConnection, connections]);

    const activeIdentity = useMemo(() => getActiveIdentity(activeConnection), [activeConnection]);

    const buildHealth = (connection?: ConnectionListItem['connection']) => {
        const status = (connection?.lastCheckStatus ?? 'unknown') as ConnectionCheckStatus;
        const dot = status === 'error' ? 'bg-rose-500' : status === 'ok' ? 'bg-emerald-500' : 'bg-muted-foreground/50';
        const label = status === 'ok' ? t('Connected') : status === 'error' ? t('Disconnected') : t('Unknown');
        const lastCheckAt = connection?.lastCheckAt ? new Date(connection.lastCheckAt) : null;
        const tooltipLines = [
            connection?.lastCheckError,
            hasMounted && lastCheckAt ? t('Last check', { time: lastCheckAt.toLocaleString() }) : null,
            typeof connection?.lastCheckLatencyMs === 'number' ? t('Latency', { latency: connection.lastCheckLatencyMs }) : null,
        ].filter(Boolean) as string[];

        return {
            dot,
            label,
            latency: typeof connection?.lastCheckLatencyMs === 'number' ? connection.lastCheckLatencyMs : null,
            tooltipLines,
        };
    };

    const renderHealth = (connection?: ConnectionListItem['connection']) => {
        const health = buildHealth(connection);
        const content = (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className={cn('size-2 rounded-full', health.dot)} />
            </div>
        );

        if (!health.tooltipLines.length) return content;

        return (
            <Tooltip>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent>
                    <div className="space-y-1">
                        {health.tooltipLines.map(line => (
                            <p key={line} className="max-w-xs break-words text-xs text-center">
                                {line}
                            </p>
                        ))}
                    </div>
                </TooltipContent>
            </Tooltip>
        );
    };

    useEffect(() => {
        if (!connections.length) {
            if (currentConnection) setCurrentConnection(null);
            return;
        }

        if (navigatingConnectionId && connectionId !== navigatingConnectionId) {
            return;
        }

        if (connectionId) {
            const match = connections.find(item => item.connection.id === connectionId);
            if (match && match.connection.id !== currentConnection?.connection?.id) {
                setCurrentConnection(match);
            }
            return;
        }

        if (!currentConnection || connections.every(c => c.connection.id !== currentConnection.connection?.id)) {
            setCurrentConnection(connections[0]);
        }
    }, [connectionId, currentConnection, connections, navigatingConnectionId, setCurrentConnection]);

    useEffect(() => {
        if (navigatingConnectionId && connectionId === navigatingConnectionId) {
            setNavigatingConnectionId(null);
            setPendingConnection(null);
            setPendingIdentity(null);
        }
    }, [connectionId, navigatingConnectionId]);

    useEffect(() => {
        setConnectionListLoading(isSwitcherLoading);
    }, [isSwitcherLoading, setConnectionListLoading]);

    useEffect(() => {
        if (pendingConnection) {
            const identityLabel = pendingIdentity?.name ? ` (${pendingIdentity.name})` : '';
            setLoadingMessage(t('Connect to', { name: `${pendingConnection.connection.name ?? pendingConnection.connection.id}${identityLabel}` }));
            setConnectionError(null);
            return;
        }

        if (isInitialLoading) {
            setLoadingMessage(t('Loading connections'));
            setConnectionError(null);
            return;
        }

        if (!isSwitcherLoading) {
            setLoadingMessage(null);
        }
    }, [pendingConnection, pendingIdentity, isInitialLoading, isSwitcherLoading, setLoadingMessage, setConnectionError]);

    const displayedConnection = activeConnection;
    const displayedIdentity = activeIdentity;

    const pendingLoadingKey = pendingConnection ? makeLoadingKey(pendingConnection.connection.id, pendingIdentity?.id) : null;
    const activeLoadingKey = displayedConnection ? makeLoadingKey(displayedConnection.connection.id, displayedIdentity?.id) : null;
    const isConnecting = pendingLoadingKey ? true : activeLoadingKey ? Boolean(connectLoadings?.[activeLoadingKey]) : false;

    const buildConnectionPath = (connectionItem: ConnectionListItem) => {
        if (!organizationId) return null;
        const nextConnectionId = connectionItem.connection.id;
        return `/${organizationId}/${nextConnectionId}/sql-console`;
    };

    const clearPendingConnect = useCallback(
        (connectionItem: ConnectionListItem, loadingKey: string, options?: { clearSwitching?: boolean }) => {
            setPendingConnection(current => (current?.connection.id === connectionItem.connection.id ? null : current));
            setPendingIdentity(null);
            setNavigatingConnectionId(current => (current === connectionItem.connection.id ? null : current));
            if (options?.clearSwitching) {
                setConnectionSwitching(current => (current?.connectionId === connectionItem.connection.id ? null : current));
            }
            setConnectLoadings((prev: Record<string, boolean> = {}) => {
                const next = { ...prev };
                delete next[loadingKey];
                return next;
            });
        },
        [setConnectLoadings, setConnectionSwitching],
    );

    const startConnect = (connectionItem: ConnectionListItem, identity?: ConnectionIdentity | ConnectionListIdentity | null, targetPath?: string | null) => {
        if (!connectionItem?.connection) return;

        const loadingKey = makeLoadingKey(connectionItem.connection.id, identity?.id);
        if (connectLoadings?.[loadingKey]) return;

        setPendingConnection(connectionItem);
        setPendingIdentity((identity as ConnectionListIdentity | null) ?? null);

        setConnectLoadings((prev: Record<string, boolean> = {}) => ({
            ...prev,
            [loadingKey]: true,
        }));

        const identityLabel = identity?.name ? ` (${identity.name})` : '';
        setLoadingMessage(t('Connect to', { name: `${connectionItem.connection.name ?? connectionItem.connection.id}${identityLabel}` }));
        setConnectionError(null);

        const timeoutId = window.setTimeout(() => {
            clearPendingConnect(connectionItem, loadingKey, { clearSwitching: true });
            setConnectionError(t('Connection failed'));
            setLoadingMessage(null);
        }, SWITCH_CONNECT_TIMEOUT_MS);

        connectMutation.mutate(
            {
                payload: connectionItem,
                navigateToConsole: false,
                identityId: identity?.id ?? null,
                setCurrentImmediately: false,
            },
            {
                onSuccess: () => {
                    if (targetPath) {
                        router.push(targetPath);
                    }
                },
                onError: () => {
                    clearPendingConnect(connectionItem, loadingKey, { clearSwitching: true });
                    setLoadingMessage(null);
                },
                onSettled: () => {
                    window.clearTimeout(timeoutId);
                    if (!targetPath) {
                        clearPendingConnect(connectionItem, loadingKey);
                        return;
                    }
                    setConnectLoadings((prev: Record<string, boolean> = {}) => {
                        const next = { ...prev };
                        delete next[loadingKey];
                        return next;
                    });
                },
            },
        );
    };

    const handleSelect = (connectionItem: ConnectionListItem, identity?: ConnectionIdentity) => {
        if (!connectionItem?.connection) return;
        const targetPath = buildConnectionPath(connectionItem);
        if (targetPath) {
            setNavigatingConnectionId(connectionItem.connection.id);
            setAutoConnectedRouteId(connectionItem.connection.id);
            setConnectionSwitching({
                connectionId: connectionItem.connection.id,
                startedAt: Date.now(),
            });
        }
        startConnect(connectionItem, identity, targetPath);
    };

    useEffect(() => {
        if (!connectionId || !connections.length || isLoading) return;
        if (navigatingConnectionId) return;

        const match = connections.find(item => item.connection.id === connectionId);
        if (!match) return;

        const identity = getActiveIdentity(match);
        const loadingKey = makeLoadingKey(match.connection.id, identity?.id);
        if (connectLoadings?.[loadingKey]) return;
        if (autoConnectedRouteId === connectionId) return;

        setAutoConnectedRouteId(connectionId);
        startConnect(match, identity, null);
    }, [autoConnectedRouteId, connectLoadings, connectionId, connections, isLoading, navigatingConnectionId]);

    const goToConnections = () => {
        router.push(`/${organizationId}/connections`);
    };

    const openCreateDialog = () => {
        setConnectionStatus('New');
        setCurrentConnection(null);
        setConnectionOpen(true);
    };

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground disabled:pointer-events-none disabled:cursor-wait disabled:opacity-100 disabled:text-current disabled:bg-transparent"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center">
                                <ConnectionSourceIcon connection={displayedConnection?.connection} className="max-h-7 max-w-7" />
                            </div>

                            <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    {isConnecting ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : renderHealth(displayedConnection?.connection)}
                                    <span className="truncate font-semibold text-sm">{displayedConnection?.connection.name ?? t('Connections')}</span>
                                </div>

                                <ChevronsUpDown className="size-3 text-muted-foreground shrink-0" />
                            </div>
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg" align="start" side={isMobile ? 'bottom' : 'right'} sideOffset={4}>
                        <DropdownMenuLabel className="text-muted-foreground text-xs">{t('Connections')}</DropdownMenuLabel>

                        {connections.length ? (
                            connections.map(connection => {
                                const currentIdentity = getActiveIdentity(connection);
                                const connectionLoadingKey = makeLoadingKey(connection.connection.id, currentIdentity?.id);
                                const connectionLoading = Boolean(connectLoadings?.[connectionLoadingKey]);

                                const host = getConnectionLocationLabel(connection.connection) ?? t('Unknown host');

                                return connection.identities?.length > 1 ? (
                                    <DropdownMenuSub key={connection.connection.id}>
                                        <DropdownMenuSubTrigger
                                            className={cn(
                                                'gap-2 p-2',
                                                (activeConnection?.connection.id === connection.connection.id || pendingConnection?.connection.id === connection.connection.id) &&
                                                    'bg-sidebar-accent text-sidebar-accent-foreground',
                                            )}
                                        >
                                            <div className="flex size-6 shrink-0 items-center justify-center">
                                                <ConnectionSourceIcon connection={connection.connection} className="max-h-5 max-w-5" />
                                            </div>
                                            <div className="flex flex-col min-w-0 max-w-[220px]">
                                                <div className="flex items-center gap-2">
                                                    {connectionLoading ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : renderHealth(connection.connection)}
                                                    <span className="truncate text-sm font-medium">{connection.connection.name ?? t('Unnamed connection')}</span>
                                                </div>
                                                <span className="truncate text-xs text-muted-foreground">{host}</span>
                                                {currentIdentity && (
                                                    <span className="truncate text-[11px] text-muted-foreground/80 flex items-center gap-1">
                                                        <User className="size-3" />
                                                        {currentIdentity.username}
                                                    </span>
                                                )}
                                            </div>
                                        </DropdownMenuSubTrigger>

                                        <DropdownMenuSubContent className="min-w-44 rounded-lg">
                                            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('Identities')}</DropdownMenuLabel>
                                            {connection.identities.map(identity => {
                                                const identityKey = makeLoadingKey(connection.connection.id, identity.id);
                                                const identityLoading = Boolean(connectLoadings?.[identityKey]);

                                                const isActive =
                                                    (activeConnection?.connection.id === connection.connection.id && activeIdentity?.id === identity.id) ||
                                                    (pendingConnection?.connection.id === connection.connection.id && pendingIdentity?.id === identity.id);

                                                return (
                                                    <DropdownMenuItem
                                                        key={identity.id}
                                                        onClick={() => handleSelect(connection, identity as any)}
                                                        className={cn('gap-2 p-2', isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')}
                                                    >
                                                        {identityLoading ? (
                                                            <Loader2 className="size-3 animate-spin text-muted-foreground" />
                                                        ) : (
                                                            <User className="size-3 text-muted-foreground" />
                                                        )}
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="truncate text-sm font-medium">{identity.name}</span>
                                                            {identity.isDefault && <span className="text-[10px] text-muted-foreground/80">{t('Default Identity')}</span>}
                                                        </div>
                                                    </DropdownMenuItem>
                                                );
                                            })}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                ) : (
                                    <DropdownMenuItem
                                        key={connection.connection.id}
                                        onClick={() => handleSelect(connection)}
                                        className={cn(
                                            'gap-2 p-2',
                                            (activeConnection?.connection.id === connection.connection.id || pendingConnection?.connection.id === connection.connection.id) &&
                                                'bg-sidebar-accent text-sidebar-accent-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground',
                                        )}
                                    >
                                        <div className="flex size-6 shrink-0 items-center justify-center">
                                            <ConnectionSourceIcon connection={connection.connection} className="max-h-5 max-w-5" />
                                        </div>
                                        <div className="flex flex-col min-w-0 max-w-[220px]">
                                            <div className="flex items-center gap-2">
                                                {connectionLoading ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : renderHealth(connection.connection)}
                                                <span className="truncate text-sm font-medium">{connection.connection.name ?? t('Unnamed connection')}</span>
                                            </div>
                                            <span className="truncate text-xs text-muted-foreground">{host}</span>
                                        </div>
                                    </DropdownMenuItem>
                                );
                            })
                        ) : (
                            <DropdownMenuItem className="gap-2 p-2" onClick={openCreateDialog}>
                                <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                                    <Plus className="size-4" />
                                </div>
                                <div>
                                    <span className="text-sm font-medium">{t('Add Connection')}</span>
                                    {/* <span className="text-xs text-muted-foreground">{t('Add connection to get started')}</span> */}
                                </div>
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 p-2" onClick={goToConnections}>
                            <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                                <Grip className="size-4" />
                            </div>
                            <div className="text-muted-foreground font-medium">{t('All Connections')}</div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
