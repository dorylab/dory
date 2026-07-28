'use client';

import { useTranslations } from 'next-intl';

import type { SchemaComparisonSummary, SchemaSnapshotCoverage } from '@dory/schema-compare';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { riskBadgeClass } from './comparison-status';

const COVERAGE_KIND_KEYS = {
    tables: 'Coverage.Kind.Tables',
    columns: 'Coverage.Kind.Columns',
    indexes: 'Coverage.Kind.Indexes',
    constraints: 'Coverage.Kind.Constraints',
    views: 'Coverage.Kind.Views',
    statistics: 'Coverage.Kind.Statistics',
} as const;

const COVERAGE_STATUS_KEYS = {
    complete: 'Coverage.Status.Complete',
    partial: 'Coverage.Status.Partial',
    unavailable: 'Coverage.Status.Unavailable',
    not_applicable: 'Coverage.Status.NotApplicable',
} as const;

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
    return (
        <div className="bg-card px-4 py-3.5">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
        </div>
    );
}

export function ComparisonSummary({ summary, coverage }: { summary: SchemaComparisonSummary; coverage?: SchemaSnapshotCoverage | null }) {
    const t = useTranslations('SchemaCompare');
    const warnings = Math.max(0, summary.highRisk + summary.mediumRisk - summary.breakingChanges);
    const compatible = Math.max(0, summary.totalChanges - summary.breakingChanges - warnings);

    return (
        <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="p-0">
                <section className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
                    <Metric label={t('Summary.Changes')} value={summary.totalChanges} />
                    <Metric label={t('Summary.Compatible')} value={compatible} tone="text-emerald-600 dark:text-emerald-300" />
                    <Metric label={t('Summary.Warnings')} value={warnings} tone="text-amber-600 dark:text-amber-300" />
                    <Metric label={t('Summary.Breaking')} value={summary.breakingChanges} tone="text-destructive" />
                    <div className="bg-card px-4 py-3.5 sm:col-span-2 lg:col-span-1">
                        <div className="text-xs text-muted-foreground">{t('Summary.Readiness')}</div>
                        <Badge variant="outline" className={`mt-1.5 ${riskBadgeClass(summary.readiness)}`}>
                            {summary.readiness}
                        </Badge>
                    </div>
                </section>
                {coverage ? (
                    <div className="flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5">
                        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Detail.Coverage')}</span>
                        {Object.entries(coverage).map(([kind, status]) => (
                            <Badge key={kind} variant={status === 'complete' || status === 'not_applicable' ? 'secondary' : 'outline'} className="h-5 px-2 text-[11px] font-normal">
                                {t(COVERAGE_KIND_KEYS[kind as keyof typeof COVERAGE_KIND_KEYS])}: {t(COVERAGE_STATUS_KEYS[status])}
                            </Badge>
                        ))}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
