'use client';

import { cn } from '@dory/web-utils';
import { PanelRightOpen } from 'lucide-react';
import { useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CopyButton } from '@/components/@dory/ui/copy-button';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useTranslations } from 'next-intl';
import { SQL_CONSOLE_OVERLAY_ID } from '../../sql-console-overlay';
import { InspectorFieldEditor, type InspectorCellEditState, type InspectorColumnMeta } from './InspectorFieldEditor';

type InspectorPayload =
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

interface InspectorPanelProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    mode: 'cell' | 'row' | null;
    payload: InspectorPayload;
    portalContainer?: HTMLElement | null;
    position?: 'absolute' | 'fixed';
    rowViewMode: 'table' | 'json';
    setRowViewMode: (m: 'table' | 'json') => void;
    inspectorWidth: number;
    setInspectorWidth: (w: number) => void;
    columnMetas?: InspectorColumnMeta[];
    getCellEditState?: (rowIndex: number, column: string) => InspectorCellEditState;
    onCellChange?: (input: { rowIndex: number; column: string; originalValue: unknown; nextValue: unknown }) => void;
    onRevertCell?: (rowIndex: number, column: string) => void;
    pendingChangesCount?: number;
    onShowPendingChanges?: () => void;
}

export function InspectorPanel({
    open,
    setOpen,
    mode,
    payload,
    portalContainer,
    position = 'absolute',
    rowViewMode,
    setRowViewMode,
    inspectorWidth,
    setInspectorWidth,
    columnMetas,
    getCellEditState,
    onCellChange,
    onRevertCell,
    pendingChangesCount,
    onShowPendingChanges,
}: InspectorPanelProps) {
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
    const [filter, setFilter] = useState('');
    const [defaultPortalContainer, setDefaultPortalContainer] = useState<HTMLElement | null>(null);
    const t = useTranslations('SqlConsole');
    const editorT = useTranslations('TableBrowser.Editor');

    useLayoutEffect(() => {
        if (!open || portalContainer !== undefined) return;
        setDefaultPortalContainer(document.getElementById(SQL_CONSOLE_OVERLAY_ID));
    }, [open, portalContainer]);

    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        resizeRef.current = { startX: e.clientX, startW: inspectorWidth };
        const onMove = (ev: MouseEvent) => {
            if (!resizeRef.current) return;
            const delta = resizeRef.current.startX - ev.clientX;
            const next = Math.min(Math.max(resizeRef.current.startW + delta, 280), 720);
            setInspectorWidth(next);
        };
        const onUp = () => {
            resizeRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const pretty = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v));
    const cellPayload = mode === 'cell' && payload && 'value' in payload ? payload : null;
    const rowPayload = mode === 'row' && payload && 'rowData' in payload ? payload : null;
    const rowEditorAvailable = Boolean(rowPayload && columnMetas?.length && getCellEditState && onCellChange && onRevertCell);
    const rowColumns: InspectorColumnMeta[] = columnMetas?.length ? columnMetas : Object.keys(rowPayload?.rowData ?? {}).map(name => ({ name }));
    const normalizedFilter = filter.trim().toLowerCase();
    const filteredRowColumns = rowPayload
        ? rowColumns.filter(column => {
              if (!normalizedFilter) return true;
              const value = rowPayload.rowData[column.name];
              return `${column.name} ${column.type ?? ''} ${pretty(value)}`.toLowerCase().includes(normalizedFilter);
          })
        : [];
    const resolvedPortalContainer = portalContainer === undefined ? defaultPortalContainer : portalContainer;

    if (!open || !resolvedPortalContainer) return null;

    return createPortal(
        <aside
            data-testid="cell-inspector-panel"
            className={cn('pointer-events-auto inset-y-0 right-0 z-30 flex flex-col border-l bg-card shadow-lg', position === 'fixed' ? 'fixed' : 'absolute')}
            style={{ width: inspectorWidth }}
        >
            {/* drag handle */}
            <div className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize" onMouseDown={startResize} title={t('VTable.Inspector.ResizeTitle')} />

            {/* Header */}
            <header className="px-3 py-2 border-b flex items-center justify-between shrink-0">
                <div className="text-sm font-medium">
                    {mode === 'cell' && t('VTable.Inspector.TitleCell')}
                    {mode === 'row' && t('VTable.Inspector.TitleRow')}
                </div>
                <div className="flex items-center gap-2">
                    {cellPayload && <CopyButton size="sm" className="text-xs px-2 py-1 h-auto" text={pretty(cellPayload.value)} />}
                    {rowPayload && rowViewMode === 'json' && (
                        <CopyButton
                            size="sm"
                            className="text-xs px-2 py-1 h-auto"
                            text={JSON.stringify(rowPayload.rowData, null, 2)}
                            label={t('VTable.Inspector.CopyJson')}
                            copiedLabel={t('VTable.Inspector.CopiedJson')}
                        />
                    )}
                    {rowPayload && rowViewMode === 'table' && (
                        <CopyButton
                            text={Object.values(rowPayload.rowData)
                                .map(v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)))
                                .join('\t')}
                            label={t('VTable.Inspector.CopyRow')}
                            size="sm"
                            className="text-xs px-2 py-1 h-auto"
                            copiedLabel={t('VTable.Inspector.CopiedRow')}
                        />
                    )}
                    <button className="text-xs px-2 py-1 h-auto rounded border hover:bg-accent" onClick={() => setOpen(false)} title={t('VTable.Inspector.Close')}>
                        {t('VTable.Inspector.Close')}
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-auto p-3 text-sm leading-6">
                {cellPayload && (
                    <>
                        <div className="mb-2 text-xs text-muted-foreground">{t('VTable.Inspector.RowWithColumn', { row: cellPayload.row + 1, column: cellPayload.col })}</div>
                        <pre className="whitespace-pre-wrap break-words">{pretty(cellPayload.value)}</pre>
                    </>
                )}

                {rowPayload && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-muted-foreground">{t('VTable.Inspector.RowOnly', { row: rowPayload.row + 1 })}</div>
                            <button className="text-xs px-2 py-1 rounded border hover:bg-accent" onClick={() => setRowViewMode(rowViewMode === 'table' ? 'json' : 'table')}>
                                {rowViewMode === 'table' ? t('VTable.Inspector.ViewJson') : t('VTable.Inspector.ViewTable')}
                            </button>
                        </div>

                        {rowViewMode === 'table' ? (
                            <>
                                <input
                                    type="text"
                                    placeholder={t('VTable.Inspector.FilterPlaceholder')}
                                    className="w-full mb-2 px-2 py-1 border rounded text-sm"
                                    value={filter}
                                    onChange={e => setFilter(e.target.value)}
                                />

                                {rowEditorAvailable ? (
                                    <div className="grid grid-cols-1 gap-2">
                                        {filteredRowColumns.map(column => {
                                            const value = rowPayload.rowData[column.name];
                                            const editState = getCellEditState!(rowPayload.row, column.name);
                                            return (
                                                <InspectorFieldEditor
                                                    key={column.name}
                                                    rowIndex={rowPayload.row}
                                                    column={column}
                                                    value={value}
                                                    state={editState}
                                                    onChange={nextValue =>
                                                        onCellChange!({
                                                            rowIndex: rowPayload.row,
                                                            column: column.name,
                                                            originalValue: value,
                                                            nextValue,
                                                        })
                                                    }
                                                    onRevert={() => onRevertCell!(rowPayload.row, column.name)}
                                                />
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2">
                                        {filteredRowColumns.map(column => {
                                            const value = rowPayload.rowData[column.name];
                                            return (
                                                <div key={column.name} className="border rounded p-2">
                                                    <div className="text-xs font-medium text-muted-foreground">{column.name}</div>
                                                    <div className="text-sm break-words whitespace-pre-wrap">{pretty(value)}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(rowPayload.rowData, null, 2)}</pre>
                        )}
                    </div>
                )}
            </div>

            {pendingChangesCount !== undefined && onShowPendingChanges ? (
                <div className="shrink-0 border-t p-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                            'w-full justify-start gap-2 tabular-nums',
                            pendingChangesCount > 0 &&
                                'border-orange-500/40 text-orange-700 hover:border-orange-500/60 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200',
                        )}
                        data-testid="inspector-review-changes"
                        onClick={onShowPendingChanges}
                    >
                        <PanelRightOpen className="size-4" aria-hidden="true" />
                        <span className="flex-1 text-left">{editorT('ReviewChanges', { count: pendingChangesCount })}</span>
                        {pendingChangesCount > 0 ? <span className="size-2 rounded-full bg-orange-500" aria-hidden="true" /> : null}
                    </Button>
                </div>
            ) : null}
        </aside>,
        resolvedPortalContainer,
    );
}
