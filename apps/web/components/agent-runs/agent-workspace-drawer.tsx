'use client';

import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/registry/new-york-v4/ui/drawer';

export function AgentWorkspaceDrawer({ children, closeHref }: { children: ReactNode; closeHref: string }) {
    const router = useRouter();

    const closeDrawer = useCallback(() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
            return;
        }
        router.replace(closeHref, { scroll: false });
    }, [closeHref, router]);

    return (
        <Drawer direction="right" open onOpenChange={open => !open && closeDrawer()}>
            <DrawerContent className="!inset-0 !h-dvh !w-screen !max-w-none !rounded-none !border-0 !p-0">
                <DrawerTitle className="sr-only">Agent Run workspace</DrawerTitle>
                <DrawerDescription className="sr-only">SQL workspace for this Agent Run.</DrawerDescription>
                {children}
            </DrawerContent>
        </Drawer>
    );
}
