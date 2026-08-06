'use client';

import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useParams, useRouter } from 'next/navigation';
import { Panel, Group, Separator } from 'react-resizable-panels';

import { TableImportDialogHost, useTableImportDialog } from '@/components/table-context-menu/table-import-dialog-host';
import type { RenameTableTarget, TableContextTarget } from '@/components/table-context-menu/types';
import { executeActionClient } from '@/lib/actions/client';
import { writeSqlConsoleTableHandoff } from '@/lib/client/sql-console-handoff';
import { buildExplorerDatabasePath, buildExplorerListPath, buildExplorerObjectPath, buildExplorerSchemaPath } from '@/lib/explorer/build-path';
import { resolveExplorerRoute } from '@/lib/explorer/routing';
import { activeDatabaseAtom, currentConnectionAtom, schemaMetadataRefreshAtom } from '@/shared/stores/app.store';
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
    maxFileBytes: number;
    children?: ReactNode;
};

function resolveParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

export function ExplorerLayout({ defaultLayout = [25, 85], maxFileBytes, children }: ExplorerLayoutProps) {
    const { normalizedLayout, onLayout } = useDataExplorerLayout(defaultLayout);
    const horizontalLayout = useMemo(() => normalizeHorizontalLayout(normalizedLayout), [normalizedLayout]);
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const router = useRouter();
    const queryClient = useQueryClient();
    const setSchemaMetadataRefresh = useSetAtom(schemaMetadataRefreshAtom);
    const openTableImport = useTableImportDialog();
    const params = useParams<{
        organization?: string | string[];
        connectionId?: string | string[];
        slug?: string[];
    }>();
    const organization = resolveParam(params?.organization);
    const connectionId = resolveParam(params?.connectionId);
    const currentConnectionRecord = currentConnection?.connection;
    const currentRouteConnection = currentConnectionRecord && currentConnectionRecord.id === connectionId ? currentConnectionRecord : null;
    const driver = currentRouteConnection?.type;
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

    const refreshExplorerMetadata = useCallback(
        (database?: string) => {
            if (connectionId) {
                setSchemaMetadataRefresh(previous => ({
                    connectionId,
                    database: database ?? null,
                    version: previous.version + 1,
                }));
            }
            void queryClient.invalidateQueries({ queryKey: ['catalog-db-group', connectionId] });
            void queryClient.invalidateQueries({ queryKey: ['catalog-db-schemas', connectionId] });
            void queryClient.invalidateQueries({ queryKey: ['table-preview'] });
            void queryClient.invalidateQueries({ queryKey: ['schema-graph', connectionId] });
            void queryClient.invalidateQueries({ queryKey: ['schema-graph-schemas', connectionId] });
        },
        [connectionId, queryClient, setSchemaMetadataRefresh],
    );

    const handleNewQuery = useCallback(() => {
        if (!organization || !connectionId) return;
        writeSqlConsoleTableHandoff({ connectionId, kind: 'new-query' });
        router.push(`/${encodeURIComponent(organization)}/${encodeURIComponent(connectionId)}/sql-console`);
    }, [connectionId, organization, router]);

    const handleQuickQuery = useCallback(
        (target: TableContextTarget) => {
            if (!organization || !connectionId) return;
            writeSqlConsoleTableHandoff({ connectionId, kind: 'quick-query', target });
            router.push(`/${encodeURIComponent(organization)}/${encodeURIComponent(connectionId)}/sql-console`);
        },
        [connectionId, organization, router],
    );

    const handleRenameTable = useCallback(
        async (target: RenameTableTarget) => {
            if (!connectionId) return;
            await executeActionClient(
                'schema.renameTable',
                {
                    connectionId,
                    database: target.database,
                    table: target.tableName,
                    nextName: target.nextName,
                },
                { currentConnectionId: connectionId },
            );
            refreshExplorerMetadata(target.database);

            const selectedResource = route.resource;
            const isCurrentTable =
                selectedResource?.kind === 'object' &&
                selectedResource.objectKind === 'table' &&
                selectedResource.database === target.database &&
                selectedResource.schema === (target.schema ?? undefined) &&
                selectedResource.name === target.unqualifiedTableName;
            if (!isCurrentTable || !organization) return;

            router.replace(
                buildExplorerObjectPath(
                    { organization, connectionId, catalog },
                    {
                        database: target.database,
                        schema: target.schema ?? undefined,
                        objectKind: 'table',
                        name: target.nextName,
                    },
                ),
            );
        },
        [catalog, connectionId, organization, refreshExplorerMetadata, route.resource, router],
    );

    return (
        <main className="relative h-full w-full">
            <Group orientation="horizontal" id="explorer-horizontal" defaultLayout={{ sidebar: horizontalLayout[0], content: horizontalLayout[1] }} onLayoutChanged={onLayout}>
                <Panel id="sidebar" minSize="15%" maxSize="40%">
                    <div className="flex h-full min-h-0 flex-col bg-background">
                        <ExplorerSidebar
                            catalogName={catalog}
                            onSelectDatabase={handleSelectDatabase}
                            onSelectSchema={handleSelectSchema}
                            onSelectList={handleSelectList}
                            onSelectObject={handleSelectObject}
                            onOpenObject={handleSelectObject}
                            onNewQuery={handleNewQuery}
                            onQuickQuery={handleQuickQuery}
                            onRenameTable={handleRenameTable}
                            onImportTable={openTableImport}
                            selectedDatabase={selectedDatabase}
                            selectedSchema={selectedSchema}
                            selectedList={selectedList}
                            selectedObject={selectedObject}
                        />
                    </div>
                </Panel>

                <Separator className="w-1.5 bg-border transition-colors" />

                <Panel id="content" minSize="40%">
                    <div className="flex h-full min-h-0 flex-col">{children}</div>
                </Panel>
            </Group>

            <TableImportDialogHost maxFileBytes={maxFileBytes} />
        </main>
    );
}
