'use client';

import { Activity, type ComponentProps, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { ResultStatusBar } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/ResultStatusBar';
import type { ExecMeta } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/Toolbar';

const VTable = dynamic(() => import('@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable'), { ssr: false });
const Charts = dynamic(() => import('@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts').then(module => module.Charts), {
    ssr: false,
});
export type SqlResultViewMode = 'table' | 'charts';

export function SqlResults({
    tabs,
    notice,
    children,
    meta,
    showStatus = true,
    limited = false,
    testId = 'result-table',
}: {
    tabs: ReactNode;
    notice?: ReactNode;
    children: ReactNode;
    meta?: ExecMeta;
    showStatus?: boolean;
    limited?: boolean;
    testId?: string;
}) {
    return (
        <div className="flex h-full min-h-0 flex-col" data-testid={testId}>
            {tabs}
            {notice}
            <div className="min-h-0 flex-1">{children}</div>
            {showStatus && <ResultStatusBar meta={meta} shouldShowLimitNotice={limited} />}
        </div>
    );
}

export function SqlResultTabs({ items, value, onChange }: { items: { id: string; label: string; ariaLabel?: string }[]; value: string; onChange: (id: string) => void }) {
    return (
        <div className="flex w-full items-center justify-between border bg-muted">
            <Tabs value={value} onValueChange={onChange} className="min-w-0 overflow-x-auto">
                <TabsList className="w-max justify-start">
                    {items.map(item => (
                        <TabsTrigger key={item.id} value={item.id} className="max-w-48 px-2" title={item.label} aria-label={item.ariaLabel}>
                            <span className="truncate">{item.label}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    );
}

export function SqlResultView({
    view,
    onViewChange,
    filters,
    actions,
    tables,
    charts,
    inspector,
    empty,
}: {
    view: SqlResultViewMode;
    onViewChange: (view: SqlResultViewMode) => void;
    filters?: ReactNode;
    actions?: ReactNode;
    tables: ReactNode;
    charts: ReactNode;
    inspector?: ReactNode;
    empty?: ReactNode;
}) {
    const t = useTranslations('SqlConsole');
    return (
        <div className="mb-2 flex h-full min-h-0 flex-col bg-card" data-testid="result-table-content">
            <div className="border-b bg-muted/30">
                <div className="flex min-h-12 w-full items-center justify-between gap-3 px-2 py-1">
                    <Tabs
                        value={view}
                        onValueChange={value => {
                            if (value === 'table' || value === 'charts') onViewChange(value);
                        }}
                    >
                        <TabsList className="h-7 p-[2px]" aria-label="Result view">
                            <TabsTrigger value="table" className="h-6 cursor-pointer px-3 text-xs">
                                {t('Results.Table')}
                            </TabsTrigger>
                            <TabsTrigger value="charts" className="h-6 cursor-pointer px-3 text-xs">
                                {t('Results.Charts')}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="flex min-w-0 flex-1 flex-row">{filters}</div>
                    <div className="mr-2 flex items-center gap-1.5">{actions}</div>
                </div>
            </div>
            <div className="relative flex min-h-0 flex-1">
                {tables}
                {view === 'table' && empty}
                <div
                    aria-hidden={view !== 'charts'}
                    inert={view !== 'charts'}
                    className={`absolute inset-0 min-h-0 ${view === 'charts' ? 'z-10 flex opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
                >
                    {charts}
                </div>
                {view === 'table' && inspector}
            </div>
        </div>
    );
}

export function SqlResultTablePane({ visible, testId, ...props }: ComponentProps<typeof VTable> & { visible: boolean; testId?: string }) {
    return (
        <div
            data-testid={testId}
            aria-hidden={!visible}
            inert={!visible}
            className={`absolute inset-0 min-h-0 ${visible ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
        >
            <VTable {...props} />
        </div>
    );
}

export function SqlResultChartPane({ visible, ...props }: ComponentProps<typeof Charts> & { visible: boolean }) {
    return (
        <Activity mode={visible ? 'visible' : 'hidden'}>
            <div className={`flex min-h-0 flex-1 flex-col ${visible ? '' : 'hidden'}`}>
                <Charts {...props} />
            </div>
        </Activity>
    );
}
