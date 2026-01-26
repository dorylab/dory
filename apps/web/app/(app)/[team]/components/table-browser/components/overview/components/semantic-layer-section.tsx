'use client';

import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Sparkles } from 'lucide-react';
import { SemanticGroups } from '../types';
import { AISparkIcon } from '@/components/@dory/ui/ai-spark-icon';
import { useTranslations } from 'next-intl';

type SemanticLayerSectionProps = {
    groups: SemanticGroups;
    loading?: boolean;
};

export function SemanticLayerSection({ groups, loading }: SemanticLayerSectionProps) {
    const t = useTranslations('TableBrowser');
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
                <AISparkIcon />
                {t('Semantic layer')}
            </div>
            <Card>
                <CardContent className="p-4 space-y-3">
                    {loading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-40" />
                            <Skeleton className="h-3 w-32" />
                        </div>
                    ) : (
                        ([
                            { label: t('Semantic metrics'), key: 'metrics' },
                            { label: t('Semantic dimensions'), key: 'dimensions' },
                            { label: t('Semantic time'), key: 'time' },
                            { label: t('Semantic geo'), key: 'geo' },
                            { label: t('Semantic keys'), key: 'keys' },
                        ] as const).map(item => {
                            const fields = groups[item.key];
                            return (
                                <div key={item.key} className="space-y-1">
                                    <div className="text-xs text-muted-foreground">{item.label}</div>
                                    {fields.length ? (
                                        <div className="flex flex-wrap gap-2">
                                            {fields.map(field => (
                                                <Badge key={field} variant="outline" className="px-2 py-1 text-[11px]">
                                                    {field}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-muted-foreground">—</div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
