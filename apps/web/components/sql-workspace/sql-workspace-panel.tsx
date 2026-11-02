'use client';

import type { ReactNode, Ref } from 'react';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';

export type SqlWorkspacePanelAction = {
    label: string;
    icon: ReactNode;
    disabled?: boolean;
    onSelect: () => void;
};

/** Shared details panel, including its navigation, actions and scrolling body. */
export function SqlWorkspacePanel({
    title,
    back,
    actionsLabel,
    actions,
    children,
    bodyRef,
    label,
}: {
    title: string;
    back: { label: string; onClick: () => void; id?: string };
    actionsLabel: string;
    actions: SqlWorkspacePanelAction[];
    children: ReactNode;
    bodyRef?: Ref<HTMLDivElement>;
    label?: string;
}) {
    return (
        <section className="flex h-full w-full min-w-0 flex-col bg-card shadow-xl" aria-label={label} data-testid="sql-workspace-panel">
            <div className="flex h-16 shrink-0 items-center justify-between border-b px-3">
                <div className="min-w-0">
                    <Button id={back.id} variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={back.onClick}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        {back.label}
                    </Button>
                    <div className="truncate px-0.5 text-sm font-semibold" title={title}>
                        {title}
                    </div>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={actionsLabel}>
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuGroup>
                            {actions.map(action => (
                                <DropdownMenuItem key={action.label} disabled={action.disabled} onSelect={action.onSelect}>
                                    {action.icon}
                                    {action.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4">
                {children}
            </div>
        </section>
    );
}

export function SqlWorkspacePanelToggle({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
    return (
        <Button size="icon" variant={active ? 'default' : 'ghost'} className="group h-8 w-8" onClick={onClick} title={label} aria-label={label} aria-pressed={active}>
            {children}
        </Button>
    );
}
