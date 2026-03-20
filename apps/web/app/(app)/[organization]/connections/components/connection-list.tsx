'use client';

import * as React from 'react';
import { useAtomValue } from 'jotai';

import ConnectionCard from './connection-card';
import { ConnectionListItem } from '@/types/connections';
import { connectionErrorAtom, connectionsErrorAtom } from '../states';

type Props = {
    items: ConnectionListItem[];
    connectLoadings: Record<string, boolean>;
    onConnect: (payload: any, navigateToConsole?: boolean) => void;
    onEdit: (ds: any) => void;
    onDeleteRequest: (connection: ConnectionListItem) => void;
};

export default function ConnectionList({ items, connectLoadings, onConnect, onEdit, onDeleteRequest }: Props) {
    const connectionErrors = useAtomValue(connectionsErrorAtom);

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map(connectionItem => (
                <ConnectionCard
                    key={connectionItem.connection.id}
                    id={connectionItem.connection.id}
                    connectionItem={connectionItem}
                    connectLoading={!!connectLoadings[connectionItem.connection.id]}
                    errorMessage={connectionErrors[connectionItem.connection.id]}
                    onEdit={onEdit}
                    onConnect={onConnect}
                    onDeleteRequest={onDeleteRequest}
                />
            ))}
        </div>
    );
}
