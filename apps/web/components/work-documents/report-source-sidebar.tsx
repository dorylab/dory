'use client';

import { useDeferredValue, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReportWorkspaceContext, ReportWorkspaceSourceInfo } from '@dory/shared/types/report-workspace';
import type { TableColumn } from '@/app/(app)/[organization]/components/sql-console-sidebar/types';
import { SqlSourceSidebar } from '@/components/sql-workspace/sql-source-sidebar';
import { executeActionClient } from '@/lib/actions/client';

/** Report-scoped data adapter for the SQL workspace source browser. */
export function ReportSourceSidebar({
    context,
    info,
    loading,
    error,
    onRefresh,
    organizationId,
}: {
    context: ReportWorkspaceContext;
    info?: ReportWorkspaceSourceInfo;
    loading: boolean;
    error?: string;
    onRefresh: () => void;
    organizationId: string;
}) {
    const t = useTranslations('WorkDocuments.Workspace');
    const [filter, setFilter] = useState('');
    const deferredFilter = useDeferredValue(filter).trim().toLowerCase();
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const source = context.source;
    const database = source.kind === 'database' ? (source.database ?? 'main') : 'main';
    const tables = info?.tables ?? [];
    const columns = useQueries({
        queries: tables.map(table => ({
            queryKey: ['report-source-columns', organizationId, context.reference, source.kind === 'database' ? source.connectionId : null, database, table.name],
            enabled: source.kind === 'database' && Boolean(info?.available) && expanded.has(table.name),
            queryFn: ({ signal }: { signal: AbortSignal }) =>
                executeActionClient<{ columns: TableColumn[] }>(
                    'schema.describeTable',
                    {
                        connectionId: source.kind === 'database' ? source.connectionId : '',
                        database,
                        table: table.name,
                    },
                    { organizationId, signal },
                ),
        })),
    });
    const columnsByTableKey = Object.fromEntries(
        tables.map((table, index) => [
            table.name,
            source.kind === 'attachment' ? table.columns.map(column => ({ columnName: column.name, columnType: column.type })) : (columns[index].data?.columns ?? []),
        ]),
    );
    const toggle = (name: string) =>
        setExpanded(previous => {
            const next = new Set(previous);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    const failure = error ?? info?.reason ?? columns.find(column => column.error)?.error?.message;
    return (
        <SqlSourceSidebar
            database={{ value: database, databases: [{ value: database, label: database }], onChange: () => undefined }}
            filter={filter}
            onFilterChange={setFilter}
            refreshing={loading}
            onRefresh={() => {
                onRefresh();
                columns.forEach((column, index) => {
                    if (source.kind === 'database' && info?.available && expanded.has(tables[index].name)) void column.refetch();
                });
            }}
            notice={
                <>
                    {source.kind === 'attachment' && <p className="text-xs text-muted-foreground">DuckDB · {t('AttachmentLimit')}</p>}
                    {failure && (
                        <p role="alert" className="text-xs text-destructive">
                            {failure}
                        </p>
                    )}
                </>
            }
            tableList={{
                tables: tables
                    .filter(table => table.name.toLowerCase().includes(deferredFilter))
                    .map(table => ({ key: table.name, value: table.name, label: table.name, schemaName: null })),
                loading: loading && !info,
                activeDatabase: database,
                expandedTableKeys: expanded,
                loadingTableKeys: new Set(tables.filter((_, index) => columns[index].isFetching).map(table => table.name)),
                columnsByTableKey,
                onToggleTable: table => toggle(table.value),
                onSelectTable: table => toggle(table.tableName),
            }}
        />
    );
}
