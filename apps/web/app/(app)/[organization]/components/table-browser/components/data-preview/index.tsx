'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { FileText, PanelRightOpen, Redo2, RotateCw, Undo2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createParser, parseAsIndex, useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { fetchTablePreview } from '../../lib/fetch-table-preview';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { ResultRow } from '@dory/shared/types/sql-console';
import { SQLTab } from '@dory/shared/types/tabs';
import { VTableSearchBar } from '../../../../[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import { currentSessionMetaAtom } from '../../../../[connectionId]/sql-console/components/result-table/stores/result-table.atoms';
import VTable from '../../../../[connectionId]/sql-console/components/result-table/vtable';
import { VTableFilters } from '../../../../[connectionId]/sql-console/components/result-table/vtable/VTableFilters';
import type { ColumnFilter } from '../../../../[connectionId]/sql-console/components/result-table/vtable/type';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';
import { useTablePropertiesQuery, useTableStatsQuery, useTableStructureColumnsQuery } from '../table-queries';
import { DataPreviewPaginationBar } from './DataPreviewPaginationBar';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { buildTableUpdatePreview } from '@dory/drivers/table-mutations';
import type { TableMutationDialect, TablePreviewFilter, TablePreviewSort, TableUpdateBatch } from '@dory/drivers/types';
import { commitTableUpdates } from '../../lib/commit-table-updates';
import {
    applyTableCellEdit,
    clearTableEdits,
    createEmptyTableEditSession,
    getPendingEditCounts,
    getRowKey,
    overlayPendingRow,
    pendingRowsToUpdates,
    redoTableEdit,
    revertTableCellEdit,
    revertTableRowEdit,
    tableEditSessionsAtom,
    toTableMutationValue,
    undoTableEdit,
    type PendingRowChange,
    type TableEditViewSnapshot,
} from './table-editor-store';
import { TableEditorUtilityPanel, type TableEditorInspectorPayload } from './table-editor-utility-panel';

type PreviewColumn = {
    name: string;
    type: string;
    nullable?: boolean;
    isPrimaryKey?: boolean;
};

type PreviewResultSet = {
    columns?: Array<Record<string, unknown>> | null;
    totalRows?: number | string | null;
    unfilteredTotalRows?: number | string | null;
};

type PreviewStats = {
    filteredCount: number;
    totalCount: number;
};

type PreviewCacheEntry = {
    columns: PreviewColumn[];
    rows: ResultRow[];
    totalRows: number | null;
    unfilteredTotalRows: number | null;
    stats: PreviewStats;
};

type DataPreviewProps = {
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    storageKey?: string;
    source?: string;
    emptyMessage?: string;
    inspectorPortalMode?: 'preview' | 'viewport';
    driver?: string;
};

type TableDataPreviewProps = {
    activeTab?: SQLTab;
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    inspectorPortalMode?: 'preview' | 'viewport';
    driver?: string;
};

const PREVIEW_STALE_TIME = 1000 * 60 * 5;
const PREVIEW_GC_TIME = PREVIEW_STALE_TIME * 2;
const EMPTY_ROWS: ResultRow[] = [];
const EMPTY_SEARCH_COLUMNS: string[] = [];
const parseAsNonNegativeIndex = createParser({
    parse: value => {
        const parsed = parseAsIndex.parse(value);
        return parsed != null && parsed >= 0 ? parsed : null;
    },
    serialize: value => parseAsIndex.serialize(value),
});
const parseAsPositiveInteger = createParser({
    parse: value => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    },
    serialize: value => String(value),
});
const dataPreviewPaginationParsers = {
    pageIndex: parseAsNonNegativeIndex.withDefault(0),
    pageSize: parseAsPositiveInteger.withDefault(DEFAULT_TABLE_PREVIEW_LIMIT),
};

function normalizeParam(value?: string | string[]) {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return ['true', 'yes', '1'].includes(value.toLowerCase());
    return undefined;
}

function getMutationDialect(driver?: string): TableMutationDialect | null {
    if (driver === 'postgres' || driver === 'neon' || driver === 'supabase') return 'postgres';
    if (driver === 'mysql' || driver === 'mariadb') return 'mysql';
    if (driver === 'sqlite') return 'sqlite';
    if (driver === 'duckdb') return 'duckdb';
    return null;
}

function buildPreviewQueryKey({
    connectionId,
    databaseName,
    tableName,
    storageKey,
    source,
    pageIndex,
    pageSize,
    search,
    filters,
    sort,
    searchColumns,
    countMode,
}: {
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    storageKey?: string;
    source: string;
    pageIndex: number;
    pageSize: number;
    search: string;
    filters: ColumnFilter[];
    sort: TablePreviewSort | null;
    searchColumns: string[];
    countMode: 'none' | 'exact';
}) {
    return ['table-preview', source, connectionId, databaseName, tableName, storageKey, pageIndex, pageSize, search, filters, sort, searchColumns, countMode] as const;
}

function mapPreviewRows(rows: Record<string, unknown>[], rowKeyPrefix: string): ResultRow[] {
    return rows.map((row, idx) => ({
        tabId: rowKeyPrefix,
        rid: idx,
        rowData: row,
    }));
}

function buildColumns(rows: Record<string, unknown>[], resultSet?: PreviewResultSet | null): PreviewColumn[] {
    const resultColumns: PreviewColumn[] = (resultSet?.columns ?? [])
        .map(column => {
            const name = column?.name ?? column?.columnName;
            const type = column?.type ?? column?.columnType;
            return typeof name === 'string' && name.trim()
                ? {
                      name,
                      type: typeof type === 'string' ? type : '',
                      nullable: toOptionalBoolean(column?.nullable ?? column?.isNullable),
                      isPrimaryKey: toOptionalBoolean(column?.isPrimaryKey),
                  }
                : null;
        })
        .filter(column => column !== null);

    if (resultColumns.length > 0) {
        return resultColumns;
    }

    return Object.keys(rows[0] ?? {}).map(name => ({ name, type: '' }));
}

function quoteSqlIdentifier(identifier: string) {
    return `"${identifier.replaceAll('"', '""')}"`;
}

function formatSqlLiteral(value: string) {
    return `'${value.replaceAll("'", "''")}'`;
}

function formatSqlLikeLiteral(value: string) {
    return formatSqlLiteral(`%${value}%`);
}

function buildFilterSql(filter: ColumnFilter) {
    const column = quoteSqlIdentifier(filter.col);
    const value = filter.value ?? '';

    if (filter.kind === 'number') {
        const operatorMap = {
            eq: '=',
            ne: '<>',
            gt: '>',
            ge: '>=',
            lt: '<',
            le: '<=',
        } as const;

        const operator = operatorMap[filter.op as keyof typeof operatorMap];
        return operator ? `${column} ${operator} ${formatSqlLiteral(value)}` : null;
    }

    if (filter.kind === 'range') {
        const start = filter.value ? `${column} >= ${formatSqlLiteral(filter.value)}` : null;
        const end = filter.valueTo ? `${column} <= ${formatSqlLiteral(filter.valueTo)}` : null;
        return [start, end].filter(Boolean).join(' AND ') || null;
    }

    switch (filter.op) {
        case 'contains':
            return `${column} ILIKE ${formatSqlLikeLiteral(value)}`;
        case 'equals':
            return `${column} = ${formatSqlLiteral(value)}`;
        case 'startsWith':
            return `${column} ILIKE ${formatSqlLiteral(`${value}%`)}`;
        case 'endsWith':
            return `${column} ILIKE ${formatSqlLiteral(`%${value}`)}`;
        case 'empty':
            return `(${column} IS NULL OR ${column} = '')`;
        case 'notEmpty':
            return `(${column} IS NOT NULL AND ${column} <> '')`;
        case 'regex':
            return `${column} ~ ${formatSqlLiteral(value)}`;
        default:
            return null;
    }
}

function buildCurrentPreviewSql({
    databaseName,
    tableName,
    pageIndex,
    pageSize,
    search,
    filters,
    sort,
    searchColumns,
}: {
    databaseName: string;
    tableName: string;
    pageIndex: number;
    pageSize: number;
    search: string;
    filters: ColumnFilter[];
    sort: TablePreviewSort | null;
    searchColumns: string[];
}) {
    const from = `${quoteSqlIdentifier(databaseName)}.${quoteSqlIdentifier(tableName)}`;
    const clauses: string[] = [`SELECT *`, `FROM ${from}`];
    const whereClauses: string[] = [];
    const trimmedSearch = search.trim();

    if (trimmedSearch && searchColumns.length > 0) {
        whereClauses.push(`(${searchColumns.map(column => `${quoteSqlIdentifier(column)} ILIKE ${formatSqlLikeLiteral(trimmedSearch)}`).join(' OR ')})`);
    }

    for (const filter of filters) {
        const filterSql = buildFilterSql(filter);
        if (filterSql) {
            whereClauses.push(filterSql);
        }
    }

    if (whereClauses.length > 0) {
        clauses.push(`WHERE ${whereClauses.join('\n  AND ')}`);
    }

    if (sort) {
        clauses.push(`ORDER BY ${quoteSqlIdentifier(sort.column)} ${sort.direction.toUpperCase()}`);
    }

    clauses.push(`LIMIT ${pageSize}`);
    clauses.push(`OFFSET ${pageIndex * pageSize}`);

    return `${clauses.join('\n')};`;
}

function DataPreviewLoadingBar({ ariaLabel }: { ariaLabel: string }) {
    return (
        <div className="h-0.5 w-full overflow-hidden bg-primary/10" role="progressbar" aria-label={ariaLabel}>
            <div className="h-full w-1/3 origin-left bg-primary animate-data-preview-progress" />
        </div>
    );
}

function DataPreview(props: DataPreviewProps) {
    const { connectionId, databaseName, tableName, driver, source = 'table-browser-data-preview' } = props;
    const resetKey = [source, connectionId, databaseName, tableName, driver].join('::');

    return <DataPreviewInner key={resetKey} {...props} source={source} />;
}

function DataPreviewInner({ connectionId, databaseName, tableName, storageKey, source = 'table-browser-data-preview', emptyMessage, driver }: DataPreviewProps) {
    const t = useTranslations('TableBrowser');
    const setSessionMeta = useSetAtom(currentSessionMetaAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const queryClient = useQueryClient();
    const [editSessions, setEditSessions] = useAtom(tableEditSessionsAtom);
    const sessionKey = storageKey ?? `preview:${connectionId ?? 'unknown'}:${databaseName ?? 'unknown'}:${tableName ?? 'unknown'}`;
    const editSession = editSessions[sessionKey] ?? createEmptyTableEditSession();
    const currentConnectionValue = currentConnection?.connection;
    const resolvedDriver = driver ?? (currentConnectionValue && currentConnectionValue.id === connectionId ? currentConnectionValue.type : undefined);
    const mutationDialect = getMutationDialect(resolvedDriver);

    const [query, setQuery] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [utilityPanelOpen, setUtilityPanelOpen] = useState(false);
    const [utilityPanelMode, setUtilityPanelMode] = useState<'changes' | 'inspector'>('changes');
    const [changesView, setChangesView] = useState<'visual' | 'sql'>('visual');
    const [, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<TableEditorInspectorPayload>(null);
    const [utilityPanelWidth, setUtilityPanelWidth] = useState(380);
    const [commitDialogOpen, setCommitDialogOpen] = useState(false);
    const [selectionSummary, setSelectionSummary] = useState({ cellCount: 0, rowCount: 0 });
    const [focusRequest, setFocusRequest] = useState<{ rowIndex: number; column: string; requestId: number } | null>(null);
    const [pendingJump, setPendingJump] = useState<{ rowKey: string; column: string; view: TableEditViewSnapshot } | null>(null);
    const [{ pageIndex, pageSize }, setPagination] = useQueryStates(dataPreviewPaginationParsers, {
        history: 'replace',
        shallow: true,
        scroll: false,
        urlKeys: {
            pageIndex: 'previewPage',
            pageSize: 'previewPageSize',
        },
    });
    const [activeFilters, setActiveFilters] = useState<ColumnFilter[]>([]);
    const [sortState, setSortState] = useState<TablePreviewSort | null>(null);
    const [hasUserRequestedPreviewUpdate, setHasUserRequestedPreviewUpdate] = useState(false);

    useEffect(() => {
        void setPagination({ pageIndex: 0 });
    }, [connectionId, databaseName, source, storageKey, tableName, setPagination]);

    const { data: tableProperties } = useTablePropertiesQuery({ connectionId, databaseName, tableName });
    const { data: tableStats } = useTableStatsQuery({ connectionId, databaseName, tableName });
    const { data: tableColumns } = useTableStructureColumnsQuery({ connectionId, databaseName, tableName });
    const metadataTotalRowEstimate = tableProperties?.totalRows ?? tableStats?.rowCount ?? null;
    const searchColumns = useMemo(() => tableColumns?.columns.map(column => column.name) ?? EMPTY_SEARCH_COLUMNS, [tableColumns?.columns]);
    const effectiveSearchColumns = query.trim() ? searchColumns : EMPTY_SEARCH_COLUMNS;
    const countMode = query.trim() || activeFilters.length > 0 ? 'exact' : 'none';

    const previewQueryKey = useMemo(
        () =>
            buildPreviewQueryKey({
                connectionId,
                databaseName,
                tableName,
                storageKey,
                source,
                pageIndex,
                pageSize,
                search: query,
                filters: activeFilters,
                sort: sortState,
                searchColumns: effectiveSearchColumns,
                countMode,
            }),
        [activeFilters, connectionId, countMode, databaseName, effectiveSearchColumns, pageIndex, pageSize, query, sortState, source, storageKey, tableName],
    );

    const currentPreviewSql = useMemo(() => {
        if (!databaseName || !tableName) return '';

        return buildCurrentPreviewSql({
            databaseName,
            tableName,
            pageIndex,
            pageSize,
            search: query,
            filters: activeFilters,
            sort: sortState,
            searchColumns: effectiveSearchColumns,
        });
    }, [activeFilters, databaseName, effectiveSearchColumns, pageIndex, pageSize, query, sortState, tableName]);

    const previewQuery = useQuery<PreviewCacheEntry>({
        queryKey: previewQueryKey,
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: PREVIEW_STALE_TIME,
        gcTime: PREVIEW_GC_TIME,
        placeholderData: previousData => previousData,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            if (!connectionId || !databaseName || !tableName) {
                throw new Error(t('Failed to load data preview'));
            }

            const res = await fetchTablePreview({
                connectionId,
                databaseName,
                tableName,
                limit: pageSize,
                offset: pageIndex * pageSize,
                countMode,
                sort: sortState,
                filters: activeFilters as TablePreviewFilter[],
                search: query,
                searchColumns: effectiveSearchColumns,
                source,
                signal,
            });

            if (!isSuccess(res)) {
                throw new Error(res?.message ?? t('Failed to load data preview'));
            }

            const firstSet = (res?.data?.queryResultSets?.[0] ?? null) as PreviewResultSet | null;
            const rawRows = Array.isArray(res?.data?.results?.[0]) ? (res.data.results[0] as Record<string, unknown>[]) : [];
            const nextStorageKey = storageKey ?? `preview:${connectionId}:${databaseName}:${tableName}`;
            const mappedRows = mapPreviewRows(rawRows, nextStorageKey);
            const columns = buildColumns(rawRows, firstSet);
            const totalRows = toNumberOrNull(firstSet?.totalRows);
            const unfilteredTotalRows = toNumberOrNull(firstSet?.unfilteredTotalRows) ?? totalRows;

            return {
                columns,
                rows: mappedRows,
                totalRows,
                unfilteredTotalRows,
                stats: {
                    filteredCount: mappedRows.length,
                    totalCount: totalRows ?? mappedRows.length,
                },
            } satisfies PreviewCacheEntry;
        },
    });

    const previewData = previewQuery.data;
    const baseRows = useMemo(() => previewData?.rows ?? EMPTY_ROWS, [previewData]);
    const columns = useMemo<PreviewColumn[]>(() => {
        const metadataByName = new Map((tableColumns?.columns ?? []).map(column => [column.name, column]));
        const previewColumns = previewData?.columns ?? [];
        const sourceColumns = previewColumns.length > 0 ? previewColumns : (tableColumns?.columns ?? []);
        return sourceColumns.map(column => {
            const metadata = metadataByName.get(column.name);
            return {
                ...column,
                type: metadata?.type ?? column.type ?? '',
                nullable: metadata?.nullable ?? column.nullable,
                isPrimaryKey: metadata?.isPrimaryKey ?? column.isPrimaryKey,
            };
        });
    }, [previewData?.columns, tableColumns?.columns]);
    const primaryKeyColumns = useMemo(() => columns.filter(column => column.isPrimaryKey).map(column => column.name), [columns]);
    const columnsByName = useMemo(() => new Map(columns.map(column => [column.name, column])), [columns]);
    const tableIsEditable = Boolean(mutationDialect && primaryKeyColumns.length > 0);
    const rows = useMemo(
        () =>
            baseRows.map(row => {
                const rowIdentity = getRowKey(row.rowData, primaryKeyColumns);
                return rowIdentity
                    ? {
                          ...row,
                          rowData: overlayPendingRow(row.rowData, rowIdentity.rowKey, editSession),
                      }
                    : row;
            }),
        [baseRows, editSession, primaryKeyColumns],
    );
    const editCounts = useMemo(() => getPendingEditCounts(editSession), [editSession]);
    const pendingUpdates = useMemo(() => pendingRowsToUpdates(editSession), [editSession]);
    const updateBatch = useMemo<TableUpdateBatch | null>(() => {
        if (!databaseName || !tableName || !primaryKeyColumns.length || !pendingUpdates.length) return null;
        return {
            database: databaseName,
            table: tableName,
            primaryKeyColumns,
            rows: pendingUpdates,
        };
    }, [databaseName, pendingUpdates, primaryKeyColumns, tableName]);
    const updateSqlPreview = useMemo(() => {
        if (!mutationDialect || !updateBatch) return '';
        try {
            return buildTableUpdatePreview(mutationDialect, updateBatch);
        } catch {
            return '';
        }
    }, [mutationDialect, updateBatch]);
    const totalRowEstimate = previewData?.totalRows ?? metadataTotalRowEstimate;
    const loading = previewQuery.isLoading;
    const refreshing = previewQuery.isFetching;
    const error = previewData ? null : previewQuery.error ? getErrorMessage(previewQuery.error, t('Failed to load data preview')) : null;

    useEffect(() => {
        if (!previewData) {
            setSessionMeta({});
            return;
        }

        setSessionMeta({ columns });
    }, [columns, previewData, setSessionMeta]);

    const handleVTableStatsChange = useCallback(() => {}, []);

    const handleQueryInputChange = useCallback((nextQuery: string) => {
        setSearchInput(nextQuery);
    }, []);

    const handleSearchSubmit = useCallback(() => {
        setHasUserRequestedPreviewUpdate(true);
        const nextQuery = searchInput.trim();
        if (nextQuery === query) {
            void previewQuery.refetch();
            return;
        }
        setQuery(nextQuery);
        void setPagination({ pageIndex: 0 });
    }, [previewQuery, query, searchInput, setPagination]);

    const handleClearQuery = useCallback(() => {
        setHasUserRequestedPreviewUpdate(true);
        setSearchInput('');
        setQuery('');
        void setPagination({ pageIndex: 0 });
    }, [setPagination]);

    const handleUpsertFilter = useCallback(
        (filter: ColumnFilter) => {
            setHasUserRequestedPreviewUpdate(true);
            setActiveFilters(prev => {
                const others = prev.filter(item => item.col !== filter.col);
                return [...others, filter];
            });
            void setPagination({ pageIndex: 0 });
        },
        [setPagination],
    );

    const handleRemoveFilter = useCallback(
        (column: string) => {
            setHasUserRequestedPreviewUpdate(true);
            setActiveFilters(prev => prev.filter(filter => filter.col !== column));
            void setPagination({ pageIndex: 0 });
        },
        [setPagination],
    );

    const handleClearAllFilters = useCallback(() => {
        setHasUserRequestedPreviewUpdate(true);
        setActiveFilters([]);
        void setPagination({ pageIndex: 0 });
    }, [setPagination]);

    const handleSortChange = useCallback(
        (nextSort: TablePreviewSort | null) => {
            setHasUserRequestedPreviewUpdate(true);
            setSortState(nextSort);
            void setPagination({ pageIndex: 0 });
        },
        [setPagination],
    );

    const handlePageChange = useCallback(
        (newPageIndex: number) => {
            setHasUserRequestedPreviewUpdate(true);
            void setPagination({ pageIndex: newPageIndex });
        },
        [setPagination],
    );

    const handlePageSizeChange = useCallback(
        (newPageSize: number) => {
            setHasUserRequestedPreviewUpdate(true);
            void setPagination({ pageIndex: 0, pageSize: newPageSize });
        },
        [setPagination],
    );

    const handleRefresh = useCallback(() => {
        if (refreshing) return;
        setHasUserRequestedPreviewUpdate(true);
        void previewQuery.refetch();
    }, [previewQuery, refreshing]);

    const updateEditSession = useCallback(
        (updater: (session: ReturnType<typeof createEmptyTableEditSession>) => ReturnType<typeof createEmptyTableEditSession>) => {
            setEditSessions(current => ({
                ...current,
                [sessionKey]: updater(current[sessionKey] ?? createEmptyTableEditSession()),
            }));
        },
        [sessionKey, setEditSessions],
    );

    const currentView = useMemo<TableEditViewSnapshot>(
        () => ({
            pageIndex,
            pageSize,
            search: query,
            filters: activeFilters as TablePreviewFilter[],
            sort: sortState,
        }),
        [activeFilters, pageIndex, pageSize, query, sortState],
    );

    const handleCellChange = useCallback(
        ({ rowIndex, column, originalValue, nextValue }: { rowIndex: number; column: string; originalValue: unknown; nextValue: unknown }) => {
            const row = baseRows[rowIndex]?.rowData;
            if (!row) return;
            const identity = getRowKey(row, primaryKeyColumns);
            const original = toTableMutationValue(originalValue);
            const next = toTableMutationValue(nextValue);
            if (!identity || original === undefined || next === undefined) return;
            updateEditSession(session =>
                applyTableCellEdit(session, {
                    ...identity,
                    column,
                    originalValue: original,
                    nextValue: next,
                    sourceRowIndex: rowIndex,
                    sourceView: currentView,
                }),
            );
        },
        [baseRows, currentView, primaryKeyColumns, updateEditSession],
    );

    const getRowIdentityAt = useCallback(
        (rowIndex: number) => {
            const row = baseRows[rowIndex]?.rowData;
            return row ? getRowKey(row, primaryKeyColumns) : null;
        },
        [baseRows, primaryKeyColumns],
    );

    const handleRevertCellAt = useCallback(
        (rowIndex: number, column: string) => {
            const identity = getRowIdentityAt(rowIndex);
            if (identity) updateEditSession(session => revertTableCellEdit(session, identity.rowKey, column));
        },
        [getRowIdentityAt, updateEditSession],
    );

    const getCellEditState = useCallback(
        (rowIndex: number, column: string) => {
            const identity = getRowIdentityAt(rowIndex);
            const metadata = columnsByName.get(column);
            const isComplex = /(json|array|struct|map|blob|binary|bytea|geometry|geography|interval)/i.test(metadata?.type ?? '');
            const isPrimaryKey = primaryKeyColumns.includes(column);
            const readOnlyReason = isPrimaryKey
                ? t('Editor.PrimaryKeyReadOnly')
                : isComplex
                  ? t('Editor.ComplexTypeReadOnly')
                  : !mutationDialect
                    ? t('Editor.UnsupportedDriver')
                    : primaryKeyColumns.length === 0
                      ? t('Editor.NoPrimaryKey')
                      : undefined;
            return {
                editable: tableIsEditable && !isPrimaryKey && !isComplex,
                changed: Boolean(identity && editSession.rows[identity.rowKey]?.changes[column]),
                nullable: metadata?.nullable,
                readOnlyReason,
            };
        },
        [columnsByName, editSession.rows, getRowIdentityAt, mutationDialect, primaryKeyColumns, t, tableIsEditable],
    );

    const isRowChanged = useCallback(
        (rowIndex: number) => {
            const identity = getRowIdentityAt(rowIndex);
            return Boolean(identity && editSession.rows[identity.rowKey]);
        },
        [editSession.rows, getRowIdentityAt],
    );

    const handleInspectorPayload = useCallback(
        (payload: TableEditorInspectorPayload) => {
            if (payload && 'col' in payload) {
                setInspectorPayload({
                    ...payload,
                    rowData: rows[payload.row]?.rowData,
                });
            } else {
                setInspectorPayload(payload);
            }
        },
        [rows],
    );

    const handleInspectorOpen = useCallback((open: boolean) => {
        setUtilityPanelOpen(open);
        if (open) setUtilityPanelMode('inspector');
    }, []);

    const handleJumpToCell = useCallback(
        (row: PendingRowChange, column: string) => {
            const change = row.changes[column];
            if (!change) return;
            const view = change.sourceView;
            setSearchInput(view.search);
            setQuery(view.search);
            setActiveFilters(view.filters as ColumnFilter[]);
            setSortState(view.sort);
            void setPagination({ pageIndex: view.pageIndex, pageSize: view.pageSize });
            setPendingJump({ rowKey: row.rowKey, column, view });
        },
        [setPagination],
    );

    useEffect(() => {
        if (!pendingJump || previewQuery.isFetching) return;
        const isTargetView =
            pageIndex === pendingJump.view.pageIndex &&
            pageSize === pendingJump.view.pageSize &&
            query === pendingJump.view.search &&
            JSON.stringify(activeFilters) === JSON.stringify(pendingJump.view.filters) &&
            JSON.stringify(sortState) === JSON.stringify(pendingJump.view.sort);
        if (!isTargetView) return;
        const rowIndex = baseRows.findIndex(row => getRowKey(row.rowData, primaryKeyColumns)?.rowKey === pendingJump.rowKey);
        if (rowIndex < 0) {
            toast.warning(t('Editor.JumpTargetChanged'));
        } else {
            setFocusRequest({
                rowIndex,
                column: pendingJump.column,
                requestId: Date.now(),
            });
        }
        setPendingJump(null);
    }, [activeFilters, baseRows, pageIndex, pageSize, pendingJump, previewQuery.isFetching, primaryKeyColumns, query, sortState, t]);

    const commitMutation = useMutation({
        mutationFn: async () => {
            if (!connectionId || !databaseName || !tableName || !updateBatch) {
                throw new Error(t('Editor.NothingToCommit'));
            }
            return commitTableUpdates({
                connectionId,
                database: databaseName,
                table: tableName,
                rows: updateBatch.rows,
            });
        },
        onSuccess: async result => {
            setEditSessions(current => {
                const next = { ...current };
                delete next[sessionKey];
                return next;
            });
            setCommitDialogOpen(false);
            await queryClient.invalidateQueries({ queryKey: ['table-preview'] });
            await previewQuery.refetch();
            toast.success(t('Editor.CommitSuccess', { rows: result.updatedRows, fields: result.updatedCells }));
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('Editor.CommitFailed'));
        },
    });

    const rowsSummaryValue = previewData?.totalRows ?? metadataTotalRowEstimate;
    const rowsSummaryTotal = previewData?.unfilteredTotalRows ?? metadataTotalRowEstimate ?? rowsSummaryValue;
    const totalRowsLabel = rowsSummaryTotal != null ? t('Pagination.TotalLabel', { total: rowsSummaryTotal.toLocaleString() }) : null;
    const rowsLabel = rowsSummaryValue != null ? t('Pagination.RowsLabel', { rows: rowsSummaryValue.toLocaleString() }) : null;

    const previewControls = (
        <div className="flex items-center justify-between w-full gap-3 flex-none">
            <div className="flex min-w-0 items-center gap-2">
                <VTableSearchBar
                    query={searchInput}
                    className="w-72 pl-0"
                    onQueryChange={handleQueryInputChange}
                    onClearQuery={handleClearQuery}
                    onSearchSubmit={handleSearchSubmit}
                />
                {totalRowsLabel && <div className="shrink-0 rounded-sm border bg-muted/40 px-2 py-1 text-xs tabular-nums text-muted-foreground">{totalRowsLabel}</div>}
                {selectionSummary.cellCount > 0 || selectionSummary.rowCount > 0 ? (
                    <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t('Editor.SelectionSummary', {
                            cells: selectionSummary.cellCount,
                            rows: selectionSummary.rowCount,
                        })}
                    </div>
                ) : null}
                {columns.length > 0 && !tableIsEditable ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="shrink-0 cursor-help text-xs text-muted-foreground">{t('Editor.ReadOnly')}</span>
                        </TooltipTrigger>
                        <TooltipContent>{mutationDialect ? t('Editor.NoPrimaryKey') : t('Editor.UnsupportedDriver')}</TooltipContent>
                    </Tooltip>
                ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-2">
                <div className="flex items-center">
                    <Button variant="ghost" size="icon-sm" aria-label={t('Editor.Undo')} disabled={editSession.past.length === 0} onClick={() => updateEditSession(undoTableEdit)}>
                        <Undo2 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('Editor.Redo')}
                        disabled={editSession.future.length === 0}
                        onClick={() => updateEditSession(redoTableEdit)}
                    >
                        <Redo2 className="h-4 w-4" />
                    </Button>
                </div>
                <Button variant="ghost" size="sm" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
                    <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {t('Refresh')}
                </Button>
                <Popover>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={t('Current SQL')}>
                                    <FileText />
                                </Button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>{t('Current SQL')}</TooltipContent>
                    </Tooltip>
                    <PopoverContent align="end" className="w-[420px] p-0">
                        <div className="space-y-4 p-4">
                            <div className="space-y-1">
                                <div className="text-lg font-semibold text-foreground">{t('Current SQL')}</div>
                            </div>
                            <SmartCodeBlock value={currentPreviewSql || ' '} type="sql" maxHeightClassName="max-h-64" />
                        </div>
                    </PopoverContent>
                </Popover>
                <Button
                    variant={utilityPanelOpen && utilityPanelMode === 'changes' ? 'secondary' : 'outline'}
                    size="sm"
                    className="gap-2 tabular-nums"
                    onClick={() => {
                        setUtilityPanelMode('changes');
                        setUtilityPanelOpen(true);
                    }}
                >
                    <PanelRightOpen className="h-4 w-4" />
                    {t('Editor.Changes', { count: editCounts.cellCount })}
                </Button>
            </div>
        </div>
    );

    const previewProgress = <div className="h-0.5 flex-none">{refreshing ? <DataPreviewLoadingBar ariaLabel={t('Loading Data')} /> : null}</div>;
    const utilityPanel = tableName ? (
        <TableEditorUtilityPanel
            open={utilityPanelOpen}
            width={utilityPanelWidth}
            mode={utilityPanelMode}
            changesView={changesView}
            tableName={tableName}
            columns={columns}
            primaryKeyColumns={primaryKeyColumns}
            session={editSession}
            sqlPreview={updateSqlPreview}
            inspector={inspectorPayload}
            onOpenChange={setUtilityPanelOpen}
            onModeChange={setUtilityPanelMode}
            onChangesViewChange={setChangesView}
            onWidthChange={setUtilityPanelWidth}
            onRevertCell={(rowKey, column) => updateEditSession(session => revertTableCellEdit(session, rowKey, column))}
            onRevertRow={rowKey => updateEditSession(session => revertTableRowEdit(session, rowKey))}
            onJumpToCell={handleJumpToCell}
            onClearAll={() => updateEditSession(clearTableEdits)}
            onCommitAll={() => setCommitDialogOpen(true)}
            isCommitting={commitMutation.isPending}
        />
    ) : null;
    const commitDialog = (
        <AlertDialog open={commitDialogOpen} onOpenChange={setCommitDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('Editor.ConfirmCommitTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('Editor.ConfirmCommitDescription', {
                            fields: editCounts.cellCount,
                            updates: editCounts.rowCount,
                            rows: editCounts.rowCount,
                        })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="max-h-72 overflow-auto rounded-sm border bg-muted/20 p-1">
                    <SmartCodeBlock value={updateSqlPreview || ' '} type="sql" maxHeightClassName="max-h-64" />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={commitMutation.isPending}>{t('Editor.Cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={commitMutation.isPending || !updateBatch}
                        onClick={event => {
                            event.preventDefault();
                            commitMutation.mutate();
                        }}
                    >
                        {commitMutation.isPending ? t('Editor.Committing') : t('Editor.CommitNow')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );

    if (!connectionId || !databaseName || !tableName) {
        return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{emptyMessage ?? t('No table preview')}</div>;
    }

    if (error) {
        return (
            <div className="flex h-full min-h-0 flex-col">
                {previewControls}
                {previewProgress}
                <div className="flex min-h-0 flex-1">
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                        <div>{error}</div>
                        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                            <RotateCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                            {t('Refresh')}
                        </Button>
                    </div>
                    {utilityPanel}
                </div>
                {commitDialog}
            </div>
        );
    }

    if (loading && rows.length === 0) {
        return (
            <div className="h-full min-h-0 flex flex-col">
                {previewControls}
                {previewProgress}
                <div className="flex min-h-0 flex-1">
                    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">{hasUserRequestedPreviewUpdate ? null : t('Loading Data')}</div>
                    {utilityPanel}
                </div>
                {commitDialog}
            </div>
        );
    }

    if (rows.length === 0 && !loading) {
        return (
            <div className="h-full min-h-0 flex flex-col">
                {previewControls}
                {previewProgress}
                <div className="flex min-h-0 flex-1">
                    <div className="flex min-h-0 flex-1 flex-col">
                        <VTableFilters
                            activeFilters={activeFilters}
                            columnsRaw={columns}
                            onUpsertFilter={handleUpsertFilter}
                            onRemoveFilter={handleRemoveFilter}
                            onClearAllFilters={handleClearAllFilters}
                        />
                        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">{t('No data')}</div>
                    </div>
                    {utilityPanel}
                </div>
                <DataPreviewPaginationBar
                    pageIndex={pageIndex}
                    pageSize={pageSize}
                    totalRowEstimate={totalRowEstimate}
                    currentPageRowCount={rows.length}
                    rowsLabel={rowsLabel}
                    loading={refreshing}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                />
                {commitDialog}
            </div>
        );
    }

    return (
        <div className="relative h-full min-h-0 flex flex-col">
            {previewControls}
            {previewProgress}

            <div className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                    <VTable
                        results={rows}
                        columnMetas={columns}
                        storageKey={storageKey}
                        onStatsChange={handleVTableStatsChange}
                        showSearchBar={true}
                        activeFilters={activeFilters}
                        onUpsertFilter={handleUpsertFilter}
                        onRemoveFilter={handleRemoveFilter}
                        onClearAllFilters={handleClearAllFilters}
                        serverSideOperations={true}
                        initialSort={sortState}
                        onSortChange={handleSortChange}
                        setInspectorOpen={handleInspectorOpen}
                        setInspectorMode={setInspectorMode}
                        setInspectorPayload={handleInspectorPayload}
                        editable={tableIsEditable}
                        getCellEditState={getCellEditState}
                        isRowChanged={isRowChanged}
                        onCellChange={handleCellChange}
                        onRevertCell={handleRevertCellAt}
                        onUndo={() => updateEditSession(undoTableEdit)}
                        onRedo={() => updateEditSession(redoTableEdit)}
                        onCommitAll={() => {
                            if (editCounts.cellCount > 0) setCommitDialogOpen(true);
                        }}
                        onSelectionChange={setSelectionSummary}
                        focusRequest={focusRequest}
                    />
                </div>
                {utilityPanel}
            </div>

            <DataPreviewPaginationBar
                pageIndex={pageIndex}
                pageSize={pageSize}
                totalRowEstimate={totalRowEstimate}
                currentPageRowCount={rows.length}
                rowsLabel={rowsLabel}
                loading={refreshing}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
            />
            {commitDialog}
        </div>
    );
}

export default function TableDataPreview({ activeTab, connectionId, databaseName, tableName, inspectorPortalMode, driver }: TableDataPreviewProps) {
    const storageKey = useMemo(() => {
        if (activeTab?.tabId) return `${activeTab.tabId}:data-preview`;
        if (databaseName && tableName) return `preview:${databaseName}:${tableName}:data-preview`;
        return undefined;
    }, [activeTab?.tabId, databaseName, tableName]);

    const resolvedConnectionId = activeTab?.connectionId ?? connectionId;
    const resolvedDatabase = activeTab?.tabType === 'table' ? activeTab.databaseName : databaseName;
    const resolvedTable = activeTab?.tabType === 'table' ? activeTab.tableName : tableName;

    return (
        <DataPreview
            connectionId={resolvedConnectionId}
            databaseName={resolvedDatabase}
            tableName={resolvedTable}
            storageKey={storageKey}
            source="table-tab-data-preview"
            inspectorPortalMode={inspectorPortalMode}
            driver={driver}
        />
    );
}

export function UrlDataPreview() {
    const params = useParams();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const databaseName = normalizeParam(params?.database);
    const tableName = normalizeParam(params?.table);

    const storageKey = useMemo(() => {
        if (!databaseName || !tableName) return undefined;

        const connectionId = currentConnection?.connection?.id ?? 'default';
        return `url:${connectionId}:${databaseName}:${tableName}:data-preview`;
    }, [currentConnection?.connection?.id, databaseName, tableName]);

    return (
        <DataPreview
            connectionId={currentConnection?.connection?.id}
            databaseName={databaseName}
            tableName={tableName}
            storageKey={storageKey}
            source="catalog-data-preview"
            driver={currentConnection?.connection?.type}
        />
    );
}
