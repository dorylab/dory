'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { DatabaseSelect } from '@/app/(app)/[organization]/components/sql-console-sidebar/database-select';
import { SchemaSelect } from '@/app/(app)/[organization]/components/sql-console-sidebar/schema-select';
import { TableList } from '@/app/(app)/[organization]/components/sql-console-sidebar/table-list';

/** Shared source browser; callers supply scoped data and supported actions. */
export function SqlSourceSidebar({
    database,
    schema,
    filter,
    onFilterChange,
    refreshing,
    refreshDisabled,
    onRefresh,
    tableList,
    notice,
}: {
    database?: ComponentProps<typeof DatabaseSelect>;
    schema?: ComponentProps<typeof SchemaSelect>;
    filter: string;
    onFilterChange: (value: string) => void;
    refreshing: boolean;
    refreshDisabled?: boolean;
    onRefresh: () => void;
    tableList: Omit<ComponentProps<typeof TableList>, 't'>;
    notice?: ReactNode;
}) {
    const t = useTranslations('SQLConsoleSidebar');
    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 p-3" data-testid="sql-source-sidebar">
            {database && <DatabaseSelect {...database} />}
            {schema && <SchemaSelect {...schema} />}
            <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={filter}
                        onChange={event => onFilterChange(event.target.value)}
                        placeholder={t('Filter tables')}
                        className="h-8 pl-8"
                        aria-label={t('Filter tables')}
                    />
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="h-8 w-8 shrink-0"
                    onClick={onRefresh}
                    disabled={refreshDisabled || refreshing}
                    aria-label={t('Refresh tables')}
                    title={t('Refresh tables')}
                >
                    {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
            </div>
            {notice}
            <TableList {...tableList} t={t} />
        </div>
    );
}
