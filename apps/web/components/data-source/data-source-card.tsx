'use client';

import type { ComponentProps } from 'react';

import { cn } from '@dory/web-utils';

import { MotionHighlight } from '@/components/animate-ui/effects/motion-highlight';

export function DataSourceCard({ className, ...props }: ComponentProps<'div'>) {
    return (
        <MotionHighlight hover className="rounded-xl">
            <div data-slot="data-source-card" className={cn('group flex flex-col rounded-xl border p-3', className)} {...props} />
        </MotionHighlight>
    );
}
