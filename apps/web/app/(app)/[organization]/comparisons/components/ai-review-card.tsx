'use client';

import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ComparisonRunClient } from '@/lib/comparison/client-types';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';

export function AiReviewCard({ run, retrying, onRetry }: { run: ComparisonRunClient; retrying: boolean; onRetry: () => void }) {
    const t = useTranslations('SchemaCompare');
    const review = run.aiReview;
    const canRetry = ['pending', 'failed', 'unavailable'].includes(run.aiReviewStatus);

    return (
        <Card className="gap-0 border-violet-500/20 py-0">
            <CardHeader className="px-4 pt-4 pb-3">
                <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                        <Sparkles className="size-4" />
                    </div>
                    <div className="min-w-0">
                        <CardTitle className="text-base">{t('AI.Title')}</CardTitle>
                        <CardDescription className="mt-1">{t('AI.Description')}</CardDescription>
                    </div>
                </div>
                {canRetry ? (
                    <CardAction>
                        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
                            {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            {run.aiReviewStatus === 'pending' ? t('AI.Generate') : t('AI.Retry')}
                        </Button>
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 px-4 pb-4">
                {run.aiReviewStatus === 'not_needed' ? (
                    <p className="rounded-lg bg-violet-500/5 px-3 py-2.5 text-sm text-muted-foreground">{t('AI.NotNeeded')}</p>
                ) : run.aiReviewStatus === 'pending' || run.aiReviewStatus === 'running' ? (
                    <div className="flex items-center rounded-lg bg-violet-500/5 px-3 py-2.5 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('AI.Generating')}
                    </div>
                ) : review ? (
                    <>
                        <p className="rounded-lg bg-violet-500/5 px-3 py-2.5 text-sm leading-6">{review.summary}</p>
                        {review.risks.length ? (
                            <div>
                                <h3 className="mb-2 text-sm font-medium">{t('AI.Risks')}</h3>
                                <ul className="grid gap-2 text-sm text-muted-foreground">
                                    {review.risks.map(risk => (
                                        <li key={risk.changeId}>
                                            <span className="font-mono text-xs text-foreground">{risk.changeId}</span> — {risk.explanation}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {review.recommendations.length ? (
                            <div>
                                <h3 className="mb-2 text-sm font-medium">{t('AI.Recommendations')}</h3>
                                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                    {review.recommendations.map(item => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {review.limitations.length ? (
                            <div>
                                <h3 className="mb-2 text-sm font-medium">{t('AI.Limitations')}</h3>
                                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                    {review.limitations.map(item => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <div className="text-sm text-muted-foreground">
                        <p>{run.aiReviewError ?? (run.aiReviewStatus === 'unavailable' ? t('AI.Unavailable') : t('AI.Failed'))}</p>
                        <p className="mt-1">{t('AI.DiffUnaffected')}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
