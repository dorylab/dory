'use client';

import { useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/registry/new-york-v4/ui/button';
import { ConnectionsEmptyState } from './components/empty-state';

import ConnectionList from './components/connection-list';
import { ConnectionSearch } from './components/search';

import { connectionDeleteAtom, connectionLoadingAtom, connectionOpenAtom, connectionSearchQueryAtom, connectionStatusAtom, searchResultAtom } from './states';
import { useConnectConnection } from './hooks/use-connect-connection';
import { useConnections, useDeleteConnection } from './hooks/use-connections';
import { DeleteDialog } from './components/delete-dialog';

import type { ConnectionListItem } from '@/types/connections';
import { currentConnectionAtom } from '@/shared/stores/app.store';

export default function ConnectionsPage() {
    const t = useTranslations('Connections');

    const connectLoadings = useAtomValue(connectionLoadingAtom);
    const setOpen = useSetAtom(connectionOpenAtom);
    const setStatus = useSetAtom(connectionStatusAtom);
    const [currentConnection, setCurrentConnection] = useAtom(currentConnectionAtom);
    const [deleteOpen, setDeleteOpen] = useAtom(connectionDeleteAtom);

    const [items, setSearchResult] = useAtom(searchResultAtom);
    const deleteConnectionMutation = useDeleteConnection();
    const connectMutation = useConnectConnection();
    const searchQuery = useAtomValue(connectionSearchQueryAtom);

    const connectionsRes = useConnections();
    const isLoading = connectionsRes.isLoading;

    const connectionItems = items ?? [];
    const trimmedSearchQuery = searchQuery.trim();
    const hasConnections = Boolean(connectionsRes.data?.length);
    const searchActive = trimmedSearchQuery.length > 0;
    const showSearchEmpty = searchActive && hasConnections && connectionItems.length === 0;
    const showEmptyState = !isLoading && connectionItems.length === 0;
    const handleNewConnection = () => {
        setStatus('New');
        setCurrentConnection(null);
        setOpen(true);
    };

    
    useEffect(() => {
        if (connectionsRes.data && connectionsRes.data.length > 0) {
            setSearchResult(connectionsRes.data);
        } else if (connectionsRes.data && connectionsRes.data.length === 0) {
            setSearchResult([]);
        }
    }, [connectionsRes.data, setSearchResult]);

    
    function onConnect(payload: ConnectionListItem, navigateToConsole?: boolean) {
        connectMutation.mutate({ payload, navigateToConsole });
    }

    function onEdit(connectionItem: ConnectionListItem) {
        setStatus('Edit');
        setCurrentConnection(connectionItem);
        setOpen(true);
    }

    function onDelete(connection: ConnectionListItem) {
        setCurrentConnection(connection);
        setDeleteOpen(true);
    }

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <div className="container mx-auto mt-10 p-12 lg:p-12 xl:p-8 2xl:p-4">
                <header className="mb-6">
                    <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
                    {/* <p className="text-sm text-muted-eground">{t('description')}</p> */}
                </header>

                <div className="relative mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        <ConnectionSearch />
                    </div>
                    {!showEmptyState && (
                        <Button className="cursor-pointer" disabled={isLoading} onClick={handleNewConnection}>
                            {t('Add Connection')}
                        </Button>
                    )}
                </div>

                {connectionItems.length > 0 ? (
                    <ConnectionList items={connectionItems} connectLoadings={connectLoadings} onConnect={onConnect} onEdit={onEdit} onDeleteRequest={onDelete} />
                ) : (
                    showEmptyState && (
                        <ConnectionsEmptyState searchQuery={searchQuery} showSearchEmpty={showSearchEmpty} onAddConnection={handleNewConnection} />
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
        </div>
    );
}
