'use client';

import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { IconFileTypeSql } from '@tabler/icons-react';
import { ChevronDown, ChevronRight, FileText, LibraryBig, MoreHorizontal, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createSerializer, parseAsString, parseAsStringLiteral } from 'nuqs';
import { buildDocumentDirectory, providers, QUERY_FOLDER, ROOT, type DirectoryData, type NavigationHit } from '@dory/shared/utils/knowledge-directory';
import { getRootFolders } from './document-directory';
import { DirectoryFolderIcon } from './source-logo';
import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

import { FileTreeName } from '@/components/ai-elements/file-tree';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';

export type NavigationIndex = { models: { id: string; name: string; hasGuide?: boolean }[]; canWrite: boolean; canManageLinear: boolean; userId: string };
export const navigationKey = (organization: string) => ['knowledge-models', organization, 'navigation'] as const;
const modelActions = ['settings', 'folder', 'document', 'upload', ...providers] as const;
export type ModelAction = (typeof modelActions)[number];
export const modelActionParser = parseAsStringLiteral(modelActions);
export const serializeKnowledge = createSerializer({
    tab: parseAsString,
    file: parseAsString,
    folder: parseAsString,
    query: parseAsString,
    manageSource: parseAsString,
    modelAction: modelActionParser,
});

export const treeRowClassName =
    'flex min-w-0 items-center rounded-md hover:bg-muted has-[>[aria-current=page]]:bg-accent has-[>[aria-current=page]]:font-medium has-[>[aria-current=page]]:text-accent-foreground';

export function TreeDisclosure({ open, label, onToggle }: { open: boolean; label: string; onToggle?: () => void }) {
    if (!onToggle) return <span className="w-6 shrink-0" aria-hidden="true" />;
    return (
        <button className="grid size-6 shrink-0 place-items-center rounded hover:bg-background" aria-expanded={open} aria-label={label} onClick={onToggle}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
    );
}

function ExpandedModel({
    organization,
    model,
    select,
    manage,
}: {
    organization: string;
    model: NavigationIndex['models'][number];
    select: (entry: NavigationHit) => void;
    manage: (modelId: string, connectorId: string) => void;
}) {
    const t = useTranslations('Knowledge');
    const scope = { knowledgeModelId: model.id };
    const opts = { organizationId: organization };
    const prefix = ['knowledge-model', model.id];
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const directory = useQuery({ queryKey: [...prefix, 'directory'], queryFn: () => executeActionClient<DirectoryData>('knowledge.listDirectory', scope, opts) });
    const files = useQuery({
        queryKey: [...prefix, 'knowledge-sources'],
        queryFn: () => executeActionClient<{ sources: KnowledgeSourceSummary[] }>('knowledge.listKnowledgeSources', scope, opts),
    });
    const queries = useQuery({
        queryKey: [...prefix, 'query-entries'],
        enabled: expanded.has(QUERY_FOLDER),
        queryFn: () => executeActionClient<{ entries: { id: string; title: string; question: string }[] }>('knowledge.queryEntries', scope, opts),
    });
    const guide = model.hasGuide ? t('Documents.Guide') : null;
    const index = useMemo(
        () => (directory.data && files.data ? buildDocumentDirectory(guide, directory.data, files.data.sources, model.name) : null),
        [directory.data, files.data, model.name, guide],
    );
    const error = directory.error ?? files.error;
    if (error) return <li role="alert">{error.message}</li>;
    if (!index)
        return (
            <li role="status" className="text-sm text-muted-foreground">
                {t('Documents.Loading')}
            </li>
        );
    const hit = (kind: NavigationHit['kind'], id: string, name: string) => select({ kind, id, name, modelId: model.id, path: [model.name, name] });
    function leaf(kind: 'document' | 'query', id: string, name: string) {
        return (
            <li key={id}>
                <button className="flex w-full min-w-0 items-center gap-2 rounded-md py-1.5 ps-7 pe-2 text-start text-sm hover:bg-muted" onClick={() => hit(kind, id, name)}>
                    {kind === 'query' ? <IconFileTypeSql size={16} className="shrink-0" /> : <FileText size={16} className="shrink-0" />}
                    <FileTreeName>{name}</FileTreeName>
                </button>
            </li>
        );
    }
    function contents(parent: string): ReactNode {
        if (!index) return null;
        if (parent === QUERY_FOLDER)
            return queries.error ? <li role="alert">{queries.error.message}</li> : queries.data?.entries.map(item => leaf('query', item.id, item.title || item.question));
        const folders = parent === ROOT ? getRootFolders(index, t('VerifiedQueries')) : (index.children.get(parent) ?? []);
        return (
            <>
                {folders.map(folder => {
                    const open = expanded.has(folder.id);
                    return (
                        <li key={folder.id}>
                            <div className="flex min-w-0 items-center rounded-md px-1 hover:bg-muted">
                                <TreeDisclosure
                                    open={open}
                                    label={t(open ? 'Documents.Collapse' : 'Documents.Expand', { name: folder.name })}
                                    onToggle={() =>
                                        setExpanded(prev => {
                                            const next = new Set(prev);
                                            if (open) next.delete(folder.id);
                                            else next.add(folder.id);
                                            return next;
                                        })
                                    }
                                />
                                <button className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-sm" onClick={() => hit('folder', folder.id, folder.name)}>
                                    <DirectoryFolderIcon folder={folder} className="size-4 shrink-0" />
                                    <FileTreeName>{folder.name}</FileTreeName>
                                </button>
                                {folder.provider && (
                                    <Button variant="ghost" size="icon-sm" aria-label={t('Documents.Actions', { name: folder.name })} onClick={() => manage(model.id, folder.id)}>
                                        <MoreHorizontal />
                                    </Button>
                                )}
                            </div>
                            {open && <ul className="ms-3 border-s ps-1">{contents(folder.id)}</ul>}
                        </li>
                    );
                })}
                {index.documentsByFolder.get(parent)?.map(doc => leaf('document', doc.id, doc.name))}
            </>
        );
    }
    return contents(ROOT);
}

export function KnowledgeNavigation({
    organization,
    models,
    active,
    selectedModelId,
    onSelect,
    onManage,
    modelMenu,
    children,
    create,
}: {
    organization: string;
    models: NavigationIndex['models'];
    active: string;
    selectedModelId: string | null;
    onSelect: (hit: NavigationHit) => void;
    onManage: (modelId: string, connectorId: string) => void;
    modelMenu: (model: NavigationIndex['models'][number]) => ReactNode;
    children: ReactNode;
    create: ReactNode;
}) {
    const t = useTranslations('Knowledge');
    const [input, setInput] = useState('');
    const term = useDeferredValue(input.trim());
    const [expandedModels, setExpandedModels] = useState(() => new Set([active]));
    const includeRules = t('Documents.RulesSearchAlias').toLocaleLowerCase().includes(term.toLocaleLowerCase()) || term === '分析规则';
    const queryFolderName = t('VerifiedQueries');
    const guideName = t('Documents.Guide');
    const results = useInfiniteQuery({
        queryKey: ['knowledge-directory-search', organization, term, includeRules, queryFolderName, guideName],
        initialPageParam: 0,
        enabled: Boolean(term),
        queryFn: ({ pageParam, signal }) =>
            executeActionClient<{ items: NavigationHit[]; total: number }>(
                'knowledge.searchDirectory',
                { query: term, offset: pageParam, includeRules, queryFolderName, guideName },
                { organizationId: organization, signal },
            ),
        getNextPageParam: (last, _pages, offset) => (offset + last.items.length < last.total ? offset + last.items.length : undefined),
    });
    const select = (hit: NavigationHit) => {
        setInput('');
        setExpandedModels(previous => new Set(previous).add(hit.modelId));
        onSelect(hit);
    };
    return (
        <>
            <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b ps-3 pe-14 md:pe-3">
                <h2 className="text-sm font-semibold">{t('Title')}</h2>
                {create}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input
                        className="ps-8"
                        type="search"
                        maxLength={240}
                        value={input}
                        aria-label={t('WorkspaceSearch')}
                        placeholder={t('WorkspaceSearch')}
                        onChange={event => setInput(event.target.value)}
                    />
                </div>
                <nav
                    aria-label={t('Documents.Directory')}
                    className="[&_button:focus:not(:focus-visible)]:outline-none [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-ring"
                >
                    <ul className="space-y-1">
                        {input.trim() ? (
                            <>
                                {results.isError && <li role="alert">{results.error.message}</li>}
                                {results.isFetching && (
                                    <li role="status" className="text-sm text-muted-foreground">
                                        {t('Documents.Loading')}
                                    </li>
                                )}
                                {results.data?.pages[0]?.total === 0 && <li className="text-sm text-muted-foreground">{t('Documents.NoMatches')}</li>}
                                {results.data?.pages
                                    .flatMap(page => page.items)
                                    .map(hit => (
                                        <li key={[hit.modelId, hit.kind, hit.id].join(':')}>
                                            <button className="block w-full rounded-md p-2 text-start text-sm hover:bg-accent" onClick={() => select(hit)}>
                                                <span className="block break-words">{hit.name}</span>
                                                <span className="block break-words text-xs text-muted-foreground">{hit.path.join(' / ')}</span>
                                            </button>
                                        </li>
                                    ))}
                                {results.hasNextPage && (
                                    <li>
                                        <Button variant="ghost" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
                                            {t('MoreResults')}
                                        </Button>
                                    </li>
                                )}
                            </>
                        ) : (
                            models.map(model => {
                                const open = expandedModels.has(model.id);
                                const hit: NavigationHit = { modelId: model.id, id: model.id, kind: 'model', name: model.name, path: [model.name] };
                                return (
                                    <li key={model.id}>
                                        <div className={treeRowClassName}>
                                            <button
                                                className="p-1"
                                                aria-label={t(open ? 'Documents.Collapse' : 'Documents.Expand', { name: model.name })}
                                                aria-expanded={open}
                                                onClick={() =>
                                                    setExpandedModels(previous => {
                                                        const next = new Set(previous);
                                                        if (open) next.delete(model.id);
                                                        else next.add(model.id);
                                                        return next;
                                                    })
                                                }
                                            >
                                                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                            <button
                                                aria-current={selectedModelId === model.id ? 'page' : undefined}
                                                className="flex min-w-0 flex-1 items-center gap-2 py-2 text-start text-sm font-medium"
                                                onClick={() => select(hit)}
                                            >
                                                <LibraryBig size={16} className="shrink-0" />
                                                <FileTreeName>{model.name}</FileTreeName>
                                            </button>
                                            {modelMenu(model)}
                                        </div>
                                        {open && (
                                            <ul className="ms-3 space-y-0.5 border-s ps-1">
                                                {active === model.id ? children : <ExpandedModel organization={organization} model={model} select={select} manage={onManage} />}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })
                        )}
                    </ul>
                </nav>
            </div>
        </>
    );
}
