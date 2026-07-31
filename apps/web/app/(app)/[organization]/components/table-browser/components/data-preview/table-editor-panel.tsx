'use client';

import { ChevronRight, CornerDownLeft, PencilLine, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';

import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';

import type { PendingRowChange, TableEditSession } from './table-editor-store';

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

export function TableEditorPanel({
    open,
    width,
    changesView,
    tableName,
    session,
    sqlPreview,
    portalContainer,
    position = 'absolute',
    onOpenChange,
    onChangesViewChange,
    onWidthChange,
    onRevertCell,
    onJumpToCell,
    onClearAll,
    onCommitAll,
    isCommitting,
}: {
    open: boolean;
    width: number;
    changesView: 'visual' | 'sql';
    tableName: string;
    session: TableEditSession;
    sqlPreview: string;
    portalContainer: HTMLElement | null;
    position?: 'absolute' | 'fixed';
    onOpenChange: (open: boolean) => void;
    onChangesViewChange: (mode: 'visual' | 'sql') => void;
    onWidthChange: (width: number) => void;
    onRevertCell: (rowKey: string, column: string) => void;
    onJumpToCell: (row: PendingRowChange, column: string) => void;
    onClearAll: () => void;
    onCommitAll: () => void;
    isCommitting: boolean;
}) {
    const t = useTranslations('TableBrowser.Editor');
    const pendingRows = Object.values(session.rows);
    const pendingCards = pendingRows.flatMap(row => Object.values(row.changes).map(change => ({ row, change })));
    const pendingCellCount = pendingCards.length;

    if (!open || !portalContainer) return null;

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

    return createPortal(
        <aside
            data-testid="table-editor-panel"
            className={`pointer-events-auto inset-y-0 right-0 z-30 flex min-h-0 flex-col border-l bg-card shadow-lg ${position === 'fixed' ? 'fixed' : 'absolute'}`}
            style={{ width }}
        >
            <div role="separator" aria-orientation="vertical" className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize" onMouseDown={startResize} />
            <div className="flex h-12 shrink-0 items-center border-b px-3">
                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                    {t('PendingChanges')}
                    {pendingCellCount > 0 ? <span className="ml-1 tabular-nums text-muted-foreground">{pendingCellCount}</span> : null}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={t('CloseEditorPanel')} onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

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
                    {pendingCards.length === 0 ? (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{t('NoPendingChanges')}</div>
                    ) : (
                        <div className="space-y-3 p-3">
                            {pendingCards.map(({ row, change }) => (
                                <section
                                    key={`${row.rowKey}:${change.column}`}
                                    data-testid="pending-change-card"
                                    data-column={change.column}
                                    className="rounded-lg border bg-background p-3 shadow-sm"
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            data-testid="pending-change-card-indicator"
                                            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                                        >
                                            <PencilLine className="size-3.5" aria-hidden="true" />
                                        </div>
                                        <div className="flex min-w-0 flex-1 items-center gap-1 text-xs" title={`${tableName} · ${keyLabel(row)} · ${change.column}`}>
                                            <span className="shrink-0 text-foreground">{tableName}</span>
                                            <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                            <span className="min-w-0 truncate font-mono text-muted-foreground">{keyLabel(row)}</span>
                                            <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                            <span className="shrink-0 font-mono font-medium text-foreground">{change.column}</span>
                                        </div>
                                        <div className="flex shrink-0 items-center">
                                            <Button variant="ghost" size="icon-sm" aria-label={t('JumpToCell')} onClick={() => onJumpToCell(row, change.column)}>
                                                <CornerDownLeft className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon-sm" aria-label={t('RevertCell')} onClick={() => onRevertCell(row.rowKey, change.column)}>
                                                <RotateCcw className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="mt-3 space-y-1 font-mono text-xs">
                                        <div className="rounded-sm bg-destructive/10 px-2 py-1.5 text-destructive line-through">
                                            <span className="mr-2 select-none">−</span>
                                            <span className="whitespace-pre-wrap break-all">{displayValue(change.originalValue)}</span>
                                        </div>
                                        <div className="rounded-sm bg-emerald-500/10 px-2 py-1.5 text-emerald-600 dark:text-emerald-400">
                                            <span className="mr-2 select-none">+</span>
                                            <span className="whitespace-pre-wrap break-all">{displayValue(change.nextValue)}</span>
                                        </div>
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
            {pendingRows.length > 0 ? (
                <div className="shrink-0 border-t">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={onClearAll} disabled={isCommitting}>
                            {t('ClearAll')}
                        </Button>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="sm" onClick={onCommitAll} disabled={isCommitting}>
                                    {isCommitting ? t('Committing') : t('CommitAll', { count: pendingCellCount })}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t('AtomicCommitHint')}</TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            ) : null}
        </aside>,
        portalContainer,
    );
}
