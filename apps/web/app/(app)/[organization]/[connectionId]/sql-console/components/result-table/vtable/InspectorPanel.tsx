'use client';

import { cn } from '@dory/web-utils';
import { useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CopyButton } from '@/components/@dory/ui/copy-button';
import { useTranslations } from 'next-intl';
import { SQL_CONSOLE_OVERLAY_ID } from '../../sql-console-overlay';

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
}: InspectorPanelProps) {
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
    const [filter, setFilter] = useState('');
    const [defaultPortalContainer, setDefaultPortalContainer] = useState<HTMLElement | null>(null);
    const t = useTranslations('SqlConsole');

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
    const resolvedPortalContainer = portalContainer === undefined ? defaultPortalContainer : portalContainer;

    if (!open || !resolvedPortalContainer) return null;

    return createPortal(
        <aside
            data-testid="cell-inspector-panel"
            className={cn(
                'pointer-events-auto inset-y-0 right-0 z-30 flex flex-col border-l bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/60',
                position === 'fixed' ? 'fixed' : 'absolute',
            )}
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

                                <div className="grid grid-cols-1 gap-2">
                                    {Object.entries(rowPayload.rowData)
                                        .filter(([k, v]) => {
                                            if (!filter) return true;
                                            const s = `${k} ${pretty(v)}`.toLowerCase();
                                            return s.includes(filter.toLowerCase());
                                        })
                                        .map(([k, v]) => (
                                            <div key={k} className="border rounded p-2">
                                                <div className="text-xs font-medium text-muted-foreground">{k}</div>
                                                <div className="text-sm break-words whitespace-pre-wrap">{pretty(v)}</div>
                                            </div>
                                        ))}
                                </div>
                            </>
                        ) : (
                            <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(rowPayload.rowData, null, 2)}</pre>
                        )}
                    </div>
                )}
            </div>
        </aside>,
        resolvedPortalContainer,
    );
}
