'use client';

import { createContext, useContext } from 'react';

export type AppCapabilities = {
    isOffline: boolean;
    canUseCloudFeatures: boolean;
};

const AppCapabilitiesContext = createContext<AppCapabilities>({
    isOffline: false,
    canUseCloudFeatures: true,
});

export function AppCapabilitiesProvider({
    children,
    value,
}: {
    children: React.ReactNode;
    value: AppCapabilities;
}) {
    return <AppCapabilitiesContext.Provider value={value}>{children}</AppCapabilitiesContext.Provider>;
}

export function useAppCapabilities() {
    return useContext(AppCapabilitiesContext);
}
