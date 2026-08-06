export type VTableInspectorPayload =
    | {
          row: number;
          col: string;
          value: unknown;
      }
    | {
          row: number;
          rowData: Record<string, unknown>;
      }
    | null;

export type VTableCellChange = {
    rowIndex: number;
    column: string;
    originalValue: unknown;
    nextValue: unknown;
};

export type VTableCellTarget = {
    rowIndex: number;
    column: string;
};

export type VTableBatchEditResult = { ok: true; changedCellCount: number; affectedRowCount: number } | { ok: false; error: string };

export interface VTableProps {
    results: { rowData: Record<string, unknown> }[];
    columnMetas: Array<{
        name?: unknown;
        type?: unknown;
        nullable?: unknown;
        isPrimaryKey?: unknown;
    }>;
    remoteSource?: VTableRemoteSource | null;
    rowHeight?: number;
    maxHeight?: number;
    defaultColMinWidth?: number;
    indexColWidth?: number;
    storageKey?: string;
    colMinWidthMap?: Record<string, number>;
    colMaxWidthMap?: Record<string, number>;
    onStatsChange: (stats: { filteredCount: number }) => void;
    showSearchBar?: boolean;
    setInspectorOpen?: (open: boolean) => void;
    setInspectorMode?: (mode: 'cell' | 'row' | null) => void;
    setInspectorPayload?: (payload: VTableInspectorPayload) => void;
    activeFilters?: ColumnFilter[];
    onUpsertFilter?: (filter: ColumnFilter) => void;
    onRemoveFilter?: (col: string) => void;
    onClearAllFilters?: () => void;
    serverSideOperations?: boolean;
    showFiltersBar?: boolean;
    initialSort?: { column: string; direction: 'asc' | 'desc' } | null;
    selectedRowIndexes?: number[];
    isActive?: boolean;
    onSortChange?: (sort: { column: string; direction: 'asc' | 'desc' } | null) => void;
    onSelectedRowIndexesChange?: (rowIndexes: number[]) => void;
    editable?: boolean;
    editDisabledReason?: string;
    getCellEditState?: (
        rowIndex: number,
        column: string,
    ) => {
        editable: boolean;
        changed?: boolean;
        nullable?: boolean;
        readOnlyReason?: string;
    };
    isRowChanged?: (rowIndex: number) => boolean;
    onCellChange?: (input: VTableCellChange) => void;
    onCellsChange?: (inputs: VTableCellChange[]) => VTableBatchEditResult;
    onRevertCell?: (rowIndex: number, column: string) => void;
    onCellsRevert?: (targets: VTableCellTarget[]) => VTableBatchEditResult;
    onUndo?: () => void;
    onRedo?: () => void;
    onCommitAll?: () => void;
    onSelectionChange?: (selection: { cellCount: number; rowCount: number }) => void;
    focusRequest?: {
        rowIndex: number;
        column: string;
        requestId: number;
    } | null;
    activeRowIndex?: number | null;
    onActiveRowChange?: (rowIndex: number) => void;
}

export interface VTableRemoteSource {
    cacheKey: string;
    sourceId?: string;
    rowCount: number;
    pageSize?: number;
    initialRows?: { rowData: Record<string, unknown> }[];
    getRows: (
        offset: number,
        limit: number,
        signal?: AbortSignal,
    ) => Promise<{
        rows: { rowData: Record<string, unknown> }[];
        ready: boolean;
    }>;
}

export type ColWidths = Record<string, number>;
export type CellKey = string;
export const ck = (row: number, col: string): CellKey => `${row}@@${col}`;
export const parseCK = (k: CellKey) => {
    const [r, c] = k.split('@@');
    return { row: Number(r), col: c };
};

export type StrOp = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty' | 'regex';
export type NumOp = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le';
export interface ColumnFilter {
    col: string;
    kind: 'string' | 'number' | 'range';
    op: StrOp | NumOp | 'range';
    value?: string;
    valueTo?: string;
    rangeValueType?: 'number' | 'date';
    label?: string;
    caseSensitive?: boolean;
}
