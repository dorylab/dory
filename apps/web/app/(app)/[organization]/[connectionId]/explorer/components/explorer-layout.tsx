'use client';

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAtom, useAtomValue } from 'jotai';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { toast } from 'sonner';

import { buildExplorerDatabasePath, buildExplorerListPath, buildExplorerObjectPath, buildExplorerSchemaPath } from '@/lib/explorer/build-path';
import { explorerImportParsers } from '@/lib/client/import-entry-query';
import { resolveExplorerRoute } from '@/lib/explorer/routing';
import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { ExplorerSidebar } from '@/components/explorer/components/sidebar/explorer-sidebar';
import type { SidebarImportTarget } from '@/components/explorer/components/sidebar/types';
import { ACTIVE_IMPORT_RUN_STATUSES, ImportWizard, type ImportRunStatus, type ImportWizardFixedTarget } from '@/app/(app)/[organization]/import/import-wizard.client';
import { tableQueryKeys } from '@/app/(app)/[organization]/components/table-browser/components/table-queries';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
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

type ExplorerImportRun = {
    id: string;
    status: ImportRunStatus;
    phase: string;
    processedRows: number;
    insertedRows: number;
    progress: Record<string, unknown> | null;
    profile: { rows: number } | null;
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
    const importT = useTranslations('ImportWizard');
    const [importState, setImportState] = useQueryStates(explorerImportParsers, { history: 'replace' });
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
    const importTarget = useMemo<ImportWizardFixedTarget | null>(() => {
        if (!importState.importDatabase || !importState.importTable) return null;
        return {
            database: importState.importDatabase,
            ...(importState.importSchema ? { schema: importState.importSchema } : {}),
            table: importState.importTable,
        };
    }, [importState.importDatabase, importState.importSchema, importState.importTable]);
    const importTargetLabel = importTarget ? [importTarget.database, importTarget.schema, importTarget.table].filter(Boolean).join('.') : '';
    const importRunQuery = useQuery({
        queryKey: ['import-run', importState.importRun],
        queryFn: () => fetchExplorerImportRun(importState.importRun!),
        enabled: Boolean(importState.importRun),
        refetchInterval: query => {
            const status = query.state.data?.status;
            return status && (ACTIVE_IMPORT_RUN_STATUSES.includes(status) || status === 'uploading' || status === 'analyzing') ? 1000 : false;
        },
    });
    const backgroundRun = importRunQuery.data;
    const backgroundRows = resolveImportRows(backgroundRun);
    const backgroundTotal = backgroundRun?.profile?.rows ?? 0;
    const backgroundProgress = backgroundTotal > 0 ? Math.min(100, (backgroundRows / backgroundTotal) * 100) : 0;
    const refreshedImportRunRef = useRef<string | null>(null);

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

    const clearImportState = useCallback(() => {
        void setImportState({
            importOpen: false,
            importDatabase: null,
            importSchema: null,
            importTable: null,
            importRun: null,
        });
    }, [setImportState]);

    const handleImportTable = useCallback(
        (target: SidebarImportTarget) => {
            if (importState.importRun && importTarget) {
                void setImportState({ importOpen: true });
                toast.info(importT('Modal.CurrentTask'));
                return;
            }

            void setImportState({
                importOpen: true,
                importDatabase: target.database,
                importSchema: target.schema ?? null,
                importTable: target.table,
                importRun: null,
            });
        },
        [importState.importRun, importT, importTarget, setImportState],
    );

    const handleImportOpenChange = useCallback(
        (open: boolean) => {
            if (open) {
                void setImportState({ importOpen: true });
                return;
            }
            if (importState.importRun) {
                void setImportState({ importOpen: false });
                return;
            }
            clearImportState();
        },
        [clearImportState, importState.importRun, setImportState],
    );

    const refreshImportedTarget = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ['catalog-db-group', connectionId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-db-schemas', connectionId] });
        void queryClient.invalidateQueries({ queryKey: ['table-preview'] });
        void queryClient.invalidateQueries({ queryKey: ['schema-graph', connectionId] });
        void queryClient.invalidateQueries({ queryKey: ['schema-graph-schemas', connectionId] });
        if (importTarget) {
            const tableName = [importTarget.schema, importTarget.table].filter(Boolean).join('.');
            void queryClient.invalidateQueries({ queryKey: tableQueryKeys.properties(connectionId, importTarget.database, tableName) });
            void queryClient.invalidateQueries({ queryKey: tableQueryKeys.stats(connectionId, importTarget.database, tableName) });
        }
    }, [connectionId, importTarget, queryClient]);

    useEffect(() => {
        if (backgroundRun?.status !== 'completed' || refreshedImportRunRef.current === backgroundRun.id) return;

        refreshedImportRunRef.current = backgroundRun.id;
        refreshImportedTarget();
    }, [backgroundRun?.id, backgroundRun?.status, refreshImportedTarget]);

    const handleImportFinish = useCallback(() => {
        refreshImportedTarget();
        clearImportState();
    }, [clearImportState, refreshImportedTarget]);

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
                            onImportTable={handleImportTable}
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

            <Dialog open={Boolean(importState.importOpen && importTarget)} onOpenChange={handleImportOpenChange}>
                <DialogContent className="h-[min(92vh,920px)] w-[min(96vw,1440px)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none" showCloseButton>
                    <DialogHeader className="sr-only">
                        <DialogTitle>{importT('Modal.Title', { table: importTargetLabel })}</DialogTitle>
                        <DialogDescription>{importT('Modal.Description')}</DialogDescription>
                    </DialogHeader>
                    {importTarget ? (
                        <ImportWizard
                            key={importTargetLabel}
                            mode="table-modal"
                            fixedTarget={importTarget}
                            runId={importState.importRun ?? undefined}
                            maxFileBytes={maxFileBytes}
                            onRunIdChange={nextRunId => void setImportState({ importRun: nextRunId })}
                            onFinish={handleImportFinish}
                        />
                    ) : null}
                </DialogContent>
            </Dialog>

            {!importState.importOpen && importTarget && importState.importRun ? (
                <button
                    type="button"
                    onClick={() => void setImportState({ importOpen: true })}
                    className="absolute right-4 bottom-4 z-40 w-[min(360px,calc(100%-2rem))] border bg-background p-4 text-left shadow-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <div className="flex items-start gap-3">
                        <ImportStatusIcon status={backgroundRun?.status} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{importTargetLabel}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {backgroundRun ? importT(`Status.${backgroundRun.status}`) : importT('Loading')}
                                {backgroundRun?.phase ? ` · ${backgroundRun.phase}` : ''}
                            </p>
                        </div>
                        <span className="text-xs font-medium text-primary">{importT('Modal.Reopen')}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                            className="h-full bg-primary transition-transform duration-300"
                            style={{ transform: `translateX(-${100 - (backgroundRun?.status === 'completed' ? 100 : backgroundProgress)}%)` }}
                        />
                    </div>
                </button>
            ) : null}
        </main>
    );
}

async function fetchExplorerImportRun(runId: string): Promise<ExplorerImportRun> {
    const response = await fetch(`/api/import-runs/${encodeURIComponent(runId)}`);
    const payload = (await response.json().catch(() => null)) as { data?: ExplorerImportRun; message?: string } | null;
    if (!response.ok || !payload?.data) throw new Error(payload?.message ?? `Request failed (${response.status})`);
    return payload.data;
}

function resolveImportRows(run?: ExplorerImportRun) {
    const rowsWritten = run?.progress?.rowsWritten;
    if (typeof rowsWritten === 'number' && Number.isFinite(rowsWritten)) return Math.max(0, rowsWritten);
    return run?.status === 'completed' ? Math.max(0, run.insertedRows) : Math.max(0, run?.processedRows ?? 0);
}

function ImportStatusIcon({ status }: { status?: ImportRunStatus }) {
    if (!status || status === 'uploading' || status === 'analyzing' || ACTIVE_IMPORT_RUN_STATUSES.includes(status)) {
        return <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />;
    }
    if (status === 'completed') return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />;
    if (status === 'failed' || status === 'commit_unknown') return <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />;
    return <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}
