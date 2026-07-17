'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { SettingsRow } from './SettingsRow';
import { cleanupResultSetStorage, getResultSetStorageSettings, updateResultSetStorageSettings } from '@/lib/organization/api';

const GIB_BYTES = 1024 ** 3;

function formatBytes(bytes: number) {
    if (bytes >= GIB_BYTES) return `${(bytes / GIB_BYTES).toFixed(bytes >= 10 * GIB_BYTES ? 0 : 1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

export function StoragePanel() {
    const params = useParams<{ organization?: string }>();
    const organizationSlug = params.organization ?? 'current';
    const t = useTranslations('DoryUI.Settings.Storage');
    const queryClient = useQueryClient();
    const [retentionDaysOverride, setRetentionDaysOverride] = useState<string | null>(null);
    const [maxStorageOverride, setMaxStorageOverride] = useState<string | null>(null);

    const storageQuery = useQuery({
        queryKey: ['result-set-storage', organizationSlug],
        queryFn: () => getResultSetStorageSettings(),
    });

    const storageMutation = useMutation({
        mutationFn: async () => {
            const retentionDays = retentionDaysOverride ?? (storageQuery.data ? String(storageQuery.data.retentionDays) : '');
            const maxStorageBytes = maxStorageOverride ?? (storageQuery.data ? String(storageQuery.data.maxStorageBytes) : '');
            const nextRetentionDays = Number(retentionDays);
            const nextMaxStorageBytes = Number(maxStorageBytes);
            const updated = await updateResultSetStorageSettings({ retentionDays: nextRetentionDays, maxStorageBytes: nextMaxStorageBytes });
            await cleanupResultSetStorage().catch(() => undefined);
            return updated;
        },
        onSuccess: async () => {
            toast.success(t('ResultSets.Toasts.Updated'));
            setRetentionDaysOverride(null);
            setMaxStorageOverride(null);
            await queryClient.invalidateQueries({ queryKey: ['result-set-storage', organizationSlug] });
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('ResultSets.Toasts.UpdateFailed'));
        },
    });

    const storageSettings = storageQuery.data;
    const canManageStorage = Boolean(storageSettings?.canManage);
    const retentionOptions = storageSettings?.allowedRetentionDays ?? [1, 3, 7, 14, 30, 90];
    const storageOptions = storageSettings?.allowedMaxStorageBytes ?? [1, 5, 10, 25, 50].map(value => value * GIB_BYTES);
    const retentionDays = retentionDaysOverride ?? (storageSettings ? String(storageSettings.retentionDays) : '');
    const maxStorageBytes = maxStorageOverride ?? (storageSettings ? String(storageSettings.maxStorageBytes) : '');
    const settingsAreDirty = storageSettings ? retentionDays !== String(storageSettings.retentionDays) || maxStorageBytes !== String(storageSettings.maxStorageBytes) : false;
    const usagePercent = storageSettings ? Math.min(100, (storageSettings.totalBytes / storageSettings.maxStorageBytes) * 100) : 0;

    return (
        <div className="space-y-6">
            <section className="space-y-4">
                <div>
                    <h3 className="text-sm font-medium">{t('ResultSets.Title')}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t('ResultSets.Description')}</p>
                </div>
                <SettingsRow label={<Label htmlFor="result-set-retention-days">{t('ResultSets.FieldLabel')}</Label>} description={t('ResultSets.FieldDescription')}>
                    {storageQuery.isLoading && !storageSettings ? (
                        <Skeleton className="h-8 w-40" />
                    ) : (
                        <Select value={retentionDays} onValueChange={setRetentionDaysOverride} disabled={!canManageStorage || storageMutation.isPending}>
                            <SelectTrigger id="result-set-retention-days" className="h-8 w-40 justify-between">
                                <SelectValue placeholder={t('ResultSets.SelectPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent align="end">
                                {retentionOptions.map(option => (
                                    <SelectItem key={option} value={String(option)}>
                                        {t('ResultSets.DayOption', { count: option })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </SettingsRow>
                <SettingsRow label={<Label htmlFor="result-set-storage-limit">{t('ResultSets.QuotaLabel')}</Label>} description={t('ResultSets.QuotaDescription')}>
                    {storageQuery.isLoading && !storageSettings ? (
                        <Skeleton className="h-8 w-40" />
                    ) : (
                        <Select value={maxStorageBytes} onValueChange={setMaxStorageOverride} disabled={!canManageStorage || storageMutation.isPending}>
                            <SelectTrigger id="result-set-storage-limit" className="h-8 w-40 justify-between">
                                <SelectValue placeholder={t('ResultSets.QuotaPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent align="end">
                                {storageOptions.map(option => (
                                    <SelectItem key={option} value={String(option)}>
                                        {t('ResultSets.GigabyteOption', { count: option / GIB_BYTES })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </SettingsRow>
                {storageSettings ? (
                    <div className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{t('ResultSets.UsageLabel')}</span>
                            <span className="text-muted-foreground">
                                {formatBytes(storageSettings.totalBytes)} / {formatBytes(storageSettings.maxStorageBytes)}
                            </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${usagePercent}%` }} />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                            <span>{t('ResultSets.ResultUsage', { size: formatBytes(storageSettings.resultSetsBytes) })}</span>
                        </div>
                    </div>
                ) : null}
                {storageSettings && !canManageStorage ? <p className="text-xs text-muted-foreground">{t('ResultSets.ReadOnlyHint')}</p> : null}
                <div className="flex items-center justify-end">
                    <Button
                        onClick={() => storageMutation.mutate()}
                        disabled={!canManageStorage || !settingsAreDirty || storageMutation.isPending || !retentionDays || !maxStorageBytes}
                    >
                        {storageMutation.isPending ? t('ResultSets.Saving') : t('ResultSets.SaveAction')}
                    </Button>
                </div>
            </section>
        </div>
    );
}
