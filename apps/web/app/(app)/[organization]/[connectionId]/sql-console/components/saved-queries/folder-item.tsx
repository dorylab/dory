'use client';

import React, { useState } from 'react';
import { ChevronRight, Folder, GripVertical, MoreHorizontal } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type FolderData = {
    id: string;
    name: string;
    position: number;
};

type FolderItemProps = {
    folder: FolderData;
    expanded: boolean;
    onToggle: () => void;
    onRename: (folder: FolderData) => void;
    onDelete: (folder: FolderData) => void;
    children?: React.ReactNode;
    t: (key: string) => string;
    dragHandleListeners?: Record<string, Function>;
    dragHandleAttributes?: Record<string, any>;
    isDragging?: boolean;
};

export function FolderItem({ folder, expanded, onToggle, onRename, onDelete, children, t, dragHandleListeners, dragHandleAttributes, isDragging }: FolderItemProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className={cn(isDragging && 'opacity-50')}>
            <div
                className={cn(
                    'group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left transition-colors',
                    'border border-transparent hover:border-muted-foreground/20 hover:bg-muted/40',
                )}
            >
                {dragHandleListeners && (
                    <button
                        type="button"
                        className="shrink-0 p-0.5 cursor-grab opacity-30 group-hover:opacity-60 hover:!opacity-100 active:cursor-grabbing touch-none"
                        {...dragHandleListeners}
                        {...dragHandleAttributes}
                    >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                )}
                <button
                    type="button"
                    className="shrink-0 p-0.5"
                    onClick={onToggle}
                >
                    <ChevronRight
                        className={cn(
                            'h-3.5 w-3.5 text-muted-foreground transition-transform',
                            expanded && 'rotate-90',
                        )}
                    />
                </button>
                <button
                    type="button"
                    className="flex flex-1 min-w-0 items-center gap-1.5 text-left"
                    onClick={onToggle}
                >
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{folder.name}</span>
                </button>
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className={cn(
                                'shrink-0 rounded-sm p-1 transition-opacity',
                                menuOpen
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                            )}
                            onClick={e => e.stopPropagation()}
                            aria-label={t('SavedQueries.MoreActions')}
                        >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" sideOffset={8} className="min-w-32 z-50">
                        <DropdownMenuItem onClick={() => { setMenuOpen(false); onRename(folder); }}>
                            {t('SavedQueries.Folders.Rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => { setMenuOpen(false); onDelete(folder); }}
                            className="text-destructive focus:text-destructive"
                        >
                            {t('SavedQueries.Folders.DeleteFolder')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {expanded && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                    {children}
                </div>
            )}
        </div>
    );
}
