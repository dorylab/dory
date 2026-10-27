'use client';

import { useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import type { ConnectionType } from '@dory/shared/types/connections';
import { getAnalysisDatabases } from '@dory/shared/utils/analysis-scope';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import { useQueries } from '@tanstack/react-query';
import { Brain, Check, ChevronDown, Database, Layers, Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { getSidebarConfig } from '@/app/(app)/[organization]/components/sql-console-sidebar/sidebar-config';
import { isHiddenDatabase, normalizeOption } from '@/app/(app)/[organization]/components/sql-console-sidebar/utils';

export type AgentConnection = { id: string; name: string; type: ConnectionType; defaultDatabase?: string | null };
export type AgentKnowledge = { id: string; name: string; connectionIds: string[] };

export function useAgentDatabases(organization: string, connections: AgentConnection[], scope: AnalysisScope) {
    const [browseAll, setBrowseAll] = useState(false);
    const automatic = scope.connectionMode === 'auto' || (!scope.connectionMode && !scope.connectionIds.length);
    const selectedIds = automatic ? [] : scope.connectionIds;
    const queries = useQueries({
        queries: connections.map(connection => ({
            queryKey: ['data-agent-databases', organization, connection.id],
            enabled: browseAll || (selectedIds.includes(connection.id) && getAnalysisDatabases(scope, connection.id) !== undefined),
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
    const [knowledgeError, setKnowledgeError] = useState('');
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
    const triggerClass = 'h-8 max-w-full gap-2 px-2 text-xs text-muted-foreground hover:text-foreground';
    const check = (checked: boolean) => (
        <span
            aria-hidden
            className={`ml-auto flex size-5 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50'}`}
        >
            {checked ? <Check className="size-3.5" /> : null}
        </span>
    );
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
                                        setKnowledgeError('');
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
                                        setKnowledgeError('');
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
                                            const ids = [...new Set(model.connectionIds)];
                                            if (ids.length > 12) {
                                                setKnowledgeError(t('SourceLimit'));
                                                return;
                                            }
                                            if (ids.some(id => !connections.some(connection => connection.id === id))) {
                                                setKnowledgeError(t('KnowledgeSourcesUnavailable'));
                                                return;
                                            }
                                            setKnowledgeError('');
                                            onChange({
                                                ...scope,
                                                knowledgeMode: 'manual',
                                                knowledgeModelId: model.id,
                                                connectionMode: ids.length ? 'manual' : 'auto',
                                                connectionIds: ids,
                                                databasesByConnection: {},
                                            });
                                            setOpen(null);
                                        }}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{model.name}</span>
                                        {model.id === scope.knowledgeModelId ? <Check className="size-4" /> : null}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                        {knowledgeError && (
                            <p role="alert" className="border-t px-3 py-2 text-xs text-destructive">
                                {knowledgeError}
                            </p>
                        )}
                    </Command>
                </PopoverContent>
            </Popover>
            <Popover
                open={!disabled && open === 'sources'}
                onOpenChange={value => {
                    setOpen(value ? 'sources' : null);
                    databases.setBrowseAll(value);
                    if (!value) setSearch('');
                }}
            >
                <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" className={triggerClass} disabled={disabled} aria-label={t('Sources')} title={sourceLabel}>
                        <Layers className="size-4 shrink-0" />
                        <span className="max-w-60 truncate">{sourceLabel}</span>
                        <ChevronDown className="size-3 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" className="w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden p-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
                        <h3 className="font-semibold">{t('Sources')}</h3>
                        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                            {automatic
                                ? t('Auto')
                                : [t('SelectedCount', { count: selectedDatabases.length }), automaticSources.length ? autoLabel : null].filter(Boolean).join(' · ')}
                        </span>
                    </div>
                    <Command shouldFilter={false}>
                        <CommandInput placeholder={t('SearchSourcesAndDatabases')} value={search} onValueChange={setSearch} />
                        <CommandList className="max-h-[min(28rem,50vh)] p-2" aria-label={t('Sources')}>
                            <CommandGroup>
                                <CommandItem
                                    value="global-auto"
                                    aria-label={t('Auto')}
                                    aria-checked={automatic}
                                    onSelect={() => {
                                        onChange({ ...scope, connectionMode: 'auto', connectionIds: [], databasesByConnection: {} });
                                    }}
                                >
                                    <Sparkles className="size-4 shrink-0" />
                                    <span className="flex-1">
                                        <span className="block">{t('Auto')}</span>
                                        <span className="text-xs text-muted-foreground">{t('AutoDescription')}</span>
                                    </span>
                                    {check(automatic)}
                                </CommandItem>
                            </CommandGroup>
                            {databases.groups.map(({ connection, databases: items, values, selected, query: result, valid }) => {
                                const sourceMatches = matches(connection.name);
                                const saved = selected ? (values ?? []) : [];
                                const missing = saved.filter(value => !items.some(item => item.value === value));
                                const visible = [...items, ...missing.map(value => ({ value, label: value }))].filter(
                                    item => sourceMatches || matches(item.label) || matches(item.value),
                                );
                                if (query && !sourceMatches && !visible.length) return null;
                                const atLimit = !selected && selectedIds.length >= 12;
                                const allSelected = items.length > 0 && items.every(item => saved.includes(item.value));
                                return (
                                    <CommandGroup key={connection.id} className="border-t pt-2" aria-label={connection.name}>
                                        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-foreground">
                                            <Layers className="size-4 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate" title={connection.name}>
                                                {connection.name}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs"
                                                aria-label={`${connection.name}: ${t(allSelected ? 'Clear' : 'SelectAll')}`}
                                                disabled={disabled || atLimit || (!allSelected && (!result.isSuccess || !items.length))}
                                                onClick={() => changeSource(connection.id, allSelected ? [] : items.map(item => item.value))}
                                            >
                                                {t(allSelected ? 'Clear' : 'SelectAll')}
                                            </Button>
                                        </div>
                                        <CommandItem
                                            value={JSON.stringify([connection.id, 'auto'])}
                                            aria-label={`${connection.name}: ${t('AutoDatabases')}`}
                                            aria-checked={selected && values === undefined}
                                            disabled={disabled || atLimit}
                                            onSelect={() => changeSource(connection.id, selected && values === undefined ? [] : undefined)}
                                        >
                                            <Sparkles className="size-4 shrink-0" />
                                            <span className="flex-1">{t('AutoDatabases')}</span>
                                            {check(selected && values === undefined)}
                                        </CommandItem>
                                        {result.isPending && (
                                            <div role="status" className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                                                <Loader2 className="size-4 animate-spin" />
                                                {t('Loading')}
                                            </div>
                                        )}
                                        {result.isError && (
                                            <div role="alert" className="px-2 py-2 text-xs text-destructive">
                                                {t('LoadFailed')}
                                                <Button type="button" variant="ghost" size="sm" disabled={result.isFetching} onClick={() => void result.refetch()}>
                                                    {t('Retry')}
                                                </Button>
                                            </div>
                                        )}
                                        {result.isSuccess && !items.length && <p className="px-2 py-2 text-xs text-muted-foreground">{t('NoDatabases')}</p>}
                                        {selected && !valid && !result.isPending && (
                                            <p role="alert" className="px-2 py-2 text-xs text-destructive">
                                                {t('Unavailable')}
                                            </p>
                                        )}
                                        {visible.map(database => {
                                            const checked = saved.includes(database.value);
                                            return (
                                                <CommandItem
                                                    key={database.value}
                                                    value={JSON.stringify([connection.id, 'database', database.value])}
                                                    aria-label={`${connection.name}: ${database.label}`}
                                                    aria-checked={checked}
                                                    className="py-2 pl-6"
                                                    disabled={disabled || atLimit || (!checked && !result.isSuccess)}
                                                    onSelect={() =>
                                                        changeSource(connection.id, checked ? saved.filter(value => value !== database.value) : [...saved, database.value])
                                                    }
                                                >
                                                    <Database className="size-4 shrink-0" />
                                                    <span className="min-w-0 flex-1 truncate">{database.label}</span>
                                                    {check(checked)}
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                );
                            })}
                            {visibleUnavailableIds.map(id => (
                                <CommandGroup key={id} heading={t('UnavailableSource', { id })}>
                                    <CommandItem value={JSON.stringify([id, 'remove'])} onSelect={() => changeSource(id, [])}>
                                        {t('RemoveUnavailable')}
                                        {check(true)}
                                    </CommandItem>
                                </CommandGroup>
                            ))}
                            {query &&
                                !databases.groups.some(
                                    group =>
                                        matches(group.connection.name) ||
                                        [...group.databases.flatMap(item => [item.label, item.value]), ...(group.selected ? (group.values ?? []) : [])].some(matches),
                                ) &&
                                !visibleUnavailableIds.length && <p className="p-4 text-center text-sm text-muted-foreground">{t('NoResults')}</p>}
                        </CommandList>
                    </Command>
                    <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                        {t('ScopeDescription')} {t('SourceLimit')}
                    </p>
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
