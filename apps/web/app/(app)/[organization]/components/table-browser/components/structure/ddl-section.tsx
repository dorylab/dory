'use client';

import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { useTranslations } from 'next-intl';

type DdlSectionProps = {
    ddl?: string | null;
    loading?: boolean;
};

export function DdlSection({ ddl, loading }: DdlSectionProps) {
    const isLoading = !!loading;
    const t = useTranslations('TableBrowser');
    const content = ddl?.trim() || t('DDL not available');

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('DDL')}</h3>
            {isLoading ? (
                <div className="space-y-2 bg-muted/50 border rounded-md p-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-24 w-full" />
                </div>
            ) : (
                <SmartCodeBlock value={content} type="sql" />
            )}
        </div>
    );
}
