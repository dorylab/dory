'use client';

import type { ComponentProps, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Loader2, Play, Square } from 'lucide-react';
import { Button } from '@/registry/new-york-v4/ui/button';

const SQLEditor = dynamic(() => import('@/app/(app)/[organization]/[connectionId]/sql-console/components/sql-editor'), { ssr: false });

export function SqlQueryToolbar({
    runLabel,
    running,
    disabled,
    onRun,
    onCancel,
    cancelLabel,
    runOptions,
    primaryActions,
    actions,
    replacement,
}: {
    runLabel: string;
    running: boolean;
    disabled?: boolean;
    onRun: () => void;
    onCancel?: () => void;
    cancelLabel: string;
    runOptions?: ReactNode;
    primaryActions?: ReactNode;
    actions?: ReactNode;
    replacement?: ReactNode;
}) {
    return (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-2" data-testid="sql-query-toolbar">
            {replacement ?? (
                <>
                    <div className="flex items-center">
                        <Button
                            disabled={running || disabled}
                            size="sm"
                            className={`cursor-pointer gap-2 ${runOptions ? 'rounded-r-none' : ''}`}
                            onClick={onRun}
                            data-testid="run-query"
                        >
                            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            {runLabel}
                        </Button>
                        {runOptions}
                    </div>
                    {primaryActions}
                </>
            )}
            {running && onCancel && (
                <Button variant="outline" size="sm" className="gap-2" onClick={onCancel}>
                    <Square className="h-4 w-4" />
                    {cancelLabel}
                </Button>
            )}
            <div className="flex-1" />
            {actions}
        </div>
    );
}

export function SqlQueryPane({
    toolbar,
    editor,
    results,
    layout,
}: {
    toolbar: ReactNode;
    editor: ComponentProps<typeof SQLEditor>;
    results: ReactNode;
    layout?: Pick<ComponentProps<typeof Group>, 'groupRef' | 'defaultLayout' | 'onLayoutChanged'>;
}) {
    return (
        <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="sql-query-pane">
            {toolbar}
            <Group orientation="vertical" className="min-h-0 flex-1" defaultLayout={{ 'editor-panel': 20, 'result-panel': 80 }} {...layout}>
                <Panel id="editor-panel" minSize="15%" className="min-h-0">
                    <div className="flex h-full min-h-0 flex-col border-b">
                        <SQLEditor {...editor} />
                    </div>
                </Panel>
                <Separator className="h-1.5 bg-border transition-colors" />
                <Panel id="result-panel" minSize="20%" className="min-h-0">
                    <div className="relative flex h-full min-h-0 flex-col">{results}</div>
                </Panel>
            </Group>
        </div>
    );
}
