'use client';

import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/registry/new-york-v4/ui/drawer';

export function AgentWorkspaceDrawer({ children, closeHref }: { children: ReactNode; closeHref: string }) {
    const t = useTranslations('AgentRuns');
    const router = useRouter();

    const closeDrawer = useCallback(() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
            return;
        }
        router.replace(closeHref, { scroll: false });
    }, [closeHref, router]);

    return (
        <Drawer direction="bottom" dismissible={false} handleOnly open onOpenChange={open => !open && closeDrawer()}>
            <DrawerContent className="!inset-0 !m-0 !h-dvh !max-h-none !w-screen !max-w-none !rounded-none !border-0 !p-0 [&>div:first-child]:!hidden">
                <DrawerTitle className="sr-only">{t('WorkspaceDrawer.Title')}</DrawerTitle>
                <DrawerDescription className="sr-only">{t('WorkspaceDrawer.Description')}</DrawerDescription>
                {children}
            </DrawerContent>
        </Drawer>
    );
}
