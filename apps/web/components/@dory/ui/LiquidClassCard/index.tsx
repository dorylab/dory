import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Check, Users, MessageSquare } from 'lucide-react';
import { LiquidGlassButton } from '../LiquidGlassButton';
import React from 'react';
import { useTranslations } from 'next-intl';

/**
 * Liquid Glass Card
 * - 带大图、雾化底部信息区、跟随发光的 Follow 按钮
 */
export function LiquidGlassCard({
    title,
    subtitle,
    image = '/hero-placeholder.png',
    stats = { likes: 106, comments: 37 },
    onFollow,
    children,
}: {
    title?: string;
    subtitle?: string;
    image?: string;
    stats?: { likes: number; comments: number };
    onFollow?: () => void;
    children: React.ReactNode;
}) {
    const t = useTranslations('DoryUI');
    const resolvedTitle = title ?? t('LiquidGlassCard.Title');
    const resolvedSubtitle = subtitle ?? t('LiquidGlassCard.Subtitle');

    return (
        <Card
            className={cn(
                'relative isolate overflow-hidden rounded-3xl border border-white/60 dark:border-white/10',
                'bg-white/30 dark:bg-white/[.06] backdrop-blur-2xl',
                'shadow-[0_24px_60px_-15px_rgba(0,0,0,.35)]',
            )}
        >
            <CardContent className="p-0">
                <div className="relative h-[380px] w-full overflow-hidden">
                    <Image alt={resolvedTitle} src={image} fill className="object-cover" />
                    {/* 玻璃雾化底部信息区 */}
                    <div
                        className={cn(
                            'absolute inset-x-4 bottom-4 rounded-3xl p-5',
                            'backdrop-blur-xl bg-gradient-to-t from-white/70 via-white/50 to-white/30',
                            'dark:from-slate-900/60 dark:via-slate-900/40 dark:to-slate-900/20',
                            'border border-white/70 dark:border-white/10',
                            'shadow-[0_12px_30px_-10px_rgba(0,0,0,.35)]',
                        )}
                    >
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                                    {resolvedTitle}
                                    <Check className="h-5 w-5 text-emerald-500" />
                                </div>
                                <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{resolvedSubtitle}</p>
                                <div className="mt-3 flex items-center gap-5 text-sm text-slate-600 dark:text-slate-300">
                                    <span className="inline-flex items-center gap-1">
                                        <Users className="h-4 w-4" />
                                        {stats.likes}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <MessageSquare className="h-4 w-4" />
                                        {stats.comments}
                                    </span>
                                </div>
                            </div>

                            <LiquidGlassButton onClick={onFollow} className="px-5 py-2 text-base min-w-24">
                                {t('LiquidGlassCard.Follow')}
                            </LiquidGlassButton>
                        </div>
                    </div>

                    {/* 卡片外围彩色氛围光 */}
                    <div
                        aria-hidden
                        className={cn(
                            'pointer-events-none absolute -inset-12 -z-10',
                            'bg-[radial-gradient(60%_60%_at_30%_20%,rgba(186,230,253,.35)_0%,transparent_60%),radial-gradient(50%_60%_at_70%_10%,rgba(196,181,253,.35)_0%,transparent_55%),radial-gradient(60%_60%_at_50%_80%,rgba(251,207,232,.35)_0%,transparent_60%)]',
                            'blur-2xl',
                        )}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
