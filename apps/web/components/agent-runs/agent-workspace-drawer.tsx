'use client';

import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, X } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/registry/new-york-v4/ui/drawer';

export function AgentWorkspaceDrawer({
    children,
    closeHref,
    title,
    description,
    backLabel,
    closeLabel,
}: {
    children: ReactNode;
    closeHref: string;
    title?: string;
    description?: string;
    backLabel?: string;
    closeLabel?: string;
}) {
    const t = useTranslations('AgentRuns');
    const router = useRouter();
    const resolvedTitle = title ?? t('WorkspaceDrawer.Title');
    const resolvedDescription = description ?? t('WorkspaceDrawer.Description');
    const resolvedBackLabel = backLabel ?? t('WorkspaceDrawer.Back');
    const resolvedCloseLabel = closeLabel ?? t('WorkspaceDrawer.Close');

    const closeDrawer = useCallback(() => {
        router.replace(closeHref, { scroll: false });
    }, [closeHref, router]);

    return (
        <Drawer direction="bottom" dismissible={false} handleOnly open onOpenChange={open => !open && closeDrawer()}>
            <DrawerContent className="!inset-0 !m-0 !h-dvh !max-h-none !w-screen !max-w-none !overflow-hidden !rounded-none !border-0 !p-0 shadow-2xl sm:!inset-2 sm:!h-auto sm:!w-auto sm:!rounded-xl sm:!border [&>div:first-child]:!hidden">
                <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-background px-2.5">
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={closeDrawer}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        <span>{resolvedBackLabel}</span>
                    </Button>
                    <div className="min-w-0 flex-1 text-center">
                        <DrawerTitle className="truncate text-sm font-medium">{resolvedTitle}</DrawerTitle>
                        <DrawerDescription className="sr-only">{resolvedDescription}</DrawerDescription>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={closeDrawer} aria-label={resolvedCloseLabel} title={resolvedCloseLabel}>
                        <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </header>
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </DrawerContent>
        </Drawer>
    );
}
