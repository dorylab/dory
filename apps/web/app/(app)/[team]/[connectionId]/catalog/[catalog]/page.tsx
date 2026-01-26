'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Database } from 'lucide-react';
import { useAtom } from 'jotai';
import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { useDatabases } from '@/hooks/use-databases';
import { activeDatabaseAtom } from '@/shared/stores/app.store';
import { cn } from '@/lib/utils';

const DEFAULT_CATALOG = 'default';

type DatabaseItem = {
    value: string;
    label: string;
};

function resolveParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

export default function DatabasesPage() {
    const params = useParams<{
        team?: string | string[];
        connectionId?: string | string[];
        catalog?: string | string[];
    }>();
    const team = resolveParam(params?.team);
    const connectionId = resolveParam(params?.connectionId);
    const catalog = resolveParam(params?.catalog) ?? DEFAULT_CATALOG;
    const isDefaultCatalog = catalog === DEFAULT_CATALOG;
    const { databases } = useDatabases();
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const t = useTranslations('Catalog');

    const items = useMemo(() => (Array.isArray(databases) ? (databases as DatabaseItem[]) : []), [databases]);
    const basePath =
        team && connectionId
            ? `/${encodeURIComponent(team)}/${encodeURIComponent(connectionId)}/catalog/${encodeURIComponent(catalog)}`
            : null;

    return (
        <div className="p-6 h-full flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-semibold">{t('Databases')}</h1>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {isDefaultCatalog ? t('Select database description') : t('Catalog list unsupported')}
                    </p>
                </div>
                {isDefaultCatalog ? (
                    <Badge variant="outline" className="text-xs">
                        {t('Database count', { count: items.length })}
                    </Badge>
                ) : null}
            </div>

            {!isDefaultCatalog ? (
                <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    {t('Only default catalog supported')}
                </div>
            ) : items.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    {t('No databases')}
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(db => {
                        const name = db.label || db.value;
                        const isActive = db.value === activeDatabase;
                        const card = (
                            <Card
                                className={cn(
                                    'h-full transition-colors',
                                    isActive
                                        ? 'border-primary/50 bg-primary/5'
                                        : 'hover:border-foreground/20 hover:bg-muted/30',
                                )}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 items-center justify-center rounded-md bg-muted/50 text-muted-foreground',
                                                    isActive && 'text-primary',
                                                )}
                                            >
                                                <Database className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium truncate">{name}</div>
                                        <div className="text-xs text-muted-foreground truncate">{db.value}</div>
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground">{t('Open')}</span>
                            </div>
                        </CardContent>
                    </Card>
                        );

                        if (!basePath) {
                            return (
                                <div key={db.value}>{card}</div>
                            );
                        }

                        return (
                            <Link
                                key={db.value}
                                href={`${basePath}/${encodeURIComponent(db.value)}`}
                                onClick={() => setActiveDatabase(db.value)}
                                className="block"
                            >
                                {card}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
