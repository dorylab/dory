'use client';

import React from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Timer, Database, HardDrive, RefreshCw, ShieldAlert, Clipboard } from 'lucide-react';
import { formatDuration } from 'date-fns';
import { formatTime, formatNumber, formatBytes } from '../utils/format';
import { useLocale, useTranslations } from 'next-intl';

const MAX_ROWS_HINT = 5_000_000;

export interface DebugPayload {
    tabId: string | null;
    sessionId?: string;
    activeSet: number;
    rowCount: number;
    sessionStatus: 'running' | 'success' | 'error' | 'canceled' | null;
    storageKey: string;
    meta: {
        truncated?: boolean;
        durationMs?: number;
        startedAt?: Date | string | number;
        finishedAt?: Date | string | number;
        fromCache?: boolean;
        scannedRows?: number;
        scannedBytes?: number;
        source?: string;
        syncing?: boolean;
        uiRowBudget: number;
    };
}

export function DebugPanel({ visible, isLoading, payload }: { visible: boolean; isLoading: boolean; payload: DebugPayload }) {
    if (!visible) return null;
    const t = useTranslations('SqlConsole');
    const locale = useLocale();

    const {
        sessionId,
        activeSet,
        rowCount,
        sessionStatus,
        storageKey,
        meta: { truncated, durationMs, startedAt, finishedAt, fromCache, scannedRows, scannedBytes, source, syncing, uiRowBudget },
    } = payload;

    const copyDebugMeta = async () => {
        try {
            await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
        } catch {
            // ignore
        }
    };

    return (
        <div className="border-t px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" />
                {t('Debug.Duration')}: <b className="text-foreground">
                    {isLoading || durationMs === undefined
                        ? t('Common.NotAvailable')
                        : formatDuration(
                            // Convert ms to Duration object
                            require('date-fns').intervalToDuration({ start: 0, end: durationMs })
                        )
                    }
                </b>
            </span>
            <span>
                {t('Debug.Started')}: <b className="text-foreground">{formatTime(startedAt) || t('Common.NotAvailable')}</b>
            </span>
            <span>
                {t('Debug.Finished')}: <b className="text-foreground">{formatTime(finishedAt) || t('Common.NotAvailable')}</b>
            </span>
            <span className="inline-flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                {t('Debug.Cache')}: <b className="text-foreground">{fromCache == null ? t('Common.NotAvailable') : fromCache ? t('Debug.CacheHit') : t('Debug.CacheMiss')}</b>
            </span>
            <span className="inline-flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5" />
                {t('Debug.Source')}: <b className="text-foreground">{source ?? t('Common.NotAvailable')}</b>
            </span>
            <span className="inline-flex items-center gap-1">
                <Database className="h-3.5 w-3.5" />
                {t('Debug.Scanned', { rows: formatNumber(scannedRows), bytes: formatBytes(scannedBytes) })}
            </span>
            {truncated && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {t('Debug.Truncated', { count: MAX_ROWS_HINT.toLocaleString(locale) })}
                </span>
            )}
            <span>
                {t('Debug.Status')}: <b className="text-foreground">{sessionStatus ?? t('Common.NotAvailable')}</b>
            </span>
            <span>
                {t('Debug.Session')}: <b className="text-foreground">{sessionId ?? t('Common.NotAvailable')}</b>
            </span>
            <span>
                {t('Debug.Set')}: <b className="text-foreground">{activeSet}</b>
            </span>
            <span>
                {t('Debug.Rows')}: <b className="text-foreground">{rowCount}</b>
            </span>
            <span className="ml-auto" />
            <span className="inline-flex items-center gap-1 opacity-70">
                {t('Debug.StorageKey')}: <code>{storageKey}</code>
            </span>
            <Button variant="outline" size="sm" className="ml-2 h-6 px-2 gap-1" onClick={copyDebugMeta} title={t('Debug.CopyMetaTitle')}>
                <Clipboard className="h-3.5 w-3.5" />
                {t('Debug.CopyMeta')}
            </Button>
        </div>
    );
}
