import Link from 'next/link';
import { ArrowLeft, GitCompareArrows } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/registry/new-york-v4/ui/button';
import { ComparisonForm } from '../components/comparison-form';

export default async function NewComparisonPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    const t = await getTranslations('SchemaCompare');

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex max-w-5xl flex-col gap-6 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
                <header>
                    <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
                        <Link href={`/${encodeURIComponent(organization)}/comparisons`}>
                            <ArrowLeft />
                            {t('Back')}
                        </Link>
                    </Button>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <GitCompareArrows className="h-4 w-4" />
                        {t('Create.Eyebrow')}
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold">{t('Create.Title')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t('Create.Description')}</p>
                </header>
                <ComparisonForm organization={organization} />
            </main>
        </div>
    );
}
