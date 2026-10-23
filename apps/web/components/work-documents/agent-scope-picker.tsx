'use client';

import { useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import type { ConnectionType } from '@dory/shared/types/connections';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import { useQueries } from '@tanstack/react-query';
import { Brain, Check, ChevronDown, Database, Layers, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { getSidebarConfig } from '@/app/(app)/[organization]/components/sql-console-sidebar/sidebar-config';
import { getInitialDatabase, isHiddenDatabase, normalizeOption } from '@/app/(app)/[organization]/components/sql-console-sidebar/utils';

export type AgentConnection = { id: string; name: string; type: ConnectionType; defaultDatabase?: string | null };
export type AgentKnowledge = { id: string; name: string; connectionIds: string[] };

export function useAgentDatabases(organization: string, connections: AgentConnection[], scope: AnalysisScope) {
    const selected = scope.connectionIds.map(id => connections.find(connection => connection.id === id)).filter(connection => connection !== undefined);
    const queries = useQueries({
        queries: selected.map(connection => ({
            queryKey: ['data-agent-databases', organization, connection.id],
            queryFn: async ({ signal }: { signal: AbortSignal }) => {
                const result = await executeActionClient<{ databases: Array<{ value?: string; label?: string; name?: string }> }>(
                    'schema.listDatabases',
                    { connectionId: connection.id },
                    { currentConnectionId: connection.id, signal },
                );
                const config = getSidebarConfig(connection.type);
                return (result.databases ?? [])
                    .map(normalizeOption)
                    .filter(option => option !== null)
                    .filter(option => !isHiddenDatabase(option.value, config));
            },
            staleTime: 5 * 60_000,
            retry: false,
        })),
    });
    const groups = selected.map((connection, index) => {
        const query = queries[index];
        const databases = query.data ?? [];
        const value = scope.databasesByConnection?.[connection.id] ?? getInitialDatabase(databases, connection.defaultDatabase) ?? '';
        return { connection, databases, value, query, valid: databases.some(database => database.value === value) && !query.isError };
    });
    return {
        groups,
        ready: scope.connectionIds.length > 0 && scope.connectionIds.length <= 12 && groups.length === scope.connectionIds.length && groups.every(group => group.valid),
        scope: { ...scope, databasesByConnection: Object.fromEntries(groups.filter(group => group.value).map(group => [group.connection.id, group.value])) },
    };
}

export function AgentScopePicker({
    connections,
    models,
    scope,
    databases,
    disabled,
    onChange,
}: {
    connections: AgentConnection[];
    models: AgentKnowledge[];
    scope: AnalysisScope;
    databases: ReturnType<typeof useAgentDatabases>;
    disabled: boolean;
    onChange: (scope: AnalysisScope) => void;
}) {
    const t = useTranslations('WorkDocuments.ScopePicker');
    const [open, setOpen] = useState<string | null>(null);
    const sourceOptions = [
        ...connections,
        ...scope.connectionIds.filter(id => !connections.some(connection => connection.id === id)).map(id => ({ id, name: t('UnavailableSource', { id }) })),
    ];
    const sourceLabel =
        scope.connectionIds.length === 1
            ? (sourceOptions.find(connection => connection.id === scope.connectionIds[0])?.name ?? t('Sources'))
            : scope.connectionIds.length
              ? t('SourceCount', { count: scope.connectionIds.length })
              : t('Sources');
    const knowledgeLabel = models.find(model => model.id === scope.knowledgeModelId)?.name ?? t('Knowledge');
    const databaseLabel = databases.groups.length === 1 ? databases.groups[0].value || t('Databases') : t('Databases');
    const changeSources = (ids: string[], knowledgeModelId = scope.knowledgeModelId) => {
        if (disabled || ids.length > 12) return;
        onChange({
            connectionIds: ids,
            knowledgeModelId,
            databasesByConnection: Object.fromEntries(Object.entries(scope.databasesByConnection ?? {}).filter(([id]) => ids.includes(id))),
        });
    };
    const triggerClass = 'h-8 max-w-full gap-2 px-2 text-xs text-muted-foreground hover:text-foreground';
    return (
        <div className="flex flex-wrap items-center gap-1 rounded-b-xl border border-t-0 bg-muted/40 px-2 py-1.5" aria-label={t('Label')} data-testid="agent-scope-picker">
            <Popover open={!disabled && open === 'sources'} onOpenChange={value => setOpen(value ? 'sources' : null)}>
                <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" className={triggerClass} disabled={disabled} aria-label={t('Sources')} title={sourceLabel}>
                        <Layers className="size-4 shrink-0" />
                        <span className="max-w-40 truncate">{sourceLabel}</span>
                        <ChevronDown className="size-3 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
                    <Command>
                        <CommandInput placeholder={t('SearchSources')} />
                        <CommandList>
                            <CommandEmpty>{t('NoResults')}</CommandEmpty>
                            <CommandGroup heading={t('Sources')}>
                                {sourceOptions.map(connection => {
                                    const checked = scope.connectionIds.includes(connection.id);
                                    return (
                                        <CommandItem
                                            key={connection.id}
                                            aria-checked={checked}
                                            value={connection.id}
                                            keywords={[connection.name]}
                                            disabled={disabled || (!checked && scope.connectionIds.length >= 12)}
                                            onSelect={() =>
                                                changeSources(checked ? scope.connectionIds.filter(id => id !== connection.id) : [...scope.connectionIds, connection.id])
                                            }
                                        >
                                            <Database className="size-4 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate">{connection.name}</span>
                                            <span className="sr-only">{checked ? t('Selected') : t('NotSelected')}</span>
                                            {checked ? <Check className="size-4 shrink-0" /> : null}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                        <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t('SourceLimit')}</p>
                    </Command>
                </PopoverContent>
            </Popover>
            <Popover open={!disabled && open === 'knowledge'} onOpenChange={value => setOpen(value ? 'knowledge' : null)}>
                <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" className={triggerClass} disabled={disabled} aria-label={t('Knowledge')} title={knowledgeLabel}>
                        <Brain className="size-4 shrink-0" />
                        <span className="max-w-40 truncate">{knowledgeLabel}</span>
                        <ChevronDown className="size-3 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
                    <Command>
                        <CommandInput placeholder={t('SearchKnowledge')} />
                        <CommandList>
                            <CommandEmpty>{t('NoResults')}</CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    aria-checked={!scope.knowledgeModelId}
                                    onSelect={() => {
                                        changeSources(scope.connectionIds, null);
                                        setOpen(null);
                                    }}
                                >
                                    {t('NoKnowledge')}
                                    {!scope.knowledgeModelId ? <Check className="ml-auto size-4" /> : null}
                                </CommandItem>
                                {models.map(model => (
                                    <CommandItem
                                        key={model.id}
                                        aria-checked={model.id === scope.knowledgeModelId}
                                        value={model.id}
                                        keywords={[model.name]}
                                        disabled={model.connectionIds.length > 12}
                                        onSelect={() => {
                                            changeSources([...new Set(model.connectionIds)], model.id);
                                            setOpen(null);
                                        }}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{model.name}</span>
                                        {model.id === scope.knowledgeModelId ? <Check className="size-4" /> : null}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            <Popover open={!disabled && open === 'databases'} onOpenChange={value => setOpen(value ? 'databases' : null)}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        className={triggerClass}
                        disabled={disabled || !scope.connectionIds.length}
                        aria-label={t('Databases')}
                        title={databaseLabel}
                    >
                        <Database className="size-4 shrink-0" />
                        <span className="max-w-40 truncate">{databaseLabel}</span>
                        <ChevronDown className="size-3 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
                    <Command>
                        <CommandInput placeholder={t('SearchDatabases')} />
                        <CommandList>
                            <CommandEmpty>{t('NoResults')}</CommandEmpty>
                            {databases.groups.map(({ connection, databases: items, query, value, valid }) => (
                                <CommandGroup key={connection.id} heading={connection.name}>
                                    {query.isPending ? (
                                        <div role="status" className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                                            <Loader2 className="size-4 animate-spin" />
                                            {t('Loading')}
                                        </div>
                                    ) : null}
                                    {query.isError ? (
                                        <div role="alert" className="px-2 py-2 text-xs text-destructive">
                                            <p>{t('LoadFailed')}</p>
                                            <Button type="button" variant="ghost" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
                                                {t('Retry')}
                                            </Button>
                                        </div>
                                    ) : null}
                                    {!query.isPending && !query.isError && !items.length ? <p className="px-2 py-2 text-xs text-muted-foreground">{t('NoDatabases')}</p> : null}
                                    {!query.isPending && !query.isError && value && !valid && items.length ? (
                                        <p role="alert" className="px-2 py-2 text-xs text-destructive">
                                            {t('Unavailable')}
                                        </p>
                                    ) : null}
                                    {items.map(database => (
                                        <CommandItem
                                            key={database.value}
                                            aria-checked={value === database.value}
                                            value={`${connection.id}:${database.value}`}
                                            keywords={[connection.name, database.label]}
                                            aria-label={`${connection.name}: ${database.label}`}
                                            disabled={disabled || query.isError}
                                            onSelect={() => onChange({ ...scope, databasesByConnection: { ...scope.databasesByConnection, [connection.id]: database.value } })}
                                        >
                                            <span className="min-w-0 flex-1 truncate">{database.label}</span>
                                            {value === database.value ? <Check className="size-4" /> : null}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ))}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {!databases.ready ? (
                <span role="status" className="px-2 text-xs text-muted-foreground">
                    {scope.connectionIds.length ? t('CheckDatabases') : t('ChooseSources')}
                </span>
            ) : null}
        </div>
    );
}
