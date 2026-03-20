'use client';

import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { AiOverview } from '../types';
import { AISparkIcon } from '@/components/@dory/ui/ai-spark-icon';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { useTranslations } from 'next-intl';

type SnippetsSectionProps = {
    snippets: AiOverview['snippets'];
    loading?: boolean;
};

export function SnippetsSection({ snippets, loading }: SnippetsSectionProps) {
    const t = useTranslations('TableBrowser');
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
                <AISparkIcon />
                {t('Query snippets')}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                {loading ? (
                    Array.from({ length: 2 }).map((_, idx) => (
                        <Card key={idx}>
                            <CardContent className="p-4 space-y-3">
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-24 w-full" />
                            </CardContent>
                        </Card>
                    ))
                ) : snippets.length ? (
                    snippets.map((snippet, idx) => (
                        
                        <Card key={snippet.title ?? idx}>
                            <CardContent className="p-4 space-y-3">
                                <SmartCodeBlock className="min-h-8" value={snippet.sql} label={snippet.title || t('SQL example')} />
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="text-sm text-muted-foreground">{t('No SQL snippets yet')}</div>
                )}
            </div>
        </div>
    );
}
