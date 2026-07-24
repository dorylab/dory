'use client';

import { createContext, useContext } from 'react';

const OrganizationIdContext = createContext<string | null>(null);

export function OrganizationIdProvider({ children, organizationId }: { children: React.ReactNode; organizationId: string }) {
    return <OrganizationIdContext.Provider value={organizationId}>{children}</OrganizationIdContext.Provider>;
}

export function useOrganizationId() {
    const organizationId = useContext(OrganizationIdContext);

    if (!organizationId) {
        throw new Error('useOrganizationId must be used within an OrganizationIdProvider');
    }

    return organizationId;
}
