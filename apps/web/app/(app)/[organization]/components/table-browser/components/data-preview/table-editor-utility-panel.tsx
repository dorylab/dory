'use client';

import { cn } from '@dory/web-utils';
import { ChevronRight, CornerDownLeft, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

import type { ColumnInfo } from '../../type';
import { getRowKey, type PendingRowChange, type TableEditSession } from './table-editor-store';

export type TableEditorInspectorPayload =
    | {
          row: number;
          col: string;
          value: unknown;
          rowData?: Record<string, unknown>;
      }
    | {
          row: number;
          rowData: Record<string, unknown>;
      }
    | null;

function displayValue(value: unknown) {
    if (value === null) return 'NULL';
    if (value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

function keyLabel(row: PendingRowChange) {
    return Object.entries(row.key)
        .map(([column, value]) => `${column}=${displayValue(value)}`)
        .join(', ');
}

export function TableEditorUtilityPanel({
    open,
    width,
    mode,
    changesView,
    tableName,
    columns,
    primaryKeyColumns,
    session,
    sqlPreview,
    inspector,
    onOpenChange,
    onModeChange,
    onChangesViewChange,
    onWidthChange,
    onRevertCell,
    onRevertRow,
    onJumpToCell,
    onClearAll,
    onCommitAll,
    isCommitting,
}: {
    open: boolean;
    width: number;
    mode: 'changes' | 'inspector';
    changesView: 'visual' | 'sql';
    tableName: string;
    columns: ColumnInfo[];
    primaryKeyColumns: string[];
    session: TableEditSession;
    sqlPreview: string;
    inspector: TableEditorInspectorPayload;
    onOpenChange: (open: boolean) => void;
    onModeChange: (mode: 'changes' | 'inspector') => void;
    onChangesViewChange: (mode: 'visual' | 'sql') => void;
    onWidthChange: (width: number) => void;
    onRevertCell: (rowKey: string, column: string) => void;
    onRevertRow: (rowKey: string) => void;
    onJumpToCell: (row: PendingRowChange, column: string) => void;
    onClearAll: () => void;
    onCommitAll: () => void;
    isCommitting: boolean;
}) {
    const t = useTranslations('TableBrowser.Editor');
    const pendingRows = Object.values(session.rows);
    const pendingCellCount = pendingRows.reduce((total, row) => total + Object.keys(row.changes).length, 0);
    const inspectorColumn = inspector && 'col' in inspector ? columns.find(column => column.name === inspector.col) : null;
    const inspectorRow = inspector && 'rowData' in inspector ? inspector.rowData : null;
    const inspectorKey = inspectorRow ? primaryKeyColumns.map(column => `${column}=${displayValue(inspectorRow[column])}`).join(', ') : null;
    const inspectorRowKey = inspectorRow ? getRowKey(inspectorRow, primaryKeyColumns)?.rowKey : null;
    const inspectorChange = inspector && 'col' in inspector && inspectorRowKey ? session.rows[inspectorRowKey]?.changes[inspector.col] : null;

    if (!open) return null;

    const startResize = (event: React.MouseEvent) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        const onMove = (moveEvent: MouseEvent) => {
            onWidthChange(Math.max(300, Math.min(720, startWidth + startX - moveEvent.clientX)));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
        };
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    return (
        <aside className="relative flex h-full min-h-0 shrink-0 flex-col border-l bg-background" style={{ width }}>
            <div role="separator" aria-orientation="vertical" className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize" onMouseDown={startResize} />
            <div className="flex h-12 shrink-0 items-center border-b px-3">
                <Tabs value={mode} onValueChange={value => onModeChange(value as 'changes' | 'inspector')} className="min-w-0 flex-1">
                    <TabsList className="h-8">
                        <TabsTrigger value="changes" className="h-7 px-3">
                            {t('PendingChanges')}
                            {pendingCellCount > 0 ? <span className="ml-1 tabular-nums text-muted-foreground">{pendingCellCount}</span> : null}
                        </TabsTrigger>
                        <TabsTrigger value="inspector" className="h-7 px-3">
                            {t('CellInspector')}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <Button variant="ghost" size="icon-sm" aria-label={t('ClosePanel')} onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {mode === 'changes' ? (
                <Tabs value={changesView} onValueChange={value => onChangesViewChange(value as 'visual' | 'sql')} className="flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 border-b px-3 py-2">
                        <TabsList className="h-8">
                            <TabsTrigger value="visual" className="h-7 px-3">
                                {t('Visual')}
                            </TabsTrigger>
                            <TabsTrigger value="sql" className="h-7 px-3">
                                SQL
                            </TabsTrigger>
                        </TabsList>
                    </div>
                    <TabsContent value="visual" className="mt-0 min-h-0 flex-1 overflow-auto">
                        {pendingRows.length === 0 ? (
                            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{t('NoPendingChanges')}</div>
                        ) : (
                            <div className="divide-y">
                                {pendingRows.map(row => (
                                    <section key={row.rowKey} className="px-4 py-4">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tableName}</div>
                                                <div className="mt-1 truncate font-mono text-xs text-foreground" title={keyLabel(row)}>
                                                    {keyLabel(row)}
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon-sm" aria-label={t('RevertRow')} onClick={() => onRevertRow(row.rowKey)}>
                                                <RotateCcw className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                        <div className="space-y-3">
                                            {Object.values(row.changes).map(change => (
                                                <div key={change.column} className="border-l-2 border-primary/50 pl-3">
                                                    <div className="mb-1.5 flex items-center justify-between gap-2">
                                                        <span className="truncate font-mono text-xs font-medium">{change.column}</span>
                                                        <div className="flex items-center">
                                                            <Button variant="ghost" size="icon-sm" aria-label={t('JumpToCell')} onClick={() => onJumpToCell(row, change.column)}>
                                                                <CornerDownLeft className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                aria-label={t('RevertCell')}
                                                                onClick={() => onRevertCell(row.rowKey, change.column)}
                                                            >
                                                                <RotateCcw className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1 font-mono text-xs">
                                                        <div className="rounded-sm bg-destructive/10 px-2 py-1.5 text-destructive line-through">
                                                            <span className="mr-2 select-none">−</span>
                                                            <span className="whitespace-pre-wrap break-all">{displayValue(change.originalValue)}</span>
                                                        </div>
                                                        <div className="rounded-sm bg-emerald-500/10 px-2 py-1.5 text-emerald-600 dark:text-emerald-400">
                                                            <span className="mr-2 select-none">+</span>
                                                            <span className="whitespace-pre-wrap break-all">{displayValue(change.nextValue)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="sql" className="mt-0 min-h-0 flex-1 overflow-auto p-4">
                        {sqlPreview ? (
                            <SmartCodeBlock value={sqlPreview} type="sql" maxHeightClassName="max-h-none" />
                        ) : (
                            <div className="text-sm text-muted-foreground">{t('NoPendingChanges')}</div>
                        )}
                    </TabsContent>
                </Tabs>
            ) : (
                <div className="min-h-0 flex-1 overflow-auto p-4">
                    {!inspector ? (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{t('SelectCellForInspector')}</div>
                    ) : (
                        <div className="space-y-5">
                            <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                                <dt className="text-muted-foreground">{t('Table')}</dt>
                                <dd className="truncate font-mono">{tableName}</dd>
                                <dt className="text-muted-foreground">{t('PrimaryKey')}</dt>
                                <dd className="break-all font-mono text-xs">{inspectorKey || '—'}</dd>
                                {'col' in inspector ? (
                                    <>
                                        <dt className="text-muted-foreground">{t('Column')}</dt>
                                        <dd className="truncate font-mono">{inspector.col}</dd>
                                        <dt className="text-muted-foreground">{t('Type')}</dt>
                                        <dd className="truncate font-mono">{inspectorColumn?.type || '—'}</dd>
                                        <dt className="text-muted-foreground">{t('Nullable')}</dt>
                                        <dd>{inspectorColumn?.nullable ? t('Yes') : t('No')}</dd>
                                    </>
                                ) : null}
                            </dl>
                            {'col' in inspector ? (
                                <div className="space-y-3">
                                    <div>
                                        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('OriginalValue')}</div>
                                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-sm border bg-muted/30 p-3 font-mono text-xs">
                                            {displayValue(inspectorChange ? inspectorChange.originalValue : inspector.value)}
                                        </pre>
                                    </div>
                                    <div>
                                        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('EditedValue')}</div>
                                        <pre
                                            className={cn(
                                                'max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-sm border p-3 font-mono text-xs',
                                                inspectorChange ? 'border-primary/40 bg-primary/5' : 'bg-muted/30',
                                            )}
                                        >
                                            {displayValue(inspectorChange ? inspectorChange.nextValue : inspector.value)}
                                        </pre>
                                    </div>
                                </div>
                            ) : (
                                <div className="divide-y rounded-sm border">
                                    {Object.entries(inspector.rowData).map(([column, value]) => (
                                        <div key={column} className="grid grid-cols-[minmax(100px,0.8fr)_minmax(0,1.2fr)] gap-3 px-3 py-2 text-xs">
                                            <span className="truncate font-mono text-muted-foreground">{column}</span>
                                            <span className="truncate font-mono">{displayValue(value)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {mode === 'changes' && pendingRows.length > 0 ? (
                <div className="shrink-0 border-t">
                    <div className="flex items-center px-4 pt-2 text-xs text-muted-foreground">
                        <ChevronRight className="mr-1 h-3.5 w-3.5" />
                        {t('AtomicCommitHint')}
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={onClearAll} disabled={isCommitting}>
                            {t('ClearAll')}
                        </Button>
                        <Button size="sm" onClick={onCommitAll} disabled={isCommitting}>
                            {isCommitting ? t('Committing') : t('CommitAll', { count: pendingCellCount })}
                        </Button>
                    </div>
                </div>
            ) : null}
        </aside>
    );
}
