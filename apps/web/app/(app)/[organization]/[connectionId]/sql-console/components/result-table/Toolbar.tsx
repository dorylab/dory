'use client';
import React from 'react';
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
}) {
    const { className, indices, activeSet, onSetActiveSet } = props;
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
            </div>
        </div>
    );
}
