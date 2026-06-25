'use client';

import { useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/registry/new-york-v4/ui/button';
import { ConnectionsEmptyState } from './components/empty-state';

import ConnectionList from './components/connection-list';
import { ConnectionFilters } from './components/filters';
import { ConnectionSearch } from './components/search';

import {
    connectionDeleteAtom,
    connectionEnvironmentFilterAtom,
    connectionLoadingAtom,
    connectionOpenAtom,
    connectionSearchQueryAtom,
    connectionStatusAtom,
    connectionTagFilterAtom,
    searchResultAtom,
} from './states';
import { useConnectConnection } from './hooks/use-connect-connection';
import { useConnections, useDeleteConnection, useDuplicateConnection } from './hooks/use-connections';
import { DeleteDialog } from './components/delete-dialog';
import { LocalFilesDialog } from './components/local-files-dialog';

import type { ConnectionListItem } from '@dory/shared/types/connections';
import { currentConnectionAtom } from '@/shared/stores/app.store';

export default function ConnectionsPage() {
    const t = useTranslations('Connections');
    const [localFilesOpen, setLocalFilesOpen] = useState(false);
    const [localFilesMode, setLocalFilesMode] = useState<'create' | 'edit'>('create');
    const [localFilesConnection, setLocalFilesConnection] = useState<ConnectionListItem | null>(null);

    const connectLoadings = useAtomValue(connectionLoadingAtom);
    const setOpen = useSetAtom(connectionOpenAtom);
    const setStatus = useSetAtom(connectionStatusAtom);
    const [currentConnection, setCurrentConnection] = useAtom(currentConnectionAtom);
    const [deleteOpen, setDeleteOpen] = useAtom(connectionDeleteAtom);

    const items = useAtomValue(searchResultAtom);
    const deleteConnectionMutation = useDeleteConnection();
    const duplicateConnectionMutation = useDuplicateConnection();
    const connectMutation = useConnectConnection();
    const searchQuery = useAtomValue(connectionSearchQueryAtom);
    const environmentFilters = useAtomValue(connectionEnvironmentFilterAtom);
    const tagFilters = useAtomValue(connectionTagFilterAtom);

    const connectionsRes = useConnections();
    const isLoading = connectionsRes.isLoading;

    const connectionItems = items ?? [];
    const trimmedSearchQuery = searchQuery.trim();
    const hasConnections = Boolean(connectionsRes.data?.length);
    const filtersActive = environmentFilters.length > 0 || tagFilters.length > 0;
    const searchActive = trimmedSearchQuery.length > 0 || filtersActive;
    const showSearchEmpty = searchActive && hasConnections && connectionItems.length === 0;
    const showEmptyState = !isLoading && connectionItems.length === 0;
    const handleNewConnection = () => {
        setStatus('New');
        setCurrentConnection(null);
        setOpen(true);
    };

    const openLocalFilesCreate = () => {
        setLocalFilesMode('create');
        setLocalFilesConnection(null);
        setLocalFilesOpen(true);
    };

    const isLocalFilesConnection = (connectionItem: ConnectionListItem) => {
        const connection = connectionItem.connection;
        if (connection.type !== 'duckdb') return false;
        try {
            const options = JSON.parse(connection.options || '{}') as Record<string, unknown>;
            return options.managedBy === 'local-files' && options.mode === 'localFilesDataset';
        } catch {
            return false;
        }
    };

    function onConnect(payload: ConnectionListItem, navigateToConsole?: boolean) {
        connectMutation.mutate({ payload, navigateToConsole });
    }

    function onEdit(connectionItem: ConnectionListItem) {
        if (isLocalFilesConnection(connectionItem)) {
            setLocalFilesMode('edit');
            setLocalFilesConnection(connectionItem);
            setLocalFilesOpen(true);
            return;
        }
        setStatus('Edit');
        setCurrentConnection(connectionItem);
        setOpen(true);
    }

    function onDelete(connection: ConnectionListItem) {
        setCurrentConnection(connection);
        setDeleteOpen(true);
    }

    function onDuplicate(connection: ConnectionListItem) {
        const targetId = connection.connection.id;
        if (!targetId) {
            toast.error(t('Missing connection id'));
            return;
        }
        duplicateConnectionMutation.mutate(targetId);
    }

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <div className="container mx-auto px-12 pt-8 pb-12 lg:px-12 lg:pb-12 xl:px-8 xl:pb-8 2xl:px-4 2xl:pb-4">
                <header className="mb-6">
                    <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
                    {/* <p className="text-sm text-muted-eground">{t('description')}</p> */}
                </header>

                <div className="relative mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex w-full flex-col gap-3 sm:max-w-[520px] sm:flex-row sm:items-center">
                        <ConnectionSearch />
                        <ConnectionFilters />
                    </div>
                    {!showEmptyState && (
                        <div className="flex gap-2">
                            <Button className="cursor-pointer" variant="secondary" disabled={isLoading} onClick={openLocalFilesCreate}>
                                {t('Empty.openFiles')}
                            </Button>
                            <Button className="cursor-pointer" disabled={isLoading} onClick={handleNewConnection} data-testid="add-connection">
                                {t('Add Connection')}
                            </Button>
                        </div>
                    )}
                </div>

                {connectionItems.length > 0 ? (
                    <ConnectionList
                        items={connectionItems}
                        connectLoadings={connectLoadings}
                        onConnect={onConnect}
                        onEdit={onEdit}
                        onDuplicateRequest={onDuplicate}
                        onDeleteRequest={onDelete}
                    />
                ) : (
                    showEmptyState && (
                        <ConnectionsEmptyState
                            searchQuery={searchQuery}
                            showSearchEmpty={showSearchEmpty}
                            onAddConnection={handleNewConnection}
                            onAddLocalFiles={openLocalFilesCreate}
                        />
                    )
                )}
            </div>

            <DeleteDialog
                open={deleteOpen}
                onCancel={() => setDeleteOpen(false)}
                onConfirm={() => {
                    setDeleteOpen(false);
                    const current = currentConnection;
                    const targetId = current?.connection?.id;
                    if (!targetId) {
                        toast.error(t('Missing connection id'));
                        return;
                    }
                    deleteConnectionMutation.mutateAsync(current.connection.id!);

                    // deleteConnection(targetId)
                    //   .then(() => connectionsRes.refetch?.())

                    setCurrentConnection(null);
                }}
            />
            <LocalFilesDialog
                open={localFilesOpen}
                mode={localFilesMode}
                connectionItem={localFilesConnection}
                onOpenChange={openState => {
                    if (!openState) {
                        setLocalFilesMode('create');
                        setLocalFilesConnection(null);
                    }
                    setLocalFilesOpen(openState);
                }}
                onSuccess={() => connectionsRes.refetch?.()}
            />
        </div>
    );
}
