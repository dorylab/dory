'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useTranslations } from 'next-intl';
import { SQLTabs } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/tabs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

/** The workspace owns presentation; its callers own execution and persistence. */
export function SqlWorkspace({
    mode,
    sidebar,
    tabs,
    empty,
    children,
    rightPanel,
    rail,
    overlay,
    defaultLayout,
    onLayoutChanged,
}: {
    mode: 'agent' | 'report';
    sidebar: { tables: ReactNode; queries: ReactNode };
    tabs?: ComponentProps<typeof SQLTabs>;
    empty?: ReactNode;
    children: ReactNode;
    rightPanel?: ReactNode;
    rail?: ReactNode;
    overlay?: ReactNode;
    defaultLayout?: Layout;
    onLayoutChanged?: (layout: Layout) => void;
}) {
    const t = useTranslations('SqlConsole');
    return (
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden" data-testid="sql-workspace" data-workspace-mode={mode}>
            <Group orientation="horizontal" className="min-h-0 flex-1">
                <Panel id="workspace" minSize="45%">
                    <Group orientation="horizontal" defaultLayout={defaultLayout ?? { 'left-panel': 20, 'middle-panel': 80 }} onLayoutChanged={onLayoutChanged}>
                        <Panel id="left-panel" minSize="15%" maxSize="40%" className="min-w-0 overflow-hidden">
                            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card" data-testid="sql-console-sidebar-surface">
                                <Tabs defaultValue="tables" className="min-h-0 min-w-0 flex-1 overflow-hidden">
                                    <TabsList className="w-full rounded-none px-2">
                                        <TabsTrigger value="tables" className="min-w-0 flex-1">
                                            {t('Sidebar.Tables')}
                                        </TabsTrigger>
                                        <TabsTrigger value="saved" className="min-w-0 flex-1">
                                            {t('Sidebar.Queries')}
                                        </TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="tables" className="min-h-0 min-w-0 flex-1 overflow-auto">
                                        {sidebar.tables}
                                    </TabsContent>
                                    <TabsContent value="saved" className="min-h-0 min-w-0 flex-1 overflow-auto">
                                        {sidebar.queries}
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </Panel>
                        <Separator className="w-1.5 bg-border transition-colors" />
                        <Panel id="middle-panel" minSize="40%">
                            <div className="flex h-full min-h-0 flex-col">
                                {empty ?? (
                                    <>
                                        {tabs && <SQLTabs {...tabs} />}
                                        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
                                    </>
                                )}
                            </div>
                        </Panel>
                    </Group>
                </Panel>
                {rightPanel && (
                    <>
                        <Separator className="w-1.5 bg-border transition-colors" />
                        <Panel id="workspace-details" defaultSize="25%" minSize="20%" maxSize="50%" className="min-h-0 border-l bg-card">
                            {rightPanel}
                        </Panel>
                    </>
                )}
            </Group>
            {overlay}
            {rail && (
                <div className="z-20 flex h-full w-10 shrink-0 flex-col items-center gap-2 border-l border-border/70 bg-card py-3" data-testid="sql-console-action-rail">
                    {rail}
                </div>
            )}
        </div>
    );
}
