'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageLayout({
    children,
    className,
    maxWidthClassName = 'max-w-7xl',
    padded = true,
    /** 让 PageHeader 的 sticky 顶部偏移；数字会转 px，也可传 '56px' 或 'var(--topbar-h)' */
    headerOffset = 0,
    /** 若你的页面真实滚动容器在更外层导致 sticky 失效，可临时开启为此容器创建滚动上下文 */
    scrollable = false,
}: {
    children: ReactNode;
    className?: string;
    maxWidthClassName?: string;
    padded?: boolean;
    headerOffset?: number | string;
    scrollable?: boolean;
}) {
    const offset = typeof headerOffset === 'number' ? `${headerOffset}px` : headerOffset || '0px';

    return (
        <div
            style={{ ['--page-header-offset' as any]: offset }}
            className={cn(
                'mx-auto w-full',
                maxWidthClassName,
                padded && 'px-6 pb-4',
                scrollable && 'min-h-0 overflow-y-auto', // 可选：将此容器设为滚动容器
                className,
            )}
        >
            {children}
        </div>
    );
}
