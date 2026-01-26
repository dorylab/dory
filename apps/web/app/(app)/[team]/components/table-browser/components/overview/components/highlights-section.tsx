'use client';

import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Sparkles } from 'lucide-react';
import { AiOverview } from '../types';
import { AISparkIcon } from '@/components/@dory/ui/ai-spark-icon';
import { useTranslations } from 'next-intl';

type HighlightsSectionProps = {
    highlights: AiOverview['highlights'];
    loading?: boolean;
};

export function HighlightsSection({ highlights, loading }: HighlightsSectionProps) {
    const t = useTranslations('TableBrowser');
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
                <AISparkIcon />
                {t('Key highlights')}
            </div>
            <Card>
                <CardContent className="p-4 space-y-3">
                    {loading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-2/3" />
                            <Skeleton className="h-3 w-1/2" />
                            <Skeleton className="h-3 w-3/4" />
                        </div>
                    ) : highlights.length ? (
                        highlights.map(item => (
                            <div key={item.field} className="flex items-start gap-3">
                                <Badge variant="outline" className="mt-0.5 px-2 py-1 text-[11px]">
                                    {item.field}
                                </Badge>
                                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                            </div>
                        ))
                    ) : (
                        <div className="text-sm text-muted-foreground">{t('No highlights yet')}</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
