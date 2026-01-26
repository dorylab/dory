'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { TableStats } from '@/types/table-info';
import { useTranslations } from 'next-intl';

type TTLCardProps = {
    stats: TableStats | null;
    loading: boolean;
};

export default function TTLCard({ stats, loading }: TTLCardProps) {
    const ttl = stats?.ttlExpression?.trim();
    const t = useTranslations('TableStats');
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('TTL')}</CardTitle>
                <CardDescription>{t('TTL description')}</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <Skeleton className="h-10 w-2/3" />
                ) : ttl ? (
                    <pre className="text-sm font-mono rounded-md bg-muted px-3 py-2 whitespace-pre-wrap break-words">{ttl}</pre>
                ) : (
                    <div className="text-sm text-muted-foreground">{t('No TTL rule configured')}</div>
                )}
            </CardContent>
        </Card>
    );
}
