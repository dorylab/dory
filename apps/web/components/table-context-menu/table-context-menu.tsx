'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, Copy, Loader2, Pencil, Play, TerminalSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/registry/new-york-v4/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/registry/new-york-v4/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';

import type { RenameTableTarget, TableContextTarget } from './types';

type TableContextMenuProps = {
    children: ReactNode;
    target: TableContextTarget;
    onNewQuery?: () => void | Promise<void>;
    onQuickQuery?: (target: TableContextTarget) => void | Promise<void>;
    onRename?: (target: RenameTableTarget) => void | Promise<void>;
    onImport?: (target: TableContextTarget) => void | Promise<void>;
};

export function TableContextMenu({ children, target, onNewQuery, onQuickQuery, onRename, onImport }: TableContextMenuProps) {
    const t = useTranslations('SQLConsoleSidebar');
    const importT = useTranslations('ImportWizard');
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameDraft, setRenameDraft] = useState(target.unqualifiedTableName);
    const [isRenaming, setIsRenaming] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(target.tableName);
            toast.success(t('Table name copied'));
        } catch {
            toast.error(t('Copy table name failed'));
        }
    };

    const handleRenameConfirm = async () => {
        if (!onRename) return;
        const nextName = renameDraft.trim();
        if (!nextName || nextName === target.unqualifiedTableName) {
            setRenameOpen(false);
            setRenameDraft(target.unqualifiedTableName);
            return;
        }

        setIsRenaming(true);
        try {
            await onRename({ ...target, nextName });
            toast.success(t('Table renamed'));
            setRenameOpen(false);
            setRenameDraft(nextName);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('Rename table failed'));
        } finally {
            setIsRenaming(false);
        }
    };

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
                <ContextMenuContent className="w-52" data-testid="table-context-menu">
                    <ContextMenuItem disabled={!onNewQuery} onSelect={() => void onNewQuery?.()}>
                        <TerminalSquare className="mr-2 h-4 w-4" />
                        {t('Open Console')}
                    </ContextMenuItem>
                    <ContextMenuItem disabled={!onQuickQuery} onSelect={() => void onQuickQuery?.(target)}>
                        <Play className="mr-2 h-4 w-4" />
                        {t('Quick Query')}
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void handleCopy()}>
                        <Copy className="mr-2 h-4 w-4" />
                        {t('Copy')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        disabled={!onRename}
                        onSelect={() => {
                            setRenameDraft(target.unqualifiedTableName);
                            setRenameOpen(true);
                        }}
                    >
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('Rename')}
                    </ContextMenuItem>
                    <ContextMenuItem disabled={!onImport} onSelect={() => void onImport?.(target)}>
                        <ArrowDownToLine className="mr-2 h-4 w-4" />
                        {importT('ImportData')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {renameOpen ? (
                <Dialog
                    open
                    onOpenChange={open => {
                        if (!open && !isRenaming) {
                            setRenameOpen(false);
                            setRenameDraft(target.unqualifiedTableName);
                        }
                    }}
                >
                    <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle>{t('Rename table')}</DialogTitle>
                            <DialogDescription>{t('Rename table description')}</DialogDescription>
                        </DialogHeader>
                        <Input
                            value={renameDraft}
                            autoFocus
                            disabled={isRenaming}
                            onChange={event => setRenameDraft(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleRenameConfirm();
                                }
                            }}
                            placeholder={t('Table name')}
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isRenaming}
                                onClick={() => {
                                    setRenameOpen(false);
                                    setRenameDraft(target.unqualifiedTableName);
                                }}
                            >
                                {t('Cancel')}
                            </Button>
                            <Button type="button" disabled={isRenaming || !renameDraft.trim()} onClick={() => void handleRenameConfirm()}>
                                {isRenaming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {t('Rename')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            ) : null}
        </>
    );
}
