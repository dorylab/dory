'use client';

import { useMemo } from 'react';
import { format as formatSql } from 'sql-formatter';
import type { ConnectionType } from '@dory/shared/types/connections';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { getSqlDialectConfigForConnectionType } from '@/lib/sql/sql-dialect';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { useTranslations } from 'next-intl';

type DdlSectionProps = {
    ddl?: string | null;
    loading?: boolean;
    connectionType?: ConnectionType;
};

function formatDdl(ddl: string, connectionType?: ConnectionType) {
    try {
        return formatSql(ddl, {
            language: getSqlDialectConfigForConnectionType(connectionType).formatterLanguage,
        }).trim();
    } catch {
        return ddl;
    }
}

export function DdlSection({ ddl, loading, connectionType }: DdlSectionProps) {
    const isLoading = !!loading;
    const t = useTranslations('TableBrowser');
    const content = useMemo(() => {
        const raw = ddl?.trim();
        return raw ? formatDdl(raw, connectionType) : t('DDL not available');
    }, [connectionType, ddl, t]);

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
