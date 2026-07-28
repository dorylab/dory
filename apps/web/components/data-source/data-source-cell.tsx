'use client';

import { CircleUserRound, Database, Link2, Plug, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@dory/web-utils';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/registry/new-york-v4/ui/hover-card';
import { DatabaseTypeIcon, getDatabaseTypeMeta } from '@/app/(app)/[organization]/connections/components/database-type-icon';

export type DataSourceCellInfo = {
    connectionId?: string | null;
    connectionName?: string | null;
    connectionType?: string | null;
    connectionHost?: string | null;
    connectionPort?: number | null;
    connectionHttpPort?: number | null;
    connectionEndpoint?: string | null;
    databaseName?: string | null;
    identityName?: string | null;
    identityUsername?: string | null;
    identityRole?: string | null;
    source?: string | null;
};

export function DataSourceCell({ dataSource, emptyLabel = 'Unknown', className }: { dataSource: DataSourceCellInfo; emptyLabel?: string; className?: string }) {
    const connectionLabel = dataSource.connectionName || dataSource.connectionId || emptyLabel;
    const connectionType = dataSource.connectionType ?? 'unknown';
    const typeMeta = getDatabaseTypeMeta(connectionType);
    const typeLabel = dataSource.connectionType ? typeMeta.label : 'Unknown';
    const hostPortLabel = formatHostPort(dataSource);
    const detailRows = [
        { label: 'Endpoint', value: hostPortLabel, icon: Link2 },
        { label: 'Database', value: dataSource.databaseName, icon: Database },
        { label: 'User', value: dataSource.identityUsername || dataSource.identityName || null, icon: CircleUserRound },
        { label: 'Role', value: dataSource.identityRole, icon: User },
        { label: 'Source', value: dataSource.source, icon: Plug },
    ].filter(row => row.value);

    return (
        <HoverCard openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
                <div
                    className={cn(
                        'group flex w-fit max-w-[280px] cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                        className,
                    )}
                    tabIndex={0}
                >
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-background transition-colors group-hover:border-foreground/30">
                        <DatabaseTypeIcon type={connectionType} className="max-h-4 max-w-4" fallbackClassName="text-[10px]" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-medium text-foreground transition-colors group-hover:text-foreground" title={connectionLabel}>
                            {connectionLabel}
                        </div>
                    </div>
                </div>
            </HoverCardTrigger>
            <HoverCardContent align="start" side="right" className="w-80 p-3">
                <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                        <DatabaseTypeIcon type={connectionType} className="max-h-6 max-w-6" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{connectionLabel}</div>
                        <div className="text-xs text-muted-foreground">{typeLabel}</div>
                    </div>
                </div>
                {detailRows.length ? (
                    <div className="mt-3 space-y-1.5">
                        {detailRows.map(row => (
                            <DetailRow key={row.label} icon={row.icon} label={row.label} value={String(row.value)} />
                        ))}
                    </div>
                ) : null}
            </HoverCardContent>
        </HoverCard>
    );
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
    return (
        <div className="grid grid-cols-[124px_minmax(0,1fr)] gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{label}</span>
            </span>
            <span className="truncate font-medium" title={value}>
                {value}
            </span>
        </div>
    );
}

function formatHostPort(dataSource: DataSourceCellInfo) {
    if (dataSource.connectionEndpoint) return dataSource.connectionEndpoint;

    const host = dataSource.connectionHost?.trim();
    if (!host) return null;

    const port = dataSource.connectionPort ?? dataSource.connectionHttpPort;
    return port ? `${host}:${port}` : host;
}
