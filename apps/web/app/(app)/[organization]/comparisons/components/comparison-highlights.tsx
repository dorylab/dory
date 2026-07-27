'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { riskBadgeClass } from './comparison-status';

type DiffRow = {
    changeId: string;
    objectType: string;
    objectPath: string;
    changeType: string;
    currentValue: string | null;
    desiredValue: string | null;
    riskLevel: string;
    riskReason: string;
};

export function ComparisonHighlights({ organization, comparisonId, runId, resultSetId }: { organization: string; comparisonId: string; runId: string; resultSetId: string }) {
    const t = useTranslations('SchemaCompare');
    const organizationId = useOrganizationId();
    const rowsQuery = useQuery({
        queryKey: ['comparison-highlights', organizationId, resultSetId],
        queryFn: () =>
            executeActionClient<{ rows: DiffRow[] }>(
                'resultSet.rows.read',
                {
                    resultSetId,
                    offset: 0,
                    limit: 5,
                    sorts: [
                        { column: 'breaking', direction: 'desc' },
                        { column: 'riskLevel', direction: 'asc' },
                    ],
                    filters: [],
                    search: null,
                },
                { organizationId },
            ),
    });

    return (
        <Card className="gap-0 py-0">
            <CardHeader className="items-center px-4 pt-4 pb-3">
                <CardTitle className="text-base">{t('Detail.Highlights')}</CardTitle>
                <CardAction>
                    <Button asChild variant="ghost" size="sm" className="whitespace-nowrap">
                        <Link href={`/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(comparisonId)}/runs/${encodeURIComponent(runId)}`}>
                            {t('Detail.ViewDiff')}
                            <ArrowRight />
                        </Link>
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="px-4 pb-4">
                {rowsQuery.isLoading ? (
                    <div className="flex h-20 items-center justify-center text-muted-foreground">
                        <Loader2 className="animate-spin" />
                    </div>
                ) : (
                    <div className="divide-y">
                        {(rowsQuery.data?.rows ?? []).map(row => (
                            <div key={row.changeId} className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <div className="min-w-0">
                                    <div className="truncate font-mono text-sm font-medium">{row.objectPath}</div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {row.changeType} · {row.currentValue ?? '∅'} → {row.desiredValue ?? '∅'}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">{row.riskReason}</p>
                                </div>
                                <Badge variant="outline" className={`self-start ${riskBadgeClass(row.riskLevel)}`}>
                                    {row.riskLevel}
                                </Badge>
                            </div>
                        ))}
                        {!rowsQuery.data?.rows.length ? <p className="text-sm text-muted-foreground">{t('Status.NoChanges')}</p> : null}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
