'use client';

import { useState, useRef } from 'react';
import { CopyButton } from '@/components/@dory/ui/copy-button';
import { useTranslations } from 'next-intl';

interface InspectorPanelProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    mode: 'cell' | 'row' | null;
    payload: any;
    rowViewMode: 'table' | 'json';
    setRowViewMode: (m: 'table' | 'json') => void;
    inspectorWidth: number;
    setInspectorWidth: (w: number) => void;
    inspectorTopOffset?: number;
}

export function InspectorPanel({ open, setOpen, mode, payload, rowViewMode, setRowViewMode, inspectorWidth, setInspectorWidth, inspectorTopOffset = 0 }: InspectorPanelProps) {
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
    const [filter, setFilter] = useState('');
    const t = useTranslations('SqlConsole');

    
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

    
    const pretty = (v: any) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v));

    if (!open) return null;

    return (
        <aside
            className="fixed z-20 -top-4 right-12 h-full border-l bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-lg flex flex-col"
            style={{ width: inspectorWidth, top: inspectorTopOffset, height: `calc(100% - ${inspectorTopOffset}px)` }}
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
                    
                    {mode === 'cell' && payload && <CopyButton size="sm" className="text-xs px-2 py-1 h-auto" text={pretty(payload.value)} />}
                    {mode === 'row' && payload && rowViewMode === 'json' && (
                        <CopyButton
                            size="sm"
                            className="text-xs px-2 py-1 h-auto"
                            text={JSON.stringify(payload.rowData, null, 2)}
                            label={t('VTable.Inspector.CopyJson')}
                            copiedLabel={t('VTable.Inspector.CopiedJson')}
                        />
                    )}
                    {mode === 'row' && payload && rowViewMode === 'table' && (
                        <CopyButton
                            text={Object.values(payload.rowData)
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
                {mode === 'cell' && payload && (
                    <>
                        <div className="mb-2 text-xs text-muted-foreground">
                            {t('VTable.Inspector.RowWithColumn', { row: payload.row + 1, column: payload.col })}
                        </div>
                        <pre className="whitespace-pre-wrap break-words">{pretty(payload.value)}</pre>
                    </>
                )}

                {mode === 'row' && payload && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-muted-foreground">{t('VTable.Inspector.RowOnly', { row: payload.row + 1 })}</div>
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
                                    {Object.entries(payload.rowData as Record<string, any>)
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
                            <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(payload.rowData, null, 2)}</pre>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}
