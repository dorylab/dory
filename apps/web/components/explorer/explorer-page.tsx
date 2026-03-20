'use client';

import { useMemo } from 'react';
import { useAtomValue } from 'jotai';

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

    const route = useMemo(
        () =>
            resolveExplorerRoute({
                driver,
                slug,
            }),
        [driver, slug],
    );

    return <ExplorerRouter baseParams={{ organization, connectionId }} route={route} />;
}
