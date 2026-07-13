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
import { cleanupExpiredResultSets, getResultSetRetentionSettings, updateResultSetRetentionSettings } from '@/lib/organization/api';

export function StoragePanel() {
    const params = useParams<{ organization?: string }>();
    const organizationSlug = params.organization ?? 'current';
    const t = useTranslations('DoryUI.Settings.Storage');
    const queryClient = useQueryClient();
    const [retentionDaysOverride, setRetentionDaysOverride] = useState<string | null>(null);

    const retentionQuery = useQuery({
        queryKey: ['result-set-retention', organizationSlug],
        queryFn: () => getResultSetRetentionSettings(),
    });

    const retentionMutation = useMutation({
        mutationFn: async () => {
            const retentionDays = retentionDaysOverride ?? (retentionQuery.data ? String(retentionQuery.data.retentionDays) : '');
            const nextRetentionDays = Number(retentionDays);
            const updated = await updateResultSetRetentionSettings({ retentionDays: nextRetentionDays });
            await cleanupExpiredResultSets().catch(() => undefined);
            return updated;
        },
        onSuccess: async () => {
            toast.success(t('ResultSets.Toasts.Updated'));
            setRetentionDaysOverride(null);
            await queryClient.invalidateQueries({ queryKey: ['result-set-retention', organizationSlug] });
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : t('ResultSets.Toasts.UpdateFailed'));
        },
    });

    const retentionSettings = retentionQuery.data;
    const canManageRetention = Boolean(retentionSettings?.canManage);
    const retentionOptions = retentionSettings?.allowedRetentionDays ?? [1, 3, 7, 14, 30, 90];
    const retentionDays = retentionDaysOverride ?? (retentionSettings ? String(retentionSettings.retentionDays) : '');
    const retentionIsDirty = retentionSettings ? retentionDays !== String(retentionSettings.retentionDays) : false;

    return (
        <div className="space-y-6">
            <section className="space-y-4">
                <div>
                    <h3 className="text-sm font-medium">{t('ResultSets.Title')}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t('ResultSets.Description')}</p>
                </div>
                <SettingsRow label={<Label htmlFor="result-set-retention-days">{t('ResultSets.FieldLabel')}</Label>} description={t('ResultSets.FieldDescription')}>
                    {retentionQuery.isLoading && !retentionSettings ? (
                        <Skeleton className="h-8 w-40" />
                    ) : (
                        <Select value={retentionDays} onValueChange={setRetentionDaysOverride} disabled={!canManageRetention || retentionMutation.isPending}>
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
                {retentionSettings && !canManageRetention ? <p className="text-xs text-muted-foreground">{t('ResultSets.ReadOnlyHint')}</p> : null}
                <div className="flex items-center justify-end">
                    <Button
                        onClick={() => retentionMutation.mutate()}
                        disabled={!canManageRetention || !retentionIsDirty || retentionMutation.isPending || !retentionDays}
                    >
                        {retentionMutation.isPending ? t('ResultSets.Saving') : t('ResultSets.SaveAction')}
                    </Button>
                </div>
            </section>
        </div>
    );
}
