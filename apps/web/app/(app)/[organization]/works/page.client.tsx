'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BriefcaseBusiness, Search } from 'lucide-react';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { useConnections } from '../connections/hooks/use-connections';
import type { Work } from './types';
import { formatRelativeTime, statusClassName, statusLabel } from './utils';

type WorkPageClientProps = {
    organization: string;
};

export function WorkPageClient({ organization }: WorkPageClientProps) {
    const [search, setSearch] = useState('');
    const connectionsQuery = useConnections();
    const worksQuery = useQuery({
        queryKey: ['works'],
        queryFn: async () => {
            const result = await executeActionClient<{ works: Work[] }>('work.list', { limit: 100 });
            return result.works ?? [];
        },
    });

    const connectionById = useMemo(() => new Map((connectionsQuery.data ?? []).map(item => [item.connection.id, item.connection])), [connectionsQuery.data]);
    const filteredWorks = useMemo(() => {
        const query = search.trim().toLowerCase();
        const works = worksQuery.data ?? [];
        if (!query) return works;
        return works.filter(work => {
            const connectionName = connectionById.get(work.connectionId)?.name ?? '';
            return `${work.title} ${work.goal} ${connectionName}`.toLowerCase().includes(query);
        });
    }, [connectionById, search, worksQuery.data]);

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <div className="container mx-auto mt-10 p-12 lg:p-12 xl:p-8 2xl:p-4">
                <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="mb-2 text-2xl font-bold">Work</h1>
                        <p className="text-sm text-muted-foreground">Track goals, investigations, and conclusions for shared human and Agent work.</p>
                    </div>
                    <Button asChild className="w-fit cursor-pointer">
                        <Link href={`/${organization}/works/new`}>
                            <BriefcaseBusiness />
                            New Work
                        </Link>
                    </Button>
                </header>

                <div className="relative mb-6 max-w-xl">
                    <Input value={search} onChange={event => setSearch(event.target.value)} className="peer ps-9" placeholder="Search Work" type="text" />
                    <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                        <Search size={16} />
                    </div>
                </div>

                {worksQuery.isLoading ? (
                    <div className="grid gap-3">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : filteredWorks.length ? (
                    <div className="grid gap-3">
                        {filteredWorks.map(work => {
                            const connection = connectionById.get(work.connectionId);
                            return (
                                <Link
                                    key={work.id}
                                    href={`/${organization}/works/${work.id}`}
                                    className="group rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-accent/40"
                                >
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="truncate text-base font-semibold">{work.title}</h2>
                                                <Badge variant="outline" className={statusClassName(work.status)}>
                                                    {statusLabel(work.status)}
                                                </Badge>
                                            </div>
                                            <p className="line-clamp-2 text-sm text-muted-foreground">{work.goal}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {connection?.name ?? 'Unknown data source'} · Updated {formatRelativeTime(work.updatedAt)}
                                            </p>
                                        </div>
                                        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed bg-card p-10 text-center">
                        <h2 className="text-base font-semibold">No Work yet</h2>
                        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Create a Work item when you want a durable goal, investigations, and final conclusion around a data question.</p>
                        <Button asChild className="mt-5">
                            <Link href={`/${organization}/works/new`}>New Work</Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
