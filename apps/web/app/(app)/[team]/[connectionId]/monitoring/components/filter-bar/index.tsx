'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/registry/new-york-v4/ui/select';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/registry/new-york-v4/ui/toggle-group';
import { RefreshCcw, RotateCcw } from 'lucide-react';
import type { TimeRange, QueryType } from '@/types/monitoring';
import type { ClickHouseUser } from '@/types/privileges';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { useAtomValue } from 'jotai';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { useQueryInsightsFilters, useQueryInsightsLoadingValue } from '../../state';
import { DEFAULT_FILTERS } from '../../constants';
import { DatabasesSelect } from '@/components/@dory/ui/database-select';
import { DatabaseUsersSelect } from '@/components/@dory/ui/database-user-select';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '../../utils';

type Props = {
    users?: string[];
    databases?: string[];
    onRefresh?: () => void;

    
    enableDynamicThreshold?: boolean;

    
    dynamicThresholdMs?: number | null;
};

type DatabaseOption = { label?: string | null; value?: string | null };


type ThresholdMode = 'dynamic' | 'fixed';

export function QueryInsightsFilterBar({ users = [], databases = [], onRefresh, enableDynamicThreshold = false, dynamicThresholdMs }: Props) {
    const [filters, setFilters] = useQueryInsightsFilters();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id ?? null;
    const t = useTranslations('Monitoring');
    const locale = useLocale();

    const usersQuery = useQuery<string[]>({
        queryKey: ['monitoring', 'users', connectionId],
        enabled: Boolean(connectionId),
        queryFn: async ({ signal }) => {
            const response = await authFetch('/api/privileges/users', {
                method: 'GET',
                signal,
                headers: connectionId
                    ? {
                          'X-Connection-ID': connectionId,
                      }
                    : undefined,
            });
            const res = (await response.json()) as ResponseObject<ClickHouseUser[]>;
            if (!isSuccess(res)) {
                throw new Error(res.message || t('Errors.FetchUsers'));
            }
            const list = res.data ?? [];
            return Array.from(new Set(list.map(item => item?.name).filter((name): name is string => Boolean(name))));
        },
        staleTime: 5 * 60_000,
    });

    const connectionQuery = useQuery<string[]>({
        queryKey: ['monitoring', 'databases', connectionId],
        enabled: Boolean(connectionId),
        queryFn: async ({ signal }) => {
            if (!connectionId) return [];
            const response = await authFetch(`/api/connection/${connectionId}/databases`, {
                method: 'GET',
                signal,
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<DatabaseOption[]>;
            if (!isSuccess(res)) {
                throw new Error(res.message || t('Errors.FetchDatabases'));
            }
            const list = res.data ?? [];
            return Array.from(new Set(list.map(item => item?.value || item?.label).filter((db): db is string => Boolean(db))));
        },
        staleTime: 5 * 60_000,
    });

    const resolvedUsers = users.length > 0 ? users : (usersQuery.data ?? []);
    const resolvedDatabases = databases.length > 0 ? databases : (connectionQuery.data ?? []);
    const globalLoading = useQueryInsightsLoadingValue();
    const optionsLoading = usersQuery.isFetching || connectionQuery.isFetching;
    const isBusy = Boolean(globalLoading || optionsLoading);

    
    const [searchInput, setSearchInput] = React.useState(filters.search ?? '');
    const [minDurationInput, setMinDurationInput] = React.useState(filters.minDurationMs == null ? '0' : String(filters.minDurationMs));

    
    const initialMode: ThresholdMode = (filters.thresholdMode as ThresholdMode) || (enableDynamicThreshold ? 'dynamic' : 'fixed');
    const [thresholdMode, setThresholdMode] = React.useState<ThresholdMode>(initialMode);

    
    React.useEffect(() => {
        setSearchInput(filters.search ?? '');
        setMinDurationInput(filters.minDurationMs == null ? '0' : String(filters.minDurationMs));
        if (filters.thresholdMode) {
            setThresholdMode(filters.thresholdMode as ThresholdMode);
        }
    }, [filters.search, filters.minDurationMs, filters.thresholdMode]);

    const set = <K extends keyof typeof filters>(key: K, val: (typeof filters)[K]) => {
        const next = { ...filters, [key]: val };
        setFilters(next);
    };

    
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchInput(e.target.value);
    };

    const handleMinDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === '') {
            setMinDurationInput('');
            return;
        }
        const num = Number(raw);
        if (Number.isNaN(num) || num < 0) return;
        setMinDurationInput(raw);
    };

    
    const handleApply = () => {
        const next = {
            ...filters,
            search: searchInput.trim(),
            thresholdMode: enableDynamicThreshold ? thresholdMode : ('fixed' as ThresholdMode),
            
            minDurationMs: enableDynamicThreshold && thresholdMode === 'dynamic' ? undefined : minDurationInput === '' ? 0 : Number(minDurationInput),
        };
        setFilters(next);
        onRefresh?.();
    };

    
    const handleReset = () => {
        
        const next = {
            ...DEFAULT_FILTERS,
            thresholdMode: enableDynamicThreshold ? ('dynamic' as ThresholdMode) : ('fixed' as ThresholdMode),
        };
        setFilters(next);

        setSearchInput(next.search ?? '');
        setMinDurationInput(next.minDurationMs == null ? '0' : String(next.minDurationMs));
        setThresholdMode(next.thresholdMode as ThresholdMode);

        onRefresh?.();
    };

    const showDynamicInfo = enableDynamicThreshold && thresholdMode === 'dynamic';

    return (
        <Card className="border-none bg-muted/40">
            <CardContent className="flex flex-wrap items-center gap-3 px-4 py-0">
                
                <DatabaseUsersSelect value={filters.user} users={resolvedUsers} onChange={v => set('user', v as any)} className="h-8 w-[140px] text-xs" />

                
                <DatabasesSelect className="h-8 w-[140px] text-xs" value={filters.database} databases={resolvedDatabases.map(db => ({ value: db, label: db }))} onChange={v => set('database', v as any)} />

                
                <Select value={filters.queryType} onValueChange={v => set('queryType', v as QueryType)}>
                        <SelectTrigger size="sm" className="h-8 w-[140px] text-xs">
                        <SelectValue placeholder={t('Filters.QueryTypePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('Filters.QueryTypeAll')}</SelectItem>
                        <SelectItem value="select">SELECT</SelectItem>
                        <SelectItem value="insert">INSERT</SelectItem>
                        <SelectItem value="ddl">DDL</SelectItem>
                        <SelectItem value="other">{t('Filters.QueryTypeOther')}</SelectItem>
                    </SelectContent>
                </Select>

                
                {enableDynamicThreshold ? (
                    <div className="flex items-center gap-2">
                        <ToggleGroup
                            type="single"
                            size="sm"
                            value={thresholdMode}
                            onValueChange={val => {
                                if (!val) return;
                                setThresholdMode(val as ThresholdMode);
                            }}
                        >
                            <ToggleGroupItem value="dynamic" className="h-8 px-2 text-[11px]">
                                {t('Filters.DynamicThreshold')}
                            </ToggleGroupItem>
                            <ToggleGroupItem value="fixed" className="h-8 px-2 text-[11px]">
                                {t('Filters.FixedThreshold')}
                            </ToggleGroupItem>
                        </ToggleGroup>

                        {showDynamicInfo ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{t('Filters.DynamicThresholdHelp')}</span>
                                {typeof dynamicThresholdMs === 'number' && (
                                    <span className="rounded bg-background px-1.5 py-0.5 text-[11px]">
                                        {t('Filters.DynamicThresholdCurrent', { value: formatNumber(dynamicThresholdMs, locale) })}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">{t('Filters.DurationAtLeast')}</span>
                                <Input type="number" min={0} value={minDurationInput} onChange={handleMinDurationChange} className="w-[80px] text-xs h-8" />
                                <span className="text-xs text-muted-foreground">{t('Units.Milliseconds')}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{t('Filters.DurationAtLeast')}</span>
                        <Input type="number" min={0} value={minDurationInput} onChange={handleMinDurationChange} className="w-[80px] text-xs h-8" />
                        <span className="text-xs text-muted-foreground">{t('Units.Milliseconds')}</span>
                    </div>
                )}

                
                <Select value={filters.timeRange} onValueChange={v => set('timeRange', v as TimeRange)}>
                    <SelectTrigger size="sm" className="h-8 w-[130px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1h">{t('TimeRange.1h')}</SelectItem>
                        <SelectItem value="6h">{t('TimeRange.6h')}</SelectItem>
                        <SelectItem value="24h">{t('TimeRange.24h')}</SelectItem>
                        <SelectItem value="7d">{t('TimeRange.7d')}</SelectItem>
                    </SelectContent>
                </Select>

                
                <div className="ml-auto flex items-center gap-1">
                    <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px] text-muted-foreground" onClick={handleReset} disabled={isBusy}>
                        <RotateCcw className="mr-1 h-3 w-3" />
                        {t('Actions.Reset')}
                    </Button>

                    <Button type="button" size="sm" variant="outline" className="h-8 relative w-[70px]" onClick={handleApply} disabled={isBusy}>
                        <span className={isBusy ? 'opacity-0' : 'opacity-100'}>{t('Actions.Apply')}</span>
                        {isBusy && <RefreshCcw className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin" />}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
