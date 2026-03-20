'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/registry/new-york-v4/ui/context-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Plus, Loader2, FileText, X, Sparkles, Pencil, CircleOff, Table as TableIcon } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/registry/new-york-v4/ui/scroll-area';
import { SQLTab } from '@/types/tabs';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useTranslations } from 'next-intl';

interface SQLTabsProps {
    tabs: SQLTab[];
    activeTabId: string | null;
    setActiveTabId: (id: string) => void;
    addTab: () => void | Promise<string>;
    closeTab: (tabId: string) => void | Promise<void>;
    closeOtherTabs: (tabId: string) => void | Promise<void>;
    updateTab: (tabId: string, patch: Partial<SQLTab>, options?: { immediate?: boolean }) => Promise<void> | void;
    reorderTabs: (sourceId: string, targetId: string, options?: { persist?: boolean }) => void;
    onRequestAITitle: (tab: SQLTab) => Promise<void> | void;
    onHeightChange?: (height: number) => void;
}

export function SQLTabs({
    tabs,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    closeOtherTabs,
    updateTab,
    reorderTabs,
    onRequestAITitle,
    onHeightChange,
}: SQLTabsProps) {
    const headerRef = useRef<HTMLDivElement | null>(null);
    const t = useTranslations('SqlConsole');

    
    const rowRef = useRef<HTMLDivElement | null>(null);
    const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const lastActionRef = useRef<'create' | null>(null); 
    const hasInitializedScrollRef = useRef(false); 

    const [renamingTabs, setRenamingTabs] = useState<Record<string, boolean>>({});
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [renameDraft, setRenameDraft] = useState('');
    const [renameTarget, setRenameTarget] = useState<SQLTab | null>(null);
    const [submittingRename, setSubmittingRename] = useState(false);
    const [draggingTabId, setDraggingTabId] = useState<string | null>(null);

    const activeTab = useMemo(() => tabs.find(t => t.tabId === activeTabId), [tabs, activeTabId]);

    const handleCloseTab = useCallback(
        (tabId: string) => {
            void closeTab(tabId);
        },
        [closeTab],
    );

    const handleCloseOthers = useCallback(
        (tabId: string) => {
            void closeOtherTabs(tabId);
        },
        [closeOtherTabs],
    );

    const openRenameDialog = useCallback(
        (tab: SQLTab) => {
            setActiveTabId(tab.tabId);
            setRenameTarget(tab);
            setRenameDraft(tab.tabName as string);
            setRenameDialogOpen(true);
        },
        [setActiveTabId],
    );

    const handleRequestAITitle = useCallback(
        (tab: SQLTab) => {
            if (tab.tabType !== 'sql') return;

            setRenamingTabs(prev => ({ ...prev, [tab.tabId]: true }));
            Promise.resolve(onRequestAITitle(tab))
                .catch(err => {
                    console.error('[SQLTabs] AI rename failed', err);
                })
                .finally(() => {
                    setRenamingTabs(prev => ({ ...prev, [tab.tabId]: false }));
                });
        },
        [onRequestAITitle],
    );

    const handleRenameConfirm = useCallback(() => {
        if (!renameTarget) return;
        const trimmed = renameDraft.trim();
        if (!trimmed || trimmed === renameTarget.tabName) {
            setRenameDialogOpen(false);
            return;
        }

        setSubmittingRename(true);
        Promise.resolve(updateTab(renameTarget.tabId, { tabName: trimmed }))
            .catch(err => {
                console.error('[SQLTabs] rename failed', err);
            })
            .finally(() => {
                setSubmittingRename(false);
                setRenameDialogOpen(false);
                setRenameTarget(null);
            });
    }, [renameDraft, renameTarget, updateTab]);

    const renderMenuItems = useCallback(
        (tab: SQLTab, Item: any, Separator: any) => {
            const isRenaming = !!renamingTabs[tab.tabId];

            return (
                <>
                    <Item onSelect={() => openRenameDialog(tab)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        {t('Tabs.Rename')}
                    </Item>
                    <Item
                        disabled={isRenaming || tab.tabType !== 'sql'}
                        onSelect={() => {
                            setActiveTabId(tab.tabId);
                            handleRequestAITitle(tab);
                        }}
                    >
                        {isRenaming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        {t('Tabs.GenerateAiTitle')}
                    </Item>
                    <Separator />
                    <Item onSelect={() => handleCloseTab(tab.tabId)} className="text-destructive focus:text-destructive">
                        <X className="w-4 h-4 mr-2" />
                        {t('Tabs.Close')}
                    </Item>
                    <Item
                        disabled={tabs.length <= 1}
                        onSelect={() => {
                            setActiveTabId(tab.tabId);
                            handleCloseOthers(tab.tabId);
                        }}
                    >
                        <CircleOff className="w-4 h-4 mr-2" />
                        {t('Tabs.CloseOthers')}
                    </Item>
                </>
            );
        },
        [handleCloseOthers, openRenameDialog, handleRequestAITitle, handleCloseTab, renamingTabs, setActiveTabId, tabs],
    );

    
    const handleAddTab = useCallback(async () => {
        lastActionRef.current = 'create';
        await Promise.resolve(addTab());
    }, [addTab]);

    
    useLayoutEffect(() => {
        if (!activeTabId) return;

        const row = rowRef.current;
        if (!row) return;

        
        const viewport = (row.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null) || (row.parentElement as HTMLElement | null);

        if (!viewport) return;

        const el = tabRefs.current[activeTabId];

        if (!el) return;

        
        const runScrollLogic = () => {
            
            if (lastActionRef.current === 'create') {
                lastActionRef.current = null;

                const elLeft = el.offsetLeft;
                const elRight = elLeft + el.offsetWidth;
                const targetScrollLeft = Math.max(0, elRight - viewport.clientWidth);
                viewport.scrollLeft = targetScrollLeft;
                return;
            }

            
            if (!hasInitializedScrollRef.current) {
                hasInitializedScrollRef.current = true;

                const elLeft = el.offsetLeft;
                const elRight = elLeft + el.offsetWidth;
                const visibleLeft = viewport.scrollLeft;
                const visibleRight = visibleLeft + viewport.clientWidth;

                console.log('[SQLTabs] initial scroll check', {
                    elLeft,
                    elRight,
                    visibleLeft,
                    visibleRight,
                });

                
                if (elLeft >= visibleLeft && elRight <= visibleRight) {
                    return;
                }

                const margin = 16;
                const target = Math.max(0, elLeft - margin);
                viewport.scrollLeft = target;

            }
        };

        
        const id = requestAnimationFrame(runScrollLogic);

        return () => cancelAnimationFrame(id);
    }, [activeTabId, tabs.length]);

    useLayoutEffect(() => {
        const el = headerRef.current;
        if (!el || !onHeightChange) return;
        const height = el.getBoundingClientRect().height;
        onHeightChange(height);
    }, [onHeightChange]);

    if (!activeTab) {
        return <div>{t('Tabs.NoActiveTab')}</div>;
    }

    return (
        <div className="flex flex-col">
            {/* Tab Headers */}
            <div ref={headerRef} className="flex items-center bg-card">
                
                <ScrollArea className="flex-1 min-w-0">
                    <div ref={rowRef} className="flex items-center whitespace-nowrap">
                        {tabs.map(tab => {
                            const isActive = tab.tabId === activeTabId;
                            const isRenaming = !!renamingTabs[tab.tabId];

                            return (
                                <ContextMenu key={tab.tabId}>
                                    <ContextMenuTrigger asChild>
                                        <div
                                            ref={el => {
                                                tabRefs.current[tab.tabId] = el;
                                            }}
                                            draggable
                                            role="tab"
                                            aria-selected={isActive}
                                            onClick={() => {
                                                
                                                setActiveTabId(tab.tabId);
                                            }}
                                            onContextMenu={() => {
                                                setActiveTabId(tab.tabId);
                                            }}
                                            onDragStart={e => {
                                                setDraggingTabId(tab.tabId);
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragOver={e => {
                                                e.preventDefault();
                                                
                                            }}
                                            onDrop={e => {
                                                e.preventDefault();
                                                if (!draggingTabId || draggingTabId === tab.tabId) return;
                                                reorderTabs(draggingTabId, tab.tabId, { persist: true });
                                                setDraggingTabId(null);
                                            }}
                                            onDragEnd={() => setDraggingTabId(null)}
                                            className={`group relative flex-none shrink-0 w-45 h-9
                                                border-r border-b border-border cursor-pointer
                                                ${
                                                    isActive
                                                        ? [
                                                              'bg-background text-foreground border-b-0 font-semibold',
                                                              'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary',
                                                              'shadow-sm',
                                                          ].join(' ')
                                                        : ['bg-muted/60 text-muted-foreground', 'hover:text-foreground hover:bg-muted'].join(' ')
                                                }`}
                                        >
                                            
                                            <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
                                                {tab.tabType === 'table' ? <TableIcon className="w-4 h-4 mr-2 shrink-0" /> : <FileText className="w-4 h-4 mr-2 shrink-0" />}
                                                <span className="text-sm truncate text-center">{tab.tabName}</span>
                                            </div>

                                            
                                            <button
                                                className="absolute right-2 top-1/2 -translate-y-1/2 z-10
                                                           p-1 rounded hover:bg-muted
                                                           opacity-0 group-hover:opacity-100
                                                           pointer-events-none group-hover:pointer-events-auto
                                                           transition-opacity"
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    handleCloseTab(tab.tabId);
                                                }}
                                                aria-label={t('Tabs.CloseTabAria')}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent className="w-44">{renderMenuItems(tab, ContextMenuItem, ContextMenuSeparator)}</ContextMenuContent>
                                </ContextMenu>
                            );
                        })}
                    </div>

                    
                    <ScrollBar orientation="horizontal" className="h-2" />
                </ScrollArea>

                
                <div className="flex-none w-10 h-full grid place-items-center">
                    <button
                        className="w-full h-full grid place-items-center
                                   text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => void handleAddTab()}
                        aria-label={t('Tabs.AddTabAria')}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            
            <Dialog
                open={renameDialogOpen}
                onOpenChange={open => {
                    setRenameDialogOpen(open);
                    if (!open) {
                        setRenameTarget(null);
                        setSubmittingRename(false);
                        setRenameDraft('');
                    } else if (renameTarget) {
                        setRenameDraft(renameTarget.tabName as string);
                    }
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t('Tabs.RenameDialogTitle')}</DialogTitle>
                        <DialogDescription>{t('Tabs.RenameDialogDescription')}</DialogDescription>
                    </DialogHeader>
                    <Input
                        value={renameDraft}
                        autoFocus
                        disabled={submittingRename}
                        onChange={e => setRenameDraft(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRenameConfirm();
                            }
                        }}
                        placeholder={t('Tabs.RenamePlaceholder')}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameDialogOpen(false)} disabled={submittingRename}>
                            {t('Actions.Cancel')}
                        </Button>
                        <Button onClick={handleRenameConfirm} disabled={submittingRename || !renameDraft.trim()}>
                            {submittingRename && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {t('Actions.Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
