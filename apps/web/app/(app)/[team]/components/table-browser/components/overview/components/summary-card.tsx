'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type SummaryCardProps = {
    summary?: string | null;
    detail?: string | null;
    loading?: boolean;
};

export function SummaryCard({ summary, detail, loading }: SummaryCardProps) {
    const [open, setOpen] = useState(false);
    const t = useTranslations('TableBrowser');

    return (
        <Card className="bg-card">
            <CardContent className="p-4 space-y-3">
                {loading ? (
                    <div className="space-y-2 text-xs text-muted-foreground">
                        <Skeleton className="h-3 w-5/6" />
                        <Skeleton className="h-3 w-3/4" />
                    </div>
                ) : (
                    <Collapsible open={open} onOpenChange={setOpen}>
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="group w-full text-left"
                                aria-label={t('Toggle detailed description')}
                            >
                                <div className="flex items-start gap-2">
                                    <p className="text-sm cursor-pointer text-muted-foreground leading-relaxed whitespace-pre-line group-hover:underline underline-offset-2 transition">
                                        {summary}
                                    </p>
                                    <ChevronDown
                                        className={cn(
                                            'mt-0.5 h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0',
                                            open ? 'rotate-180' : 'rotate-0',
                                        )}
                                    />
                                </div>
                            </button>
                        </CollapsibleTrigger>

                        <CollapsibleContent className="mt-3 border-l border-dashed pl-3">
                            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{detail}</p>
                        </CollapsibleContent>
                    </Collapsible>
                )}
            </CardContent>
        </Card>
    );
}
