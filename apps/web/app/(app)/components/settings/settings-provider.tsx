'use client';

import * as React from 'react';
import { SettingsModal } from './SettingsModal';
import type { CategoryKey } from './types';

type SettingsContextValue = {
    open: boolean;
    activeCategory: CategoryKey;
    openSettings: (category?: CategoryKey) => void;
    closeSettings: () => void;
};

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
    children,
    includeOrganizationSettings = false,
    includeBillingSettings = false,
    billingManagementAvailable = false,
    desktopBillingHandoff = false,
}: {
    children: React.ReactNode;
    includeOrganizationSettings?: boolean;
    includeBillingSettings?: boolean;
    billingManagementAvailable?: boolean;
    desktopBillingHandoff?: boolean;
}) {
    const [open, setOpen] = React.useState(false);
    const [activeCategory, setActiveCategory] = React.useState<CategoryKey>('appearance');

    const openSettings = React.useCallback((category: CategoryKey = 'appearance') => {
        setActiveCategory(category);
        setOpen(true);
    }, []);

    const closeSettings = React.useCallback(() => {
        setOpen(false);
    }, []);

    const value = React.useMemo<SettingsContextValue>(
        () => ({
            open,
            activeCategory,
            openSettings,
            closeSettings,
        }),
        [open, activeCategory, openSettings, closeSettings],
    );

    return (
        <SettingsContext.Provider value={value}>
            {children}
            <SettingsModal
                open={open}
                onOpenChange={setOpen}
                activeCategory={activeCategory}
                onActiveCategoryChange={setActiveCategory}
                includeOrganizationSettings={includeOrganizationSettings}
                includeBillingSettings={includeBillingSettings}
                billingManagementAvailable={billingManagementAvailable}
                desktopBillingHandoff={desktopBillingHandoff}
            />
        </SettingsContext.Provider>
    );
}

export function useSettings(): SettingsContextValue {
    const context = React.useContext(SettingsContext);

    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }

    return context;
}
