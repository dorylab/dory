'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { parseAsString, useQueryState } from 'nuqs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

export type ExplorerTab<Value extends string> = {
    value: Value;
    label: string;
    content: ReactNode;
    lazy?: boolean;
};

type ExplorerTabsShellProps<Value extends string> = {
    initialTab: Value;
    tabs: ExplorerTab<Value>[];
    resetKey: string;
};

export function ExplorerTabsShell<Value extends string>({ initialTab, tabs, resetKey }: ExplorerTabsShellProps<Value>) {
    const [urlTab, setUrlTab] = useQueryState('tab', parseAsString);
    const tabValuesKey = tabs.map(tab => tab.value).join('\0');
    const resolveTab = useCallback(
        (value?: string | null): Value => (value && tabValuesKey.split('\0').includes(value) ? (value as Value) : initialTab),
        [initialTab, tabValuesKey],
    );
    const [currentTab, setCurrentTab] = useState<Value>(() => resolveTab(urlTab));

    useEffect(() => {
        setCurrentTab(resolveTab(urlTab));
    }, [resetKey, resolveTab, urlTab]);

    return (
        <div className="flex h-full flex-col px-6 pb-6 pt-3">
            <Tabs
                value={currentTab}
                onValueChange={value => {
                    setCurrentTab(value as Value);
                    void setUrlTab(value === initialTab ? null : value);
                }}
                className="flex h-full flex-col"
            >
                <TabsList className="justify-start">
                    {tabs.map(tab => (
                        <TabsTrigger key={tab.value} value={tab.value} className="cursor-pointer">
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className="mt-0 flex-1 min-h-0">
                    {tabs.map(tab => (
                        <TabsContent key={tab.value} value={tab.value} className="h-full mt-0 data-[state=inactive]:hidden" forceMount={tab.lazy ? undefined : true}>
                            {tab.lazy && currentTab !== tab.value ? null : tab.content}
                        </TabsContent>
                    ))}
                </div>
            </Tabs>
        </div>
    );
}
