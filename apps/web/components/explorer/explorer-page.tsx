'use client';

import { useMemo } from 'react';
import { useAtomValue } from 'jotai';

import { getLocalFilesSchemaName, isLocalFilesDataset } from '@/lib/explorer/local-files';
import { resolveExplorerRoute } from '@/lib/explorer/routing';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { ExplorerRouter } from './explorer-router';

type ExplorerPageProps = {
    organization: string;
    connectionId: string;
    slug?: string[];
};

export function ExplorerPage({ organization, connectionId, slug }: ExplorerPageProps) {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const driver = currentConnection?.connection?.id === connectionId ? currentConnection.connection.type : undefined;
    const isLocalFilesExplorer = currentConnection?.connection?.id === connectionId && isLocalFilesDataset(currentConnection.connection.options);
    const localFilesSchemaName = useMemo(
        () => (currentConnection?.connection?.id === connectionId ? getLocalFilesSchemaName(currentConnection.connection.options) : null),
        [connectionId, currentConnection?.connection?.id, currentConnection?.connection?.options],
    );

    const route = useMemo(
        () =>
            resolveExplorerRoute({
                driver,
                slug,
            }),
        [driver, slug],
    );

    return <ExplorerRouter baseParams={{ organization, connectionId }} route={route} isLocalFilesExplorer={isLocalFilesExplorer} localFilesSchemaName={localFilesSchemaName} />;
}
