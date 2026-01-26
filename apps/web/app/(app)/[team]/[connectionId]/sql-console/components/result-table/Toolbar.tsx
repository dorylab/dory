'use client';
import React from 'react';
import { Download, Trash2, Settings as SettingsIcon, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { useTranslations } from 'next-intl';

export type ExecMeta = {
    runningRemote: boolean;
    runningLocal: boolean;
    executionMs?: number;
    rowsReturned?: number;
    rowsAffected?: number;
    shownRows?: number;
    sqlText?: string;
    limitApplied?: boolean;
    limitValue?: number;
    truncated?: boolean;
    startedAt?: number;
    finishedAt?: number;
    errorMessage?: string;
};

export function Toolbar(props: {
    className?: string;
    indices: number[];
    /** -1=Overview，>=0=Result i */
    activeSet: number;
    onSetActiveSet: (n: number) => void;
    rowCount: number;
    execMetaBySet: Record<number, ExecMeta | undefined>;
    onDownloadCsv: () => void;
    onOpenSettings: () => void;
}) {
    const { className, indices, activeSet, onSetActiveSet, rowCount, execMetaBySet, onDownloadCsv, onOpenSettings } = props;
    const isResult = activeSet >= 0;
    const t = useTranslations('SqlConsole');

    return (
        <div className={cn('flex flex-col', className)}>
            
            <div className="flex items-center justify-between w-full border bg-muted">
                
                <Tabs value={String(activeSet)} onValueChange={v => onSetActiveSet(Number(v))} className="overflow-hidden">
                    <TabsList>
                        <TabsTrigger value="-1" className="px-2">
                            {t('Results.Overview')}
                        </TabsTrigger>
                        {indices.map(i => (
                            <TabsTrigger key={i} value={String(i)} className="px-2">
                                {t('Results.ResultTab', { index: i + 1 })}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                
                <div className="flex items-center gap-2 mr-2">
                    {isResult && (
                        <Button variant="outline" size="sm" onClick={onDownloadCsv} disabled={rowCount <= 0} title={t('Results.DownloadCsvTitle')}>
                            <Download />
                            <span className="hidden lg:inline">CSV</span>
                        </Button>
                    )}
                    {/* <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={onOpenSettings} title="Settings">
                        <SettingsIcon className="h-4 w-4" />
                        Settings
                    </Button> */}
                </div>
            </div>
        </div>
    );
}
