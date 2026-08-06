'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

import { ACTIVE_IMPORT_RUN_STATUSES, ImportWizard, type ImportRunStatus, type ImportWizardFixedTarget } from '@/app/(app)/[organization]/import/import-wizard.client';
import { tableQueryKeys } from '@/app/(app)/[organization]/components/table-browser/components/table-queries';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { tableImportParsers } from '@/lib/client/import-entry-query';
import { schemaMetadataRefreshAtom } from '@/shared/stores/app.store';

import type { TableContextTarget } from './types';

type TableImportRun = {
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

export function useTableImportDialog() {
    const [importState, setImportState] = useQueryStates(tableImportParsers, { history: 'replace' });
    const importT = useTranslations('ImportWizard');

    const openTableImport = useCallback(
        (target: TableContextTarget) => {
            if (importState.importRun && importState.importDatabase && importState.importTable) {
                void setImportState({ importOpen: true });
                toast.info(importT('Modal.CurrentTask'));
                return;
            }

            void setImportState({
                importOpen: true,
                importDatabase: target.database,
                importSchema: target.schema ?? null,
                importTable: target.unqualifiedTableName,
                importRun: null,
            });
        },
        [importState.importDatabase, importState.importRun, importState.importTable, importT, setImportState],
    );

    return openTableImport;
}

export function TableImportDialogHost({ maxFileBytes }: { maxFileBytes: number }) {
    const queryClient = useQueryClient();
    const importT = useTranslations('ImportWizard');
    const setSchemaMetadataRefresh = useSetAtom(schemaMetadataRefreshAtom);
    const [importState, setImportState] = useQueryStates(tableImportParsers, { history: 'replace' });
    const params = useParams<{ connectionId?: string | string[] }>();
    const connectionId = resolveParam(params?.connectionId);
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
        queryFn: () => fetchTableImportRun(importState.importRun!),
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

    const clearImportState = useCallback(() => {
        void setImportState({
            importOpen: false,
            importDatabase: null,
            importSchema: null,
            importTable: null,
            importRun: null,
        });
    }, [setImportState]);

    const refreshImportedTarget = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ['catalog-db-group', connectionId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-db-schemas', connectionId] });
        void queryClient.invalidateQueries({ queryKey: ['table-preview'] });
        void queryClient.invalidateQueries({ queryKey: ['schema-graph', connectionId] });
        void queryClient.invalidateQueries({ queryKey: ['schema-graph-schemas', connectionId] });

        if (connectionId && importTarget) {
            const tableName = [importTarget.schema, importTarget.table].filter(Boolean).join('.');
            void queryClient.invalidateQueries({ queryKey: tableQueryKeys.properties(connectionId, importTarget.database, tableName) });
            void queryClient.invalidateQueries({ queryKey: tableQueryKeys.stats(connectionId, importTarget.database, tableName) });
            setSchemaMetadataRefresh(previous => ({
                connectionId,
                database: importTarget.database,
                version: previous.version + 1,
            }));
        }
    }, [connectionId, importTarget, queryClient, setSchemaMetadataRefresh]);

    useEffect(() => {
        if (backgroundRun?.status !== 'completed' || refreshedImportRunRef.current === backgroundRun.id) return;

        refreshedImportRunRef.current = backgroundRun.id;
        refreshImportedTarget();
    }, [backgroundRun?.id, backgroundRun?.status, refreshImportedTarget]);

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

    const handleImportFinish = useCallback(() => {
        refreshImportedTarget();
        clearImportState();
    }, [clearImportState, refreshImportedTarget]);

    return (
        <>
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
        </>
    );
}

async function fetchTableImportRun(runId: string): Promise<TableImportRun> {
    const response = await fetch(`/api/import-runs/${encodeURIComponent(runId)}`);
    const payload = (await response.json().catch(() => null)) as { data?: TableImportRun; message?: string } | null;
    if (!response.ok || !payload?.data) throw new Error(payload?.message ?? `Request failed (${response.status})`);
    return payload.data;
}

function resolveImportRows(run?: TableImportRun) {
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
