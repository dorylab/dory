'use client';

import { AlertTriangle, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ComparisonRunClient } from '@/lib/comparison/client-types';
import { Badge } from '@/registry/new-york-v4/ui/badge';

export function dialectFamilyLabel(family: string) {
    if (family === 'postgres') return 'PostgreSQL';
    if (family === 'mysql') return 'MySQL / MariaDB';
    if (family === 'sqlite') return 'SQLite / D1';
    return family;
}

export function riskBadgeClass(readiness: string) {
    if (readiness === 'unsafe' || readiness === 'high') return 'border-destructive/30 bg-destructive/10 text-destructive';
    if (readiness === 'review_required' || readiness === 'medium') {
        return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    }
    if (readiness === 'compatible' || readiness === 'low') {
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    }
    return 'border-muted-foreground/30 bg-muted text-muted-foreground';
}

export function ComparisonRunStatus({ run }: { run: ComparisonRunClient | null }) {
    const t = useTranslations('SchemaCompare');
    if (!run) {
        return (
            <Badge variant="outline" className="text-muted-foreground">
                <Clock3 />
                {t('Status.NotRun')}
            </Badge>
        );
    }
    if (run.status === 'running') {
        return (
            <Badge variant="outline">
                <Loader2 className="animate-spin" />
                {t('Status.Running')}
            </Badge>
        );
    }
    if (run.status === 'failed') {
        return (
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                <XCircle />
                {t('Status.Failed')}
            </Badge>
        );
    }
    if (!run.summary?.totalChanges) {
        return (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 />
                {t('Status.NoChanges')}
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className={riskBadgeClass(run.summary.readiness)}>
            <AlertTriangle />
            {t('Status.ChangeCount', { count: run.summary.totalChanges })}
        </Badge>
    );
}
