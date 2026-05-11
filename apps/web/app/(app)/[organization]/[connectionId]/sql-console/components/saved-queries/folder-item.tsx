'use client';

import React, { useState } from 'react';
import { ChevronRight, Folder, GripVertical, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { cn } from '@dory/web-utils';

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
    isDropTarget?: boolean;
    isAbsorbing?: boolean;
};

export function FolderItem({
    folder,
    expanded,
    onToggle,
    onRename,
    onDelete,
    children,
    t,
    dragHandleListeners,
    dragHandleAttributes,
    isDragging,
    isDropTarget,
    isAbsorbing,
}: FolderItemProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className={cn('mx-1', isDragging && 'opacity-50')}>
            <div
                className={cn(
                    'group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left',
                    'transition-[transform,background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none',
                    'border border-transparent hover:border-muted-foreground/20 hover:bg-muted/40',
                    isDropTarget && 'scale-[1.015] border-primary/35 bg-primary/8 shadow-[0_8px_24px_-18px_hsl(var(--primary)/0.55)]',
                    isAbsorbing && 'scale-[1.02] border-primary/40 bg-primary/10 shadow-[0_10px_28px_-16px_hsl(var(--primary)/0.6)]',
                )}
            >
                {dragHandleListeners && (
                    <button
                        type="button"
                        className="flex h-4 w-4 shrink-0 items-center justify-center cursor-grab opacity-30 touch-none group-hover:opacity-60 hover:!opacity-100 active:cursor-grabbing"
                        {...dragHandleListeners}
                        {...dragHandleAttributes}
                    >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                )}
                <button type="button" className="flex h-4 w-4 shrink-0 items-center justify-center" onClick={onToggle}>
                    <ChevronRight
                        className={cn(
                            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none',
                            expanded && 'rotate-90',
                            isDropTarget && 'translate-x-0.5',
                            isAbsorbing && 'translate-x-1',
                        )}
                    />
                </button>
                <button type="button" className="flex flex-1 min-w-0 items-center gap-1.5 text-left" onClick={onToggle}>
                    <Folder
                        className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground',
                            'transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none',
                            isDropTarget && 'scale-110 text-primary',
                            isAbsorbing && 'scale-[1.18] text-primary',
                        )}
                    />
                    <span
                        className={cn(
                            'truncate text-sm font-medium',
                            'transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none',
                            isDropTarget && 'translate-x-0.5',
                            isAbsorbing && 'translate-x-1',
                        )}
                    >
                        {folder.name}
                    </span>
                </button>
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className={cn(
                                'h-6 w-6 shrink-0 rounded-sm p-0 transition-opacity',
                                menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                            )}
                            onClick={e => e.stopPropagation()}
                            aria-label={t('SavedQueries.MoreActions')}
                        >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" sideOffset={8} className="min-w-32 z-50">
                        <DropdownMenuItem
                            onClick={() => {
                                setMenuOpen(false);
                                onRename(folder);
                            }}
                        >
                            {t('SavedQueries.Folders.Rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                setMenuOpen(false);
                                onDelete(folder);
                            }}
                            className="text-destructive focus:text-destructive"
                        >
                            {t('SavedQueries.Folders.DeleteFolder')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {expanded && <div className="ml-7 mt-1 space-y-0.5">{children}</div>}
        </div>
    );
}
