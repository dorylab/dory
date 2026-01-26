import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Check, Users, MessageSquare } from 'lucide-react';

/**
 * Liquid Glass Button (iOS-like)
 * - 彩虹流光 + 玻璃拟态 + 内投影
 * - 可作为 <Button> 的样式变体直接复用
 */
export const LiquidGlassButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(function GlassButton({ className, children, ...props }, ref) {
    return (
        <Button
            ref={ref}
            {...props}
            className={cn(
                'relative isolate overflow-hidden rounded-2xl px-6 py-3',
                // 基础玻璃层
                'backdrop-blur-xl bg-white/35 dark:bg-white/10',
                // 立体边框
                'border border-white/60 dark:border-white/20',
                // 外投影 + 内投影（高光）
                'shadow-[0_10px_30px_-5px_rgba(0,0,0,0.25)]',
                '[box-shadow:inset_0_1px_0_0_rgba(255,255,255,.6),_0_12px_24px_-12px_rgba(0,0,0,.35)]',
                // 文字
                'text-lg font-semibold text-slate-800 dark:text-slate-100',
                // 细微按压反馈
                'active:scale-[0.98] transition-transform duration-150',
                // 可选尺寸
                'min-w-28',
                className,
            )}
        >
            {/* 彩虹流光（conic-gradient） */}
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute -inset-[1px] -z-10',
                    'bg-[conic-gradient(from_120deg_at_50%_50%,#dbeafe_0%,#c7d2fe_12%,#e9d5ff_24%,#fbcfe8_36%,#fde68a_48%,#bbf7d0_60%,#a7f3d0_72%,#bae6fd_84%,#dbeafe_100%)]',
                    'opacity-60 blur-xl',
                )}
            />

            {/* 顶部高光 */}
            <span aria-hidden className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-[18px] bg-white/20 blur-[6px]" />

            {/* 渐隐阴影基座 */}
            <span aria-hidden className="pointer-events-none absolute inset-x-6 -bottom-6 h-12 rounded-full bg-black/20 blur-2xl" />

            {children}
        </Button>
    );
});
