'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Layout } from 'react-resizable-panels';

import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/registry/new-york-v4/ui/resizable';
import { useSidebar } from '@/registry/new-york-v4/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

export function AgentReportLayout({
    active,
    mobilePanel,
    onMobilePanelChange,
    onBack,
    onClose,
    report,
    children,
}: {
    active: boolean;
    mobilePanel: string;
    onMobilePanelChange: (value: string) => void;
    onBack: () => void;
    onClose: () => void;
    report: ReactNode;
    children: ReactNode;
}) {
    const t = useTranslations('WorkDocuments');
    const narrow = useIsMobile(1024);
    const sidebar = useSidebar();
    const sidebarRef = useRef(sidebar);
    sidebarRef.current = sidebar;
    const split = useRef<Layout>({ 'work-conversation': 50, 'work-report-panel': 50 });

    useEffect(() => {
        if (!active) return;
        const { open, openMobile, setOpen, setOpenMobile } = sidebarRef.current;
        setOpen(false);
        setOpenMobile(false);
        return () => {
            sidebarRef.current.setOpen(open);
            sidebarRef.current.setOpenMobile(openMobile);
        };
    }, [active]);

    return (
        <Tabs value={mobilePanel} onValueChange={onMobilePanelChange} className="min-h-0 min-w-0 flex-1 gap-0">
            {active && narrow ? (
                <TabsList className="mx-3 my-2 shrink-0" aria-label={t('SplitView.Label')}>
                    <TabsTrigger value="chat" id="work-chat-tab" aria-controls="work-conversation">
                        {t('SplitView.Chat')}
                    </TabsTrigger>
                    <TabsTrigger value="report" id="work-report-tab" aria-controls="work-report-panel">
                        {t('SplitView.Report')}
                    </TabsTrigger>
                </TabsList>
            ) : null}
            <ResizablePanelGroup
                orientation="horizontal"
                disabled={narrow || !active}
                defaultLayout={split.current}
                onLayoutChanged={layout => {
                    if (active && !narrow && layout['work-conversation'] && layout['work-report-panel']) split.current = layout;
                }}
                className={cn(
                    'min-h-0 min-w-0 flex-1',
                    narrow && '[&>[data-panel]]:!flex-1',
                    active && narrow && mobilePanel === 'report' && '[&>#work-conversation]:!hidden',
                    active && narrow && mobilePanel === 'chat' && '[&>#work-report-panel]:!hidden',
                )}
                id="agent-report-layout"
                data-report-open={active}
            >
                <ResizablePanel
                    id="work-conversation"
                    minSize={active && !narrow ? '320px' : 0}
                    className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                    role={active && narrow ? 'tabpanel' : undefined}
                    aria-labelledby={active && narrow ? 'work-chat-tab' : undefined}
                >
                    {children}
                </ResizablePanel>
                {active ? (
                    <>
                        <ResizableHandle withHandle className={narrow ? 'hidden' : undefined} aria-label={t('SplitView.Resize')} />
                        <ResizablePanel
                            id="work-report-panel"
                            minSize={narrow ? 0 : '480px'}
                            className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background"
                            role={narrow ? 'tabpanel' : 'region'}
                            aria-label={narrow ? undefined : t('SplitView.Report')}
                            aria-labelledby={narrow ? 'work-report-tab' : undefined}
                        >
                            <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
                                <Button variant="ghost" size="sm" className="min-w-0" onClick={onBack}>
                                    <ArrowLeft className="size-4 shrink-0" />
                                    <span className="truncate">{t('Resources.Back')}</span>
                                </Button>
                                <Button variant="ghost" size="icon" aria-label={t('Resources.Close')} onClick={onClose}>
                                    <X className="size-4" />
                                </Button>
                            </header>
                            <div className="min-h-0 flex-1">{report}</div>
                        </ResizablePanel>
                    </>
                ) : null}
            </ResizablePanelGroup>
        </Tabs>
    );
}
