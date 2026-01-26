'use client';

import React from 'react';
import { CaseSensitive, Clipboard, Copy, Play, Scissors, Sparkles, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSetAtom } from 'jotai';

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/registry/new-york-v4/ui/context-menu';
import type { ActionIntent } from '@/lib/copilot/action/types';
import { copilotActionRequestAtom, copilotPanelOpenAtom } from '../../sql-console.store';
import { AISparkIcon } from '@/components/@dory/ui/ai-spark-icon';

interface SqlEditorContextMenuProps {
    children: React.ReactNode;
    hasSelection: boolean;
    onCopy: () => void;
    onPaste: () => void;
    onCut: () => void;
    onFormat: () => void;
    onToggleCase: () => void;
    onExecuteSelection: () => void;
    onExecuteSql: () => void;
}

export function SqlEditorContextMenu({
    children,
    hasSelection,
    onCopy,
    onPaste,
    onCut,
    onFormat,
    onToggleCase,
    onExecuteSelection,
    onExecuteSql,
}: SqlEditorContextMenuProps) {
    const t = useTranslations('SqlConsole');
    const setCopilotPanelOpen = useSetAtom(copilotPanelOpenAtom);
    const setCopilotActionRequest = useSetAtom(copilotActionRequestAtom);

    const openCopilotAction = React.useCallback(
        (intent: ActionIntent) => {
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            setCopilotPanelOpen(true);
            setCopilotActionRequest({ id: requestId, intent });
        },
        [setCopilotActionRequest, setCopilotPanelOpen],
    );

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-64">
                <ContextMenuItem disabled={!hasSelection} onSelect={onCopy}>
                    <Copy className="w-4 h-4" />
                    <span>{t('ContextMenu.Copy')}</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={onPaste}>
                    <Clipboard className="w-4 h-4" />
                    <span>{t('ContextMenu.Paste')}</span>
                </ContextMenuItem>
                <ContextMenuItem disabled={!hasSelection} onSelect={onCut}>
                    <Scissors className="w-4 h-4" />
                    <span>{t('ContextMenu.Cut')}</span>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={onFormat}>
                    <Wand2 className="w-4 h-4" />
                    <span>{t('ContextMenu.Format')}</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={onToggleCase}>
                    <CaseSensitive className="w-4 h-4" />
                    <span>{t('ContextMenu.ToggleCase')}</span>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={!hasSelection} onSelect={onExecuteSelection}>
                    <Play className="w-4 h-4" />
                    <span>{t('ContextMenu.ExecuteSelection')}</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={onExecuteSql}>
                    <Play className="w-4 h-4" />
                    <span>{t('ContextMenu.ExecuteSQL')}</span>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => openCopilotAction('rewrite-sql')} className='group'>
                    <AISparkIcon className="w-4 h-4 group-hover:text-violet-400" />
                    <span>{t('Copilot.QuickActions.RewriteSql.Title')}</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => openCopilotAction('optimize-performance')} className='group'>
                    <AISparkIcon className="w-4 h-4 group-hover:text-violet-400" />
                    <span>{t('Copilot.QuickActions.OptimizePerformance.Title')}</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => openCopilotAction('to-aggregation')} className='group'>
                    <AISparkIcon className="w-4 h-4 group-hover:text-violet-400" />
                    <span>{t('Copilot.QuickActions.ToAggregation.Title')}</span>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
