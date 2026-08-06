'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { FileText, KeyRound, PanelRightOpen, Redo2, RotateCw, Undo2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createParser, parseAsIndex, useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { fetchTablePreview } from '../../lib/fetch-table-preview';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { ResultRow } from '@dory/shared/types/sql-console';
import { SQLTab } from '@dory/shared/types/tabs';
import { VTableSearchBar } from '../../../../[connectionId]/sql-console/components/result-table/components/TableSearchBar';
import { currentSessionMetaAtom } from '../../../../[connectionId]/sql-console/components/result-table/stores/result-table.atoms';
import VTable from '../../../../[connectionId]/sql-console/components/result-table/vtable';
import { InspectorPanel } from '../../../../[connectionId]/sql-console/components/result-table/vtable/InspectorPanel';
import { VTableFilters } from '../../../../[connectionId]/sql-console/components/result-table/vtable/VTableFilters';
import type {
    ColumnFilter,
    VTableBatchEditResult,
    VTableCellChange,
    VTableCellTarget,
    VTableInspectorPayload,
} from '../../../../[connectionId]/sql-console/components/result-table/vtable/type';
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
import {
    buildTableUpdatePreview,
    getTableMutationProfile,
    isEditableTableMutationColumnType,
    MAX_TABLE_UPDATE_CHANGES_PER_ROW,
    MAX_TABLE_UPDATE_ROWS,
} from '@dory/drivers/table-mutations';
import type { TablePreviewFilter, TablePreviewSort, TableUpdateBatch } from '@dory/drivers/types';
import { commitTableUpdates } from '../../lib/commit-table-updates';
import {
    applyTableCellEdits,
    clearTableEdits,
    createEmptyTableEditSession,
    getPendingEditCounts,
    getRowKey,
    getTableEditLimitViolation,
    overlayPendingRow,
    pendingRowsToUpdates,
    redoTableEdit,
    removeCommittedTableEdits,
    revertTableCellEdit,
    revertTableCells,
    tableEditSessionsAtom,
    tableIdentitySelectionsAtom,
    toTableMutationValue,
    undoTableEdit,
    type PendingRowChange,
    type TableCellEditInput,
    type TableEditViewSnapshot,
} from './table-editor-store';
import { TableEditorPanel } from './table-editor-panel';

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
    paginationPortalContainer?: HTMLElement | null;
    driver?: string;
};

type TableDataPreviewProps = {
    activeTab?: SQLTab;
    connectionId?: string;
    databaseName?: string;
    tableName?: string;
    inspectorPortalMode?: 'preview' | 'viewport';
    paginationPortalContainer?: HTMLElement | null;
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

function DataPreviewInner({
    connectionId,
    databaseName,
    tableName,
    storageKey,
    source = 'table-browser-data-preview',
    emptyMessage,
    inspectorPortalMode = 'preview',
    paginationPortalContainer,
    driver,
}: DataPreviewProps) {
    const t = useTranslations('TableBrowser');
    const setSessionMeta = useSetAtom(currentSessionMetaAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const queryClient = useQueryClient();
    const [editSessions, setEditSessions] = useAtom(tableEditSessionsAtom);
    const [identitySelections, setIdentitySelections] = useAtom(tableIdentitySelectionsAtom);
    const sessionKey = storageKey ?? `preview:${connectionId ?? 'unknown'}:${databaseName ?? 'unknown'}:${tableName ?? 'unknown'}`;
    const editSession = useMemo(() => editSessions[sessionKey] ?? createEmptyTableEditSession(), [editSessions, sessionKey]);
    const editSessionRef = useRef(editSession);
    editSessionRef.current = editSession;
    const currentConnectionValue = currentConnection?.connection;
    const resolvedDriver = driver ?? (currentConnectionValue && currentConnectionValue.id === connectionId ? currentConnectionValue.type : undefined);
    const mutationProfile = getTableMutationProfile(resolvedDriver);
    const mutationDialect = mutationProfile?.dialect ?? null;

    const [query, setQuery] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [editorPanelOpen, setEditorPanelOpen] = useState(false);
    const [changesView, setChangesView] = useState<'visual' | 'sql'>('visual');
    const [editorPanelWidth, setEditorPanelWidth] = useState(380);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorMode, setInspectorMode] = useState<'cell' | 'row' | null>(null);
    const [inspectorPayload, setInspectorPayload] = useState<VTableInspectorPayload>(null);
    const [activeInspectorRow, setActiveInspectorRow] = useState<{ rowIndex: number; rowKey: string | null; viewIdentity: string } | null>(null);
    const [rowViewMode, setRowViewMode] = useState<'table' | 'json'>('table');
    const [inspectorWidth, setInspectorWidth] = useState(360);
    const [panelPortalContainer, setPanelPortalContainer] = useState<HTMLElement | null>(null);
    const [commitDialogOpen, setCommitDialogOpen] = useState(false);
    const [identityPopoverOpen, setIdentityPopoverOpen] = useState(false);
    const [identityDraft, setIdentityDraft] = useState<string[]>([]);
    const [pendingIdentitySelection, setPendingIdentitySelection] = useState<string[] | null>(null);
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

    useLayoutEffect(() => {
        if (inspectorPortalMode !== 'viewport') return;
        setPanelPortalContainer(document.body);
    }, [inspectorPortalMode]);

    const tablePropertiesQuery = useTablePropertiesQuery({ connectionId, databaseName, tableName });
    const tableStatsQuery = useTableStatsQuery({ connectionId, databaseName, tableName });
    const { data: tableColumns } = useTableStructureColumnsQuery({ connectionId, databaseName, tableName });
    const tableProperties = tablePropertiesQuery.data;
    const tableStats = tableStatsQuery.data;
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
    const selectableIdentityColumns = useMemo(() => columns.filter(column => isEditableTableMutationColumnType(column.type)), [columns]);
    const identityColumns = useMemo(() => {
        const selectableNames = new Set(selectableIdentityColumns.map(column => column.name));
        return Array.from(new Set([...primaryKeyColumns, ...(identitySelections[sessionKey] ?? [])])).filter(column => selectableNames.has(column));
    }, [identitySelections, primaryKeyColumns, selectableIdentityColumns, sessionKey]);
    const columnsByName = useMemo(() => new Map(columns.map(column => [column.name, column])), [columns]);
    const clickhouseMutationAllowed = resolvedDriver !== 'clickhouse' || /MergeTree$/i.test(tableProperties?.engine ?? '');
    const mutationAvailable = Boolean(mutationDialect && clickhouseMutationAllowed);
    const tableIsEditable = mutationAvailable && identityColumns.length > 0;
    const rows = useMemo(
        () =>
            baseRows.map(row => {
                const rowIdentity = getRowKey(row.rowData, identityColumns);
                return rowIdentity
                    ? {
                          ...row,
                          rowData: overlayPendingRow(row.rowData, rowIdentity.rowKey, editSession),
                      }
                    : row;
            }),
        [baseRows, editSession, identityColumns],
    );
    const currentViewIdentity = useMemo(
        () => JSON.stringify({ pageIndex, pageSize, search: query, filters: activeFilters, sort: sortState }),
        [activeFilters, pageIndex, pageSize, query, sortState],
    );
    const activeInspectorRowIndex = useMemo(() => {
        if (!activeInspectorRow) return null;
        if (activeInspectorRow.rowKey) {
            const nextIndex = baseRows.findIndex(row => getRowKey(row.rowData, identityColumns)?.rowKey === activeInspectorRow.rowKey);
            return nextIndex >= 0 ? nextIndex : null;
        }
        if (activeInspectorRow.viewIdentity !== currentViewIdentity) return null;
        return baseRows[activeInspectorRow.rowIndex] ? activeInspectorRow.rowIndex : null;
    }, [activeInspectorRow, baseRows, currentViewIdentity, identityColumns]);
    const resolvedInspectorPayload = useMemo<VTableInspectorPayload>(() => {
        if (inspectorMode !== 'row' || activeInspectorRowIndex == null) return inspectorPayload;
        const rowData = rows[activeInspectorRowIndex]?.rowData;
        return rowData ? { row: activeInspectorRowIndex, rowData } : null;
    }, [activeInspectorRowIndex, inspectorMode, inspectorPayload, rows]);
    const editCounts = useMemo(() => getPendingEditCounts(editSession), [editSession]);
    const pendingUpdates = useMemo(() => pendingRowsToUpdates(editSession), [editSession]);
    const updateBatch = useMemo<TableUpdateBatch | null>(() => {
        if (!databaseName || !tableName || !identityColumns.length || !pendingUpdates.length) return null;
        return {
            database: databaseName,
            table: tableName,
            identityColumns,
            rows: pendingUpdates,
        };
    }, [databaseName, identityColumns, pendingUpdates, tableName]);
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
    const refreshing = previewQuery.isFetching || tablePropertiesQuery.isFetching || tableStatsQuery.isFetching;
    const error = previewData ? null : previewQuery.error ? getErrorMessage(previewQuery.error, t('Failed to load data preview')) : null;

    useEffect(() => {
        if (totalRowEstimate == null) return;

        const lastPageIndex = Math.max(0, Math.ceil(totalRowEstimate / pageSize) - 1);
        if (pageIndex <= lastPageIndex) return;

        void setPagination({ pageIndex: lastPageIndex });
    }, [pageIndex, pageSize, setPagination, totalRowEstimate]);

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
        void Promise.all([previewQuery.refetch(), tablePropertiesQuery.refetch(), tableStatsQuery.refetch()]);
    }, [previewQuery, refreshing, tablePropertiesQuery, tableStatsQuery]);

    const updateEditSession = useCallback(
        (updater: (session: ReturnType<typeof createEmptyTableEditSession>) => ReturnType<typeof createEmptyTableEditSession>) => {
            const nextSession = updater(editSessionRef.current);
            editSessionRef.current = nextSession;
            setEditSessions(current => ({ ...current, [sessionKey]: nextSession }));
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

    const handleCellsChange = useCallback(
        (inputs: VTableCellChange[]): VTableBatchEditResult => {
            const edits: TableCellEditInput[] = [];
            const affectedRows = new Set<string>();
            const errors: string[] = [];

            for (const input of inputs) {
                const baseRow = baseRows[input.rowIndex]?.rowData;
                const displayedRow = rows[input.rowIndex]?.rowData;
                if (!baseRow || !displayedRow) {
                    errors.push(t('Editor.BatchRowUnavailable'));
                    continue;
                }
                const metadata = columnsByName.get(input.column);
                if (!metadata || identityColumns.includes(input.column) || !isEditableTableMutationColumnType(metadata.type)) {
                    errors.push(t('Editor.BatchReadOnly'));
                    continue;
                }
                const identity = getRowKey(baseRow, identityColumns);
                if (!identity) {
                    errors.push(t('Editor.BatchIdentityUnavailable'));
                    continue;
                }
                const original = toTableMutationValue(baseRow[input.column]);
                const current = toTableMutationValue(displayedRow[input.column]);
                const next = toTableMutationValue(input.nextValue);
                if (original === undefined || current === undefined || next === undefined) {
                    errors.push(t('Editor.BatchUnsupportedValue'));
                    continue;
                }
                if (Object.is(current, next)) continue;
                edits.push({
                    ...identity,
                    column: input.column,
                    originalValue: original,
                    nextValue: next,
                    sourceRowIndex: input.rowIndex,
                    sourceView: currentView,
                });
                affectedRows.add(identity.rowKey);
            }

            if (errors.length > 0) {
                return { ok: false, error: t('Editor.BatchRejected', { reason: errors[0], count: errors.length }) };
            }
            if (!edits.length) return { ok: true, changedCellCount: 0, affectedRowCount: 0 };
            const candidate = applyTableCellEdits(editSessionRef.current, edits);
            const limitViolation = getTableEditLimitViolation(candidate, {
                maxRows: MAX_TABLE_UPDATE_ROWS,
                maxChangesPerRow: MAX_TABLE_UPDATE_CHANGES_PER_ROW,
            });
            if (limitViolation === 'rows') {
                return { ok: false, error: t('Editor.BatchRowLimit', { count: MAX_TABLE_UPDATE_ROWS }) };
            }
            if (limitViolation === 'fields') {
                return { ok: false, error: t('Editor.BatchFieldLimit', { count: MAX_TABLE_UPDATE_CHANGES_PER_ROW }) };
            }

            editSessionRef.current = candidate;
            setEditSessions(current => ({ ...current, [sessionKey]: candidate }));
            return {
                ok: true,
                changedCellCount: edits.length,
                affectedRowCount: affectedRows.size,
            };
        },
        [baseRows, columnsByName, currentView, identityColumns, rows, sessionKey, setEditSessions, t],
    );

    const handleCellChange = useCallback(
        (input: VTableCellChange) => {
            const result = handleCellsChange([input]);
            if (!result.ok) toast.error(result.error);
        },
        [handleCellsChange],
    );

    const getRowIdentityAt = useCallback(
        (rowIndex: number) => {
            const row = baseRows[rowIndex]?.rowData;
            return row ? getRowKey(row, identityColumns) : null;
        },
        [baseRows, identityColumns],
    );

    const handleCellsRevert = useCallback(
        (targets: VTableCellTarget[]): VTableBatchEditResult => {
            const storeTargets: Array<{ rowKey: string; column: string }> = [];
            const affectedRows = new Set<string>();
            const currentSession = editSessionRef.current;
            for (const target of targets) {
                const identity = getRowIdentityAt(target.rowIndex);
                if (!identity) return { ok: false, error: t('Editor.BatchIdentityUnavailable') };
                if (!currentSession.rows[identity.rowKey]?.changes[target.column]) continue;
                storeTargets.push({ rowKey: identity.rowKey, column: target.column });
                affectedRows.add(identity.rowKey);
            }
            if (!storeTargets.length) return { ok: true, changedCellCount: 0, affectedRowCount: 0 };
            const candidate = revertTableCells(currentSession, storeTargets);
            editSessionRef.current = candidate;
            setEditSessions(current => ({ ...current, [sessionKey]: candidate }));
            return { ok: true, changedCellCount: storeTargets.length, affectedRowCount: affectedRows.size };
        },
        [getRowIdentityAt, sessionKey, setEditSessions, t],
    );

    const handleRevertCellAt = useCallback(
        (rowIndex: number, column: string) => {
            const result = handleCellsRevert([{ rowIndex, column }]);
            if (!result.ok) toast.error(result.error);
        },
        [handleCellsRevert],
    );

    const getCellEditState = useCallback(
        (rowIndex: number, column: string) => {
            const identity = getRowIdentityAt(rowIndex);
            const metadata = columnsByName.get(column);
            const isComplex = !isEditableTableMutationColumnType(metadata?.type);
            const isIdentity = identityColumns.includes(column);
            const readOnlyReason = !identity
                ? t('Editor.BatchIdentityUnavailable')
                : isIdentity
                  ? t('Editor.IdentityColumnReadOnly')
                  : isComplex
                    ? t('Editor.ComplexTypeReadOnly')
                    : !mutationAvailable
                      ? resolvedDriver === 'clickhouse' && !clickhouseMutationAllowed
                          ? t('Editor.UnsupportedClickHouseEngine')
                          : t('Editor.UnsupportedDriver')
                      : identityColumns.length === 0
                        ? t('Editor.NoIdentity')
                        : undefined;
            return {
                editable: Boolean(identity) && tableIsEditable && !isIdentity && !isComplex,
                changed: Boolean(identity && editSession.rows[identity.rowKey]?.changes[column]),
                nullable: metadata?.nullable,
                readOnlyReason,
            };
        },
        [clickhouseMutationAllowed, columnsByName, editSession.rows, getRowIdentityAt, identityColumns, mutationAvailable, resolvedDriver, t, tableIsEditable],
    );

    const isRowChanged = useCallback(
        (rowIndex: number) => {
            const identity = getRowIdentityAt(rowIndex);
            return Boolean(identity && editSession.rows[identity.rowKey]);
        },
        [editSession.rows, getRowIdentityAt],
    );

    const handleInspectorOpen = useCallback((open: boolean) => {
        setInspectorOpen(open);
        if (open) {
            setEditorPanelOpen(false);
        } else {
            setActiveInspectorRow(null);
        }
    }, []);

    const handleShowPendingChanges = useCallback(() => {
        handleInspectorOpen(false);
        setEditorPanelOpen(true);
    }, [handleInspectorOpen]);

    const handleActiveRowChange = useCallback(
        (rowIndex: number) => {
            const row = baseRows[rowIndex]?.rowData;
            if (!row) return;
            setActiveInspectorRow({
                rowIndex,
                rowKey: getRowKey(row, identityColumns)?.rowKey ?? null,
                viewIdentity: currentViewIdentity,
            });
        },
        [baseRows, currentViewIdentity, identityColumns],
    );

    useEffect(() => {
        if (!activeInspectorRow || activeInspectorRowIndex != null || previewQuery.isFetching) return;
        setActiveInspectorRow(null);
        setInspectorOpen(false);
    }, [activeInspectorRow, activeInspectorRowIndex, previewQuery.isFetching]);

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
        const rowIndex = baseRows.findIndex(row => getRowKey(row.rowData, identityColumns)?.rowKey === pendingJump.rowKey);
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
    }, [activeFilters, baseRows, identityColumns, pageIndex, pageSize, pendingJump, previewQuery.isFetching, query, sortState, t]);

    const commitMutation = useMutation({
        mutationFn: async () => {
            if (!connectionId || !databaseName || !tableName || !updateBatch) {
                throw new Error(t('Editor.NothingToCommit'));
            }
            return commitTableUpdates({
                connectionId,
                database: databaseName,
                table: tableName,
                identityColumns,
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
        onError: async error => {
            const details = (error as { details?: Record<string, unknown> }).details;
            if (details?.code === 'TABLE_MUTATION_PARTIAL_COMMIT' && Array.isArray(details.committedRowIndexes)) {
                updateEditSession(session => removeCommittedTableEdits(session, details.committedRowIndexes as number[]));
                setCommitDialogOpen(false);
                await queryClient.invalidateQueries({ queryKey: ['table-preview'] });
                await previewQuery.refetch();
                toast.warning(t('Editor.PartialCommitWarning'));
                return;
            }
            toast.error(error instanceof Error ? error.message : t('Editor.CommitFailed'));
        },
    });

    const applyIdentitySelection = useCallback(
        (nextIdentity: string[]) => {
            setIdentitySelections(current => ({ ...current, [sessionKey]: nextIdentity }));
            setIdentityPopoverOpen(false);
        },
        [sessionKey, setIdentitySelections],
    );

    const handleApplyIdentity = useCallback(() => {
        if (!identityDraft.length) return;
        if (editCounts.cellCount > 0 && JSON.stringify(identityDraft) !== JSON.stringify(identityColumns)) {
            setPendingIdentitySelection(identityDraft);
            return;
        }
        applyIdentitySelection(identityDraft);
    }, [applyIdentitySelection, editCounts.cellCount, identityColumns, identityDraft]);

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
                    <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                        <span>
                            {t('Editor.SelectionSummary', {
                                cells: selectionSummary.cellCount,
                                rows: selectionSummary.rowCount,
                            })}
                        </span>
                        {tableIsEditable && selectionSummary.cellCount > 1 ? (
                            <span className="hidden text-muted-foreground/80 xl:inline">{t('Editor.SelectionEditHint')}</span>
                        ) : null}
                    </div>
                ) : null}
                {mutationAvailable && selectableIdentityColumns.length > 0 ? (
                    <Popover
                        open={identityPopoverOpen}
                        onOpenChange={open => {
                            setIdentityPopoverOpen(open);
                            if (open) setIdentityDraft(identityColumns);
                        }}
                    >
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 max-w-64 gap-1.5 px-2 text-xs">
                                <KeyRound className="size-3.5 shrink-0" />
                                <span className="truncate">
                                    {identityColumns.length > 0 ? t('Editor.IdentitySummary', { columns: identityColumns.join(', ') }) : t('Editor.SelectIdentity')}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80 space-y-3">
                            <div>
                                <div className="text-sm font-medium">{t('Editor.SelectIdentity')}</div>
                                <p className="mt-1 text-xs text-muted-foreground">{t('Editor.IdentityDescription')}</p>
                            </div>
                            <div className="max-h-56 space-y-1 overflow-auto">
                                {selectableIdentityColumns.map(column => {
                                    const mandatory = primaryKeyColumns.includes(column.name);
                                    const checked = identityDraft.includes(column.name);
                                    return (
                                        <label key={column.name} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                                            <Checkbox
                                                checked={checked}
                                                disabled={mandatory}
                                                onCheckedChange={nextChecked => {
                                                    setIdentityDraft(current => (nextChecked ? [...current, column.name] : current.filter(name => name !== column.name)));
                                                }}
                                            />
                                            <span className="min-w-0 flex-1 truncate font-mono text-xs">{column.name}</span>
                                            {mandatory ? <span className="text-[11px] text-muted-foreground">{t('Editor.PrimaryKey')}</span> : null}
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="flex justify-end">
                                <Button size="sm" disabled={!identityDraft.length} onClick={handleApplyIdentity}>
                                    {t('Editor.ApplyIdentity')}
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                ) : null}
                {columns.length > 0 && !tableIsEditable ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="shrink-0 cursor-help text-xs text-muted-foreground">{t('Editor.ReadOnly')}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {resolvedDriver === 'clickhouse' && !clickhouseMutationAllowed
                                ? t('Editor.UnsupportedClickHouseEngine')
                                : mutationDialect
                                  ? t('Editor.NoIdentity')
                                  : t('Editor.UnsupportedDriver')}
                        </TooltipContent>
                    </Tooltip>
                ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-2">
                <div className="flex items-center">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t('Editor.Undo')}
                                    disabled={editSession.past.length === 0}
                                    onClick={() => updateEditSession(undoTableEdit)}
                                >
                                    <Undo2 className="h-4 w-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t('Editor.Undo')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t('Editor.Redo')}
                                    disabled={editSession.future.length === 0}
                                    onClick={() => updateEditSession(redoTableEdit)}
                                >
                                    <Redo2 className="h-4 w-4" />
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t('Editor.Redo')}</TooltipContent>
                    </Tooltip>
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
                    variant={editorPanelOpen ? 'secondary' : 'outline'}
                    size="sm"
                    className={`gap-2 tabular-nums ${
                        editCounts.cellCount > 0
                            ? 'border-orange-500/40 text-orange-700 hover:border-orange-500/60 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200'
                            : ''
                    }`}
                    onClick={handleShowPendingChanges}
                >
                    <PanelRightOpen className="h-4 w-4" />
                    {t('Editor.Changes', { count: editCounts.cellCount })}
                    {editCounts.cellCount > 0 ? <span data-testid="pending-changes-indicator" className="size-2 rounded-full bg-orange-500" aria-hidden="true" /> : null}
                </Button>
            </div>
        </div>
    );

    const previewProgress = <div className="h-0.5 flex-none">{refreshing ? <DataPreviewLoadingBar ariaLabel={t('Loading Data')} /> : null}</div>;
    const sidePanels = tableName ? (
        <>
            <TableEditorPanel
                open={editorPanelOpen}
                width={editorPanelWidth}
                changesView={changesView}
                tableName={tableName}
                session={editSession}
                sqlPreview={updateSqlPreview}
                portalContainer={panelPortalContainer}
                position={inspectorPortalMode === 'viewport' ? 'fixed' : 'absolute'}
                onOpenChange={setEditorPanelOpen}
                onChangesViewChange={setChangesView}
                onWidthChange={setEditorPanelWidth}
                onRevertCell={(rowKey, column) => updateEditSession(session => revertTableCellEdit(session, rowKey, column))}
                onJumpToCell={handleJumpToCell}
                onClearAll={() => updateEditSession(clearTableEdits)}
                onCommitAll={() => setCommitDialogOpen(true)}
                isCommitting={commitMutation.isPending}
                atomicity={mutationProfile?.atomicity ?? 'atomic'}
            />
            <InspectorPanel
                open={inspectorOpen}
                setOpen={handleInspectorOpen}
                mode={inspectorMode}
                payload={resolvedInspectorPayload}
                portalContainer={panelPortalContainer}
                position={inspectorPortalMode === 'viewport' ? 'fixed' : 'absolute'}
                rowViewMode={rowViewMode}
                setRowViewMode={setRowViewMode}
                inspectorWidth={inspectorWidth}
                setInspectorWidth={setInspectorWidth}
                columnMetas={columns}
                getCellEditState={getCellEditState}
                onCellChange={handleCellChange}
                onRevertCell={handleRevertCellAt}
                pendingChangesCount={editCounts.cellCount}
                onShowPendingChanges={handleShowPendingChanges}
            />
        </>
    ) : null;
    const panelPortal =
        inspectorPortalMode === 'preview' ? (
            <div ref={setPanelPortalContainer} className="pointer-events-none absolute inset-0 z-30" data-testid="table-preview-panel-portal" />
        ) : null;
    const paginationBar = (
        <DataPreviewPaginationBar
            pageIndex={pageIndex}
            pageSize={pageSize}
            totalRowEstimate={totalRowEstimate}
            currentPageRowCount={rows.length}
            rowsLabel={rowsLabel}
            loading={refreshing}
            variant={paginationPortalContainer === undefined ? 'footer' : 'inline'}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
        />
    );
    const pagination = paginationPortalContainer === undefined ? paginationBar : paginationPortalContainer ? createPortal(paginationBar, paginationPortalContainer) : null;
    const commitDialog = (
        <>
            <AlertDialog open={commitDialogOpen} onOpenChange={setCommitDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('Editor.ConfirmCommitTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {mutationProfile?.atomicity === 'best-effort'
                                ? t('Editor.ConfirmBestEffortDescription', {
                                      fields: editCounts.cellCount,
                                      rows: editCounts.rowCount,
                                  })
                                : t('Editor.ConfirmCommitDescription', {
                                      fields: editCounts.cellCount,
                                      updates: editCounts.rowCount,
                                      rows: editCounts.rowCount,
                                  })}
                        </AlertDialogDescription>
                        {mutationProfile?.atomicity === 'best-effort' ? (
                            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                                {t('Editor.BestEffortWarning')}
                            </div>
                        ) : null}
                    </AlertDialogHeader>
                    <div data-testid="commit-sql-preview" className="max-h-72 overflow-auto">
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
            <AlertDialog open={pendingIdentitySelection !== null} onOpenChange={open => !open && setPendingIdentitySelection(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('Editor.ChangeIdentityTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('Editor.ChangeIdentityDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('Editor.Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const nextIdentity = pendingIdentitySelection;
                                if (!nextIdentity) return;
                                updateEditSession(clearTableEdits);
                                applyIdentitySelection(nextIdentity);
                                setPendingIdentitySelection(null);
                            }}
                        >
                            {t('Editor.DiscardAndChangeIdentity')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );

    if (!connectionId || !databaseName || !tableName) {
        return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{emptyMessage ?? t('No table preview')}</div>;
    }

    if (error) {
        return (
            <div className="relative flex h-full min-h-0 flex-col">
                {panelPortal}
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
                </div>
                {sidePanels}
                {commitDialog}
            </div>
        );
    }

    if (loading && rows.length === 0) {
        return (
            <div className="relative h-full min-h-0 flex flex-col">
                {panelPortal}
                {previewControls}
                {previewProgress}
                <div className="flex min-h-0 flex-1">
                    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">{hasUserRequestedPreviewUpdate ? null : t('Loading Data')}</div>
                </div>
                {sidePanels}
                {commitDialog}
            </div>
        );
    }

    if (rows.length === 0 && !loading) {
        return (
            <div className="relative h-full min-h-0 flex flex-col">
                {panelPortal}
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
                </div>
                {pagination}
                {sidePanels}
                {commitDialog}
            </div>
        );
    }

    return (
        <div className="relative h-full min-h-0 flex flex-col">
            {panelPortal}
            {previewControls}
            {previewProgress}

            <div className="min-h-0 flex-1">
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
                    setInspectorMode={mode => {
                        setInspectorMode(mode);
                        if (mode !== 'row') setActiveInspectorRow(null);
                    }}
                    setInspectorPayload={setInspectorPayload}
                    editable={tableIsEditable}
                    editDisabledReason={mutationAvailable && identityColumns.length === 0 ? t('Editor.NoIdentity') : undefined}
                    getCellEditState={getCellEditState}
                    isRowChanged={isRowChanged}
                    onCellChange={handleCellChange}
                    onCellsChange={handleCellsChange}
                    onRevertCell={handleRevertCellAt}
                    onCellsRevert={handleCellsRevert}
                    onUndo={() => updateEditSession(undoTableEdit)}
                    onRedo={() => updateEditSession(redoTableEdit)}
                    onCommitAll={() => {
                        if (editCounts.cellCount > 0) setCommitDialogOpen(true);
                    }}
                    onSelectionChange={setSelectionSummary}
                    focusRequest={focusRequest}
                    activeRowIndex={activeInspectorRowIndex}
                    onActiveRowChange={handleActiveRowChange}
                />
            </div>

            {pagination}
            {sidePanels}
            {commitDialog}
        </div>
    );
}

export default function TableDataPreview({ activeTab, connectionId, databaseName, tableName, inspectorPortalMode, paginationPortalContainer, driver }: TableDataPreviewProps) {
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
            paginationPortalContainer={paginationPortalContainer}
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
