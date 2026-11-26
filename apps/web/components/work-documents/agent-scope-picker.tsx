'use client';

import { useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import type { ConnectionType } from '@dory/shared/types/connections';
import { getAnalysisDatabases } from '@dory/shared/utils/analysis-scope';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import { useQueries } from '@tanstack/react-query';
import { Brain, Check, ChevronDown, ChevronRight, Database, Layers, Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { getSidebarConfig } from '@/app/(app)/[organization]/components/sql-console-sidebar/sidebar-config';
import { isHiddenDatabase, normalizeOption } from '@/app/(app)/[organization]/components/sql-console-sidebar/utils';

export type AgentConnection = { id: string; name: string; type: ConnectionType; defaultDatabase?: string | null };
export type AgentKnowledge = { id: string; name: string; connectionIds: string[] };

export function useAgentDatabases(organization: string, connections: AgentConnection[], scope: AnalysisScope) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [browseAll, setBrowseAll] = useState(false);
    const automatic = scope.connectionMode === 'auto' || (!scope.connectionMode && !scope.connectionIds.length);
    const selectedIds = automatic ? [] : scope.connectionIds;
    const queries = useQueries({
        queries: connections.map(connection => ({
            queryKey: ['data-agent-databases', organization, connection.id],
            enabled: browseAll || expandedId === connection.id || (selectedIds.includes(connection.id) && getAnalysisDatabases(scope, connection.id) !== undefined),
            queryFn: async ({ signal }: { signal: AbortSignal }) => {
                const result = await executeActionClient<{ databases: Array<{ value?: string; label?: string; name?: string }> }>(
                    'schema.listDatabases',
                    { connectionId: connection.id },
                    { currentConnectionId: connection.id, signal },
                );
                const config = getSidebarConfig(connection.type);
                return [
                    ...new Map(
                        (result.databases ?? [])
                            .map(normalizeOption)
                            .filter(option => option !== null)
                            .filter(option => !isHiddenDatabase(option.value, config))
                            .map(option => [option.value, option]),
                    ).values(),
                ];
            },
            staleTime: 5 * 60_000,
            retry: false,
        })),
    });
    const groups = connections.map((connection, index) => {
        const query = queries[index];
        const databases = query.data ?? [];
        const values = getAnalysisDatabases(scope, connection.id);
        const selected = selectedIds.includes(connection.id);
        const valid = !selected || values === undefined || (values.length > 0 && query.isSuccess && values.every(value => databases.some(database => database.value === value)));
        return { connection, databases, values, selected, query, valid };
    });
    return {
        groups,
        expandedId,
        setExpandedId,
        setBrowseAll,
        ready: automatic || (selectedIds.length > 0 && selectedIds.length <= 12 && selectedIds.every(id => groups.some(group => group.connection.id === id && group.valid))),
        // Preserve unavailable selections until the user explicitly removes them.
        scope,
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
    const [search, setSearch] = useState('');
    const automatic = scope.connectionMode === 'auto' || !scope.connectionIds.length;
    const selectedIds = automatic ? [] : scope.connectionIds;
    const selectedDatabases = selectedIds.flatMap(id => getAnalysisDatabases(scope, id) ?? []);
    const automaticSources = selectedIds.filter(id => getAnalysisDatabases(scope, id) === undefined);
    const selectionLabel = selectedDatabases.length === 1 ? selectedDatabases[0] : t('DatabaseCount', { count: selectedDatabases.length });
    const autoLabel = t('AutoSourceCount', { count: automaticSources.length });
    const sourceLabel = automatic ? t('Auto') : [selectedDatabases.length ? selectionLabel : null, automaticSources.length ? autoLabel : null].filter(Boolean).join(' · ');
    const knowledgeLabel = scope.knowledgeMode === 'none' ? t('NoKnowledge') : (models.find(model => model.id === scope.knowledgeModelId)?.name ?? t('Auto'));
    const changeSource = (connectionId: string, values: string[] | undefined) => {
        if (disabled) return;
        const ids = values?.length === 0 ? selectedIds.filter(id => id !== connectionId) : [...new Set([...selectedIds, connectionId])];
        if (ids.length > 12) return;
        const selections: Record<string, string[]> = {};
        for (const id of ids) {
            const value = id === connectionId ? values : getAnalysisDatabases(scope, id);
            if (value !== undefined) selections[id] = value;
        }
        onChange({ ...scope, connectionMode: ids.length ? 'manual' : 'auto', connectionIds: ids, databasesByConnection: selections });
    };
    const query = search.trim().toLocaleLowerCase();
    const matches = (value: string) => value.toLocaleLowerCase().includes(query);
    const unavailableIds = selectedIds.filter(id => !connections.some(connection => connection.id === id));
    const visibleUnavailableIds = unavailableIds.filter(id => matches(id) || matches(t('UnavailableSource', { id })));
    const visibleGroups = databases.groups.flatMap(group => {
        const sourceMatches = matches(group.connection.name);
        const saved = group.selected ? (group.values ?? []) : [];
        const missing = saved.filter(value => !group.databases.some(database => database.value === value));
        const items = [...group.databases, ...missing.map(value => ({ value, label: value }))];
        const visible = sourceMatches ? items : items.filter(item => matches(item.label) || matches(item.value));
        return sourceMatches || visible.length ? [{ ...group, saved, visible }] : [];
    });
    const searchingDatabases = Boolean(query) && databases.groups.some(group => group.query.isFetching);
    const triggerClass = 'h-8 max-w-full gap-2 px-2 text-xs text-muted-foreground hover:text-foreground';
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-1" aria-label={t('Label')} data-testid="agent-scope-picker">
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
                                    onSelect={() => {
                                        onChange({ ...scope, knowledgeMode: 'auto', knowledgeModelId: null });
                                        setOpen(null);
                                    }}
                                >
                                    {t('Auto')}
                                    {scope.knowledgeMode !== 'none' && !scope.knowledgeModelId ? <Check className="ml-auto size-4" /> : null}
                                </CommandItem>
                                <CommandItem
                                    aria-checked={scope.knowledgeMode === 'none'}
                                    onSelect={() => {
                                        onChange({ ...scope, knowledgeMode: 'none', knowledgeModelId: null });
                                        setOpen(null);
                                    }}
                                >
                                    {t('NoKnowledge')}
                                    {scope.knowledgeMode === 'none' ? <Check className="ml-auto size-4" /> : null}
                                </CommandItem>
                                {models.map(model => (
                                    <CommandItem
                                        key={model.id}
                                        aria-checked={model.id === scope.knowledgeModelId}
                                        value={model.id}
                                        keywords={[model.name]}
                                        onSelect={() => {
                                            onChange({ ...scope, knowledgeMode: 'manual', knowledgeModelId: model.id });
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
            <Popover
                open={!disabled && open === 'sources'}
                onOpenChange={value => {
                    setOpen(value ? 'sources' : null);
                    if (!value) {
                        setSearch('');
                        databases.setBrowseAll(false);
                        databases.setExpandedId(null);
                    }
                }}
            >
                <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" className={triggerClass} disabled={disabled} aria-label={t('Sources')} title={sourceLabel}>
                        <Layers className="size-4 shrink-0" />
                        <span className="max-w-60 truncate">{sourceLabel}</span>
                        <ChevronDown className="size-3 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" aria-label={t('Sources')} className="w-88 max-w-[calc(100vw-2rem)] overflow-hidden p-0">
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder={t('SearchSourcesAndDatabases')}
                            value={search}
                            onValueChange={value => {
                                setSearch(value);
                                databases.setBrowseAll(Boolean(value.trim()));
                            }}
                        />
                        <CommandList
                            className="max-h-[min(24rem,50vh)] p-1"
                            aria-label={t('Sources')}
                            onKeyDown={event => {
                                if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) event.stopPropagation();
                            }}
                        >
                            <CommandGroup className="border-b px-1 pt-0">
                                <CommandItem
                                    value="global-auto"
                                    aria-label={t('Auto')}
                                    aria-checked={automatic}
                                    onSelect={() => {
                                        onChange({ ...scope, connectionMode: 'auto', connectionIds: [], databasesByConnection: {} });
                                    }}
                                >
                                    <Sparkles className="size-4 shrink-0" />
                                    <span className="flex-1">{t('Auto')}</span>
                                    {automatic && <Check aria-hidden className="size-4 text-foreground" />}
                                </CommandItem>
                            </CommandGroup>
                            {visibleGroups.map(({ connection, databases: items, values, selected, query: result, valid, saved, visible }) => {
                                const expanded = databases.expandedId === connection.id;
                                const automaticDatabases = selected && values === undefined;
                                const atLimit = !selected && selectedIds.length >= 12;
                                const allSelected = items.length > 0 && items.every(item => saved.includes(item.value));
                                return (
                                    <CommandGroup key={connection.id} className="px-1 py-0" aria-label={connection.name}>
                                        <div className="flex items-center gap-0.5">
                                            <CommandItem
                                                value={JSON.stringify([connection.id, 'auto'])}
                                                aria-label={`${connection.name}: ${t('AutoDatabases')}`}
                                                aria-checked={automaticDatabases}
                                                className="min-w-0 flex-1"
                                                disabled={disabled || atLimit}
                                                onSelect={() => changeSource(connection.id, automaticDatabases ? [] : undefined)}
                                            >
                                                <Layers className="size-4 shrink-0" />
                                                <span className="min-w-0 flex-1 truncate" title={connection.name}>
                                                    {connection.name}
                                                </span>
                                                {automaticDatabases && (
                                                    <>
                                                        <span className="shrink-0 text-xs text-muted-foreground">{t('AutoDatabases')}</span>
                                                        <Check aria-hidden className="size-4 text-foreground" />
                                                    </>
                                                )}
                                                {selected && values !== undefined && (
                                                    <span className={`shrink-0 text-xs ${!valid && !result.isPending ? 'text-destructive' : 'text-muted-foreground'}`}>
                                                        {t('DatabaseCount', { count: saved.length })}
                                                    </span>
                                                )}
                                            </CommandItem>
                                            {!query && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="text-muted-foreground"
                                                    aria-label={`${connection.name}: ${t('Databases')}`}
                                                    aria-expanded={expanded}
                                                    onClick={() => databases.setExpandedId(expanded ? null : connection.id)}
                                                >
                                                    <ChevronRight className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                                                </Button>
                                            )}
                                        </div>
                                        {(expanded || query) && (
                                            <div className="ml-4 border-l pl-1">
                                                {result.isSuccess && items.length > 1 && (
                                                    <div className="flex justify-end px-1">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="xs"
                                                            className="text-muted-foreground"
                                                            aria-label={`${connection.name}: ${t(allSelected ? 'Clear' : 'SelectAll')}`}
                                                            disabled={disabled || atLimit}
                                                            onClick={() => changeSource(connection.id, allSelected ? [] : items.map(item => item.value))}
                                                        >
                                                            {t(allSelected ? 'Clear' : 'SelectAll')}
                                                        </Button>
                                                    </div>
                                                )}
                                                {result.isPending && (
                                                    <div role="status" className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                                                        <Loader2 aria-hidden className="size-3.5 animate-spin" />
                                                        {t('Loading')}
                                                    </div>
                                                )}
                                                {result.isError && (
                                                    <div role="alert" className="flex items-center justify-between gap-2 px-2 py-0.5 text-xs text-destructive">
                                                        <span>{t('LoadFailed')}</span>
                                                        <Button type="button" variant="ghost" size="xs" disabled={result.isFetching} onClick={() => void result.refetch()}>
                                                            {t('Retry')}
                                                        </Button>
                                                    </div>
                                                )}
                                                {result.isSuccess && !valid && (
                                                    <p role="alert" className="px-2 py-1.5 text-xs text-destructive">
                                                        {t('Unavailable')}
                                                    </p>
                                                )}
                                                {result.isSuccess && valid && !items.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('NoDatabases')}</p>}
                                                {visible.map(database => {
                                                    const checked = saved.includes(database.value);
                                                    return (
                                                        <CommandItem
                                                            key={database.value}
                                                            value={JSON.stringify([connection.id, 'database', database.value])}
                                                            aria-label={`${connection.name}: ${database.label}`}
                                                            aria-checked={checked}
                                                            disabled={disabled || atLimit || (!checked && !result.isSuccess)}
                                                            onSelect={() =>
                                                                changeSource(connection.id, checked ? saved.filter(value => value !== database.value) : [...saved, database.value])
                                                            }
                                                        >
                                                            <Database className="size-4 shrink-0" />
                                                            <span className="min-w-0 flex-1 truncate" title={database.label}>
                                                                {database.label}
                                                            </span>
                                                            {checked && <Check aria-hidden className="size-4 text-foreground" />}
                                                        </CommandItem>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </CommandGroup>
                                );
                            })}
                            {visibleUnavailableIds.map(id => (
                                <CommandGroup key={id} heading={t('UnavailableSource', { id })}>
                                    <CommandItem value={JSON.stringify([id, 'remove'])} onSelect={() => changeSource(id, [])}>
                                        {t('RemoveUnavailable')}
                                        <Check aria-hidden className="ml-auto size-4 text-foreground" />
                                    </CommandItem>
                                </CommandGroup>
                            ))}
                            {query && !visibleGroups.length && !visibleUnavailableIds.length && (
                                <p role="status" className="px-2 py-3 text-center text-xs text-muted-foreground">
                                    {t(searchingDatabases ? 'Loading' : 'NoResults')}
                                </p>
                            )}
                        </CommandList>
                    </Command>
                    {selectedIds.length >= 12 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t('SourceLimit')}</p>}
                </PopoverContent>
            </Popover>
            {!databases.ready && scope.connectionIds.length > 0 ? (
                <span role="status" className="px-2 text-xs text-muted-foreground">
                    {t('CheckDatabases')}
                </span>
            ) : null}
        </div>
    );
}
