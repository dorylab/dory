'use client';

import { useTranslations } from 'next-intl';

import type { SchemaComparisonSummary, SchemaSnapshotCoverage } from '@dory/schema-compare';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { riskBadgeClass } from './comparison-status';

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
    return (
        <Card>
            <CardContent className="pt-5">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
            </CardContent>
        </Card>
    );
}

export function ComparisonSummary({ summary, coverage }: { summary: SchemaComparisonSummary; coverage?: SchemaSnapshotCoverage | null }) {
    const t = useTranslations('SchemaCompare');
    const warnings = Math.max(0, summary.highRisk + summary.mediumRisk - summary.breakingChanges);
    const compatible = Math.max(0, summary.totalChanges - summary.breakingChanges - warnings);

    return (
        <div className="grid gap-3">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label={t('Summary.Changes')} value={summary.totalChanges} />
                <Metric label={t('Summary.Compatible')} value={compatible} tone="text-emerald-600 dark:text-emerald-300" />
                <Metric label={t('Summary.Warnings')} value={warnings} tone="text-amber-600 dark:text-amber-300" />
                <Metric label={t('Summary.Breaking')} value={summary.breakingChanges} tone="text-destructive" />
                <Card>
                    <CardContent className="pt-5">
                        <div className="text-sm text-muted-foreground">{t('Summary.Readiness')}</div>
                        <Badge variant="outline" className={`mt-2 ${riskBadgeClass(summary.readiness)}`}>
                            {summary.readiness}
                        </Badge>
                    </CardContent>
                </Card>
            </section>
            {coverage ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3">
                    <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Detail.Coverage')}</span>
                    {Object.entries(coverage).map(([kind, status]) => (
                        <Badge key={kind} variant={status === 'complete' || status === 'not_applicable' ? 'secondary' : 'outline'}>
                            {kind}: {status}
                        </Badge>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
