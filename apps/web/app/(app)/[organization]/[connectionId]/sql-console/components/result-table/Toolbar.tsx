'use client';
import React from 'react';
import { SqlResultTabs } from '@/components/sql-workspace/sql-result-view';
import { useTranslations } from 'next-intl';

export type ExecMeta = {
    runningRemote: boolean;
    runningLocal: boolean;
    executionMs?: number;
    rowsReturned?: number;
    rowsAffected?: number;
    byteSize?: number;
    sqlText?: string;
    limitApplied?: boolean;
    limitValue?: number;
    truncated?: boolean;
    startedAt?: number;
    finishedAt?: number;
    errorMessage?: string;
    source?: string;
};

export function Toolbar(props: {
    className?: string;
    indices: number[];
    titles?: Record<number, string | null | undefined>;
    /** -1=Overview，>=0=Result i */
    activeSet: number;
    onSetActiveSet: (n: number) => void;
}) {
    const { className, indices, activeSet, onSetActiveSet, titles } = props;
    const t = useTranslations('SqlConsole');

    return (
        <div className={className}>
            <SqlResultTabs
                value={String(activeSet)}
                onChange={value => onSetActiveSet(Number(value))}
                items={[
                    { id: '-1', label: t('Results.Overview') },
                    ...indices.map(index => ({
                        id: String(index),
                        label: titles?.[index] || t('Results.ResultTab', { index: index + 1 }),
                        ariaLabel: `${t('Results.ResultTab', { index: index + 1 })}${titles?.[index] ? `: ${titles[index]}` : ''}`,
                    })),
                ]}
            />
        </div>
    );
}
