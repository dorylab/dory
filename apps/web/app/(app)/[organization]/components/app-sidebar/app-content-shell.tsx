'use client';

import { ReactNode } from 'react';

export function AppContentShell({ children }: { children: ReactNode }) {

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">
            {children}
        </div>
    );
}
