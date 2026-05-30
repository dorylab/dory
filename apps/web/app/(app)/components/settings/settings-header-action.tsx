'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@dory/web-utils';

export type SettingsHeaderActionContextValue = {
    setHeaderAction: (action: ReactNode) => void;
};

export const SettingsHeaderActionContext = createContext<SettingsHeaderActionContextValue | null>(null);

export function useSettingsHeaderAction() {
    const context = useContext(SettingsHeaderActionContext);

    if (!context) {
        throw new Error('useSettingsHeaderAction must be used within SettingsHeaderActionContext');
    }

    return context;
}

export function useOptionalSettingsHeaderAction() {
    return useContext(SettingsHeaderActionContext);
}

export function SettingsPanelActionSlot({ children, className }: { children: ReactNode; className?: string }) {
    if (!children) {
        return null;
    }

    return <div className={cn('absolute top-10 right-2.5 z-10 flex size-7 items-center justify-center', className)}>{children}</div>;
}
