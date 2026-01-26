'use client';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { ConnectionDialog } from './connection-dialog';
import { connectionOpenAtom, connectionStatusAtom } from '../states';
import { useConnections } from '../hooks/use-connections';
import { currentConnectionAtom } from '@/shared/stores/app.store';

export function ConnectionDialogRoot() {
    const [open, setOpen] = useAtom(connectionOpenAtom);
    const status = useAtomValue(connectionStatusAtom);
    const [currentConnection, setCurrentConnection] = useAtom(currentConnectionAtom);
    const setStatus = useSetAtom(connectionStatusAtom);
    const connectionsQuery = useConnections();

    return (
        <ConnectionDialog
            open={open}
            onOpenChange={(openState: boolean) => {
                if (!openState) {
                    setCurrentConnection(null);
                    setStatus('New');
                }
                setOpen(openState);
            }}
            mode={status === 'Edit' ? 'Edit' : 'Create'}
            connectionItem={currentConnection ?? null}
            onSuccess={() => connectionsQuery.refetch?.()}
        />
    );
}
