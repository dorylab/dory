export interface VTableProps {
    results: { rowData: Record<string, any> }[];
    rowHeight?: number;
    maxHeight?: number;
    defaultColMinWidth?: number;
    indexColWidth?: number;
    storageKey?: string;
    colMinWidthMap?: Record<string, number>;
    colMaxWidthMap?: Record<string, number>;
    onStatsChange: (stats: { filteredCount: number; }) => void;
    inspectorTopOffset?: number;
    showSearchBar?: boolean;
    setInspectorOpen?: (open: boolean) => void;
    setInspectorMode?: (mode: 'cell' | 'row' | null) => void;
    setInspectorPayload?: (payload: any) => void;
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
    kind: 'string' | 'number';
    op: StrOp | NumOp;
    value?: string; 
    caseSensitive?: boolean;
}
