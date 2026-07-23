'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ComparisonClient } from '@/lib/comparison/client-types';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { ComparisonForm } from '../../components/comparison-form';

export function EditComparisonClient({ organization, comparisonId }: { organization: string; comparisonId: string }) {
    const t = useTranslations('SchemaCompare');
    const comparisonQuery = useQuery({
        queryKey: ['comparison', organization, comparisonId],
        queryFn: () => executeActionClient<ComparisonClient>('comparison.get', { comparisonId }, { organizationId: organization }),
    });

    if (comparisonQuery.isLoading || !comparisonQuery.data) {
        return (
            <div className="flex h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" />
                {t('Loading')}
            </div>
        );
    }

    const comparison = comparisonQuery.data;
    if (comparison.latestRun?.status === 'running') {
        return (
            <div className="bg-n8 h-screen overflow-auto">
                <main className="container mx-auto max-w-3xl px-12 pt-8 pb-12">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('Edit.BlockedTitle')}</CardTitle>
                            <CardDescription>{t('Edit.BlockedDescription')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button asChild>
                                <Link href={`/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(comparisonId)}`}>
                                    <ArrowLeft />
                                    {t('Edit.BackToComparison')}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex max-w-5xl flex-col gap-6 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
                <header>
                    <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
                        <Link href={`/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(comparisonId)}`}>
                            <ArrowLeft />
                            {t('Edit.BackToComparison')}
                        </Link>
                    </Button>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Pencil className="h-4 w-4" />
                        {t('Edit.Eyebrow')}
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold">{t('Edit.Title')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t('Edit.Description')}</p>
                </header>
                <ComparisonForm organization={organization} comparison={comparison} />
            </main>
        </div>
    );
}
