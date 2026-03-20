'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Database } from 'lucide-react';
import { useAtom, useAtomValue } from 'jotai';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { useDatabases } from '@/hooks/use-databases';
import { buildExplorerDatabasePath } from '@/lib/explorer/build-path';
import { cn } from '@/lib/utils';
import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';

type RootViewProps = {
    organization: string;
    connectionId: string;
    catalog: string;
};

type DatabaseItem = {
    value: string;
    label: string;
};

export function RootView({ organization, connectionId, catalog }: RootViewProps) {
    const router = useRouter();
    const { databases } = useDatabases();
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);

    const items = useMemo(() => (Array.isArray(databases) ? (databases as DatabaseItem[]) : []), [databases]);
    const preferredDatabase =
        currentConnection && currentConnection.connection.id === connectionId ? currentConnection.connection.database : null;

    useEffect(() => {
        if (!preferredDatabase || items.length === 0) return;
        const matched = items.find(db => db.value === preferredDatabase);
        if (!matched) return;
        setActiveDatabase(matched.value);
        router.replace(buildExplorerDatabasePath({ organization, connectionId, catalog }, matched.value));
    }, [catalog, connectionId, items, preferredDatabase, router, setActiveDatabase, organization]);

    if (items.length === 0) {
        return (
            <div className="flex h-55 items-center justify-center rounded-lg border border-dashed m-6 text-sm text-muted-foreground">
                No databases found.
            </div>
        );
    }

    return (
        <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Databases</h1>
                    <p className="text-sm text-muted-foreground">Choose a database to explore its objects.</p>
                </div>
                <Badge variant="outline" className="text-xs">
                    {items.length} databases
                </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(db => {
                    const isActive = db.value === activeDatabase;
                    return (
                        <Link
                            key={db.value}
                            href={buildExplorerDatabasePath({ organization, connectionId, catalog }, db.value)}
                            onClick={() => setActiveDatabase(db.value)}
                            className="block"
                        >
                            <Card
                                className={cn(
                                    'h-full transition-colors',
                                    isActive ? 'border-primary/50 bg-primary/5' : 'hover:border-foreground/20 hover:bg-muted/30',
                                )}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 items-center justify-center rounded-md bg-muted/50 text-muted-foreground',
                                                    isActive && 'text-primary',
                                                )}
                                            >
                                                <Database className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">{db.label || db.value}</div>
                                                <div className="truncate text-xs text-muted-foreground">{db.value}</div>
                                            </div>
                                        </div>
                                        <span className="text-xs text-muted-foreground">Open</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
