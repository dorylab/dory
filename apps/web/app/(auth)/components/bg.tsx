'use client';

import type { ReactNode } from 'react';

import { AuroraBackground } from '@/components/ui/aurora-background';
import { cn } from '@dory/web-utils';

export function HeroBackground({
    className,
    children,
}: {
    className?: string;
    children?: ReactNode;
}) {
    return (
        <AuroraBackground className={cn('h-full w-full bg-zinc-50 dark:bg-[#050814]', className)}>
            <div className="pointer-events-none absolute inset-0 bg-white/34 dark:bg-[#050814]/28" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_bottom,transparent_0%,rgba(255,255,255,0.72)_58%,#ffffff_100%)] dark:bg-[linear-gradient(to_bottom,transparent_0%,rgba(5,8,20,0.5)_58%,#050814_100%)]" />
            {children ? <div className="relative z-10">{children}</div> : null}
        </AuroraBackground>
    );
}
