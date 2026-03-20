'use client';

import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useParams, useRouter } from 'next/navigation';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { buildExplorerDatabasePath, buildExplorerListPath, buildExplorerObjectPath, buildExplorerSchemaPath } from '@/lib/explorer/build-path';
import { resolveExplorerRoute } from '@/lib/explorer/routing';
import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { ExplorerSidebar } from '@/components/explorer/components/sidebar/explorer-sidebar';
import { useDataExplorerLayout } from '../hooks/use-layout';

function normalizeHorizontalLayout(layout: readonly number[] | undefined): [number, number] {
    if (!Array.isArray(layout) || layout.length === 0) return [25, 85];

    const left = layout[0] ?? 25;
    const middle = layout[1] ?? 100 - left;
    const total = left + middle;

    if (total <= 0) return [25, 85];

    const normalizedLeft = (left / total) * 100;
    return [normalizedLeft, 100 - normalizedLeft];
}

type ExplorerLayoutProps = {
    defaultLayout?: number[] | undefined;
    children?: ReactNode;
};

function resolveParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

export function ExplorerLayout({ defaultLayout = [25, 85], children }: ExplorerLayoutProps) {
    const { normalizedLayout, onLayout } = useDataExplorerLayout(defaultLayout);
    const horizontalLayout = useMemo(() => normalizeHorizontalLayout(normalizedLayout), [normalizedLayout]);
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const router = useRouter();
    const params = useParams<{
        organization?: string | string[];
        connectionId?: string | string[];
        slug?: string[];
    }>();
    const organization = resolveParam(params?.organization);
    const connectionId = resolveParam(params?.connectionId);
    const driver = currentConnection && currentConnection.connection.id === connectionId ? currentConnection.connection.type : undefined;
    const route = useMemo(
        () =>
            resolveExplorerRoute({
                driver,
                slug: params?.slug,
            }),
        [driver, params?.slug],
    );
    const catalog = route.catalog;
    const selectedDatabase = route.resource?.database;
    const selectedSchema = route.resource?.kind === 'schema' || route.resource?.kind === 'list' || route.resource?.kind === 'object' ? route.resource.schema : undefined;
    const selectedList =
        route.resource?.kind === 'list' &&
        (route.resource.listKind === 'tables' || route.resource.listKind === 'views' || route.resource.listKind === 'materializedViews' || route.resource.listKind === 'functions')
            ? route.resource.listKind
            : undefined;
    const selectedObject =
        route.resource?.kind === 'object' &&
        (route.resource.objectKind === 'table' ||
            route.resource.objectKind === 'view' ||
            route.resource.objectKind === 'materializedView' ||
            route.resource.objectKind === 'function')
            ? {
                  schema: route.resource.schema,
                  name: route.resource.name,
                  objectKind: route.resource.objectKind,
              }
            : undefined;

    useEffect(() => {
        if (!route.resource?.database) return;
        if (activeDatabase === route.resource.database) return;
        setActiveDatabase(route.resource.database);
    }, [activeDatabase, route.resource?.database, setActiveDatabase]);

    const handleSelectDatabase = useCallback(
        (dbName: string) => {
            if (!organization || !connectionId || !dbName) return;

            router.push(buildExplorerDatabasePath({ organization, connectionId, catalog }, dbName));
        },
        [catalog, connectionId, router, organization],
    );

    const handleSelectSchema = useCallback(
        (target: { database: string; schema: string }) => {
            if (!organization || !connectionId) return;

            router.push(buildExplorerSchemaPath({ organization, connectionId, catalog }, target.database, target.schema));
        },
        [catalog, connectionId, router, organization],
    );

    const handleSelectList = useCallback(
        (target: { database: string; schema?: string; listKind: 'tables' | 'views' | 'materializedViews' | 'functions' }) => {
            if (!organization || !connectionId) return;

            router.push(
                buildExplorerListPath(
                    { organization, connectionId, catalog },
                    {
                        database: target.database,
                        schema: target.schema,
                        listKind: target.listKind,
                    },
                ),
            );
        },
        [catalog, connectionId, router, organization],
    );

    const handleSelectObject = useCallback(
        (target: { database: string; schema?: string; objectKind: 'table' | 'view' | 'materializedView' | 'function'; name: string }) => {
            if (!organization || !connectionId) return;

            router.push(
                buildExplorerObjectPath(
                    { organization, connectionId, catalog },
                    {
                        database: target.database,
                        schema: target.schema,
                        objectKind: target.objectKind,
                        name: target.name,
                    },
                ),
            );
        },
        [catalog, connectionId, router, organization],
    );

    return (
        <main className="relative h-full w-full">
            <PanelGroup direction="horizontal" autoSaveId="sql-console-horizontal" onLayout={onLayout}>
                <Panel defaultSize={horizontalLayout[0]} minSize={15} maxSize={40}>
                    <div className="flex h-full min-h-0 flex-col bg-card">
                        <ExplorerSidebar
                            catalogName={catalog}
                            onSelectDatabase={handleSelectDatabase}
                            onSelectSchema={handleSelectSchema}
                            onSelectList={handleSelectList}
                            onSelectObject={handleSelectObject}
                            onOpenObject={handleSelectObject}
                            selectedDatabase={selectedDatabase}
                            selectedSchema={selectedSchema}
                            selectedList={selectedList}
                            selectedObject={selectedObject}
                        />
                    </div>
                </Panel>

                <PanelResizeHandle className="w-1.5 bg-border transition-colors data-[resize-handle-active=true]:bg-foreground/30" />

                <Panel defaultSize={horizontalLayout[1]} minSize={40}>
                    <div className="flex h-full min-h-0 flex-col">{children}</div>
                </Panel>
            </PanelGroup>
        </main>
    );
}
