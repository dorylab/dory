'use client';
import { ReactNode } from 'react';
export function PageActions({ children }: { children: ReactNode }) {
    return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
