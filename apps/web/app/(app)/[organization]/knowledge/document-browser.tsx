'use client';

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ChevronDown,
    ChevronRight,
    FilePlus2,
    FileText,
    Folder,
    FolderClosed,
    FolderInput,
    FolderOpen,
    FolderPlus,
    MoreHorizontal,
    PanelLeft,
    Pencil,
    Pin,
    Plus,
    Search,
    Trash2,
    Upload,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/registry/new-york-v4/ui/sheet';
import { buildDocumentDirectory, ROOT, type DirectoryData, type DocumentFolder, type DirectoryDocument } from './document-directory';
import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

type Entry = { id: string; kind: 'folder' | 'document'; name: string; parentId: string | null };
type Command =
    | { operation: 'create'; parentId: string | null; name: string }
    | { operation: 'move'; id: string; kind: Entry['kind']; parentId: string | null }
    | { operation: 'rename'; id: string; kind: Entry['kind']; name: string }
    | { operation: 'delete'; id: string; kind: 'folder' };
type Prompt = { operation: 'create' } | { operation: 'move' | 'rename' | 'delete'; entry: Entry };
type Props = {
    modelId: string;
    modelName: string;
    hasGuide: boolean;
    organization: string;
    sources: KnowledgeSourceSummary[];
    directory?: DirectoryData;
    directoryPending: boolean;
    directoryError?: string;
    sourcesPending: boolean;
    sourcesError?: string;
    onRead: (source: KnowledgeSourceSummary | null) => void;
    onEdit: (source: KnowledgeSourceSummary) => void;
    onNew: (folderId: string | null) => void;
    onUpload: (folderId: string | null) => void;
};
const emptyDirectory: DirectoryData = { canWrite: false, folders: [], connectors: [] };

export function DocumentBrowser({
    modelId,
    modelName,
    hasGuide,
    organization,
    sources,
    directory,
    directoryPending,
    directoryError,
    sourcesPending,
    sourcesError,
    onRead,
    onNew,
    onEdit,
    onUpload,
}: Props) {
    const t = useTranslations('Knowledge.Documents');
    const knowledge = useTranslations('Knowledge');
    const client = useQueryClient();
    const data = directory ?? emptyDirectory;
    const guide = hasGuide ? t('Guide') : null;
    const index = useMemo(() => buildDocumentDirectory(modelName, guide, data, sources), [data, sources, modelName, guide]);
    const [location, setLocation] = useQueryState('folder', parseAsString.withOptions({ history: 'push' }));
    const current = index.folders.get(location ?? ROOT) ?? index.root;
    const trail = useMemo(() => index.trail(current.id), [index, current.id]);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set([ROOT]));
    const [search, setSearch] = useState('');
    const [drawer, setDrawer] = useState(false);
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    const [value, setValue] = useState('');
    const [drag, setDrag] = useState<Entry | null>(null);
    const [over, setOver] = useState<string | null>(null);
    useEffect(() => {
        setExpanded(previous => (trail.every(folder => previous.has(folder.id)) ? previous : new Set([...previous, ...trail.map(folder => folder.id)])));
    }, [trail]);

    const change = useMutation({
        mutationFn: (command: Command) =>
            executeActionClient<{ id: string }>('knowledge.changeDirectory', { knowledgeModelId: modelId, change: command }, { organizationId: organization }),
        onSuccess: async (_, command) => {
            const affectsSource = 'kind' in command && command.kind === 'document';
            const list = affectsSource ? 'knowledge-sources' : 'directory';
            await client.invalidateQueries({ queryKey: ['knowledge-model', modelId, list] });
            setPrompt(null);
        },
        onError: error => toast.error(error.message),
    });
    function navigate(id: string) {
        void setLocation(id || null);
        setExpanded(previous => new Set([...previous, ...index.trail(id).map(folder => folder.id)]));
        setDrawer(false);
        setSearch('');
    }
    function ask(next: Prompt) {
        setValue(next.operation === 'rename' ? next.entry.name : next.operation === 'move' ? (next.entry.parentId ?? ROOT) : '');
        setPrompt(next);
    }
    function validDestination(entry: Entry, folder: DocumentFolder) {
        return !folder.managed && (entry.parentId ?? ROOT) !== folder.id && !(entry.kind === 'folder' && index.trail(folder.id).some(item => item.id === entry.id));
    }
    function dropTarget(folder: DocumentFolder) {
        return {
            onDragOver(event: DragEvent) {
                if (!drag || !validDestination(drag, folder)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOver(folder.id);
            },
            onDragLeave() {
                setOver(null);
            },
            onDrop(event: DragEvent) {
                event.preventDefault();
                event.stopPropagation();
                if (drag && validDestination(drag, folder)) change.mutate({ operation: 'move', id: drag.id, kind: drag.kind, parentId: folder.id || null });
                setDrag(null);
                setOver(null);
            },
        };
    }
    function draggable(entry: Entry, enabled: boolean) {
        return {
            draggable: enabled,
            onDragStart(event: DragEvent) {
                if (!enabled) return;
                event.dataTransfer.setData('text/plain', entry.name);
                event.dataTransfer.effectAllowed = 'move';
                setDrag(entry);
            },
            onDragEnd() {
                setDrag(null);
                setOver(null);
            },
        };
    }
    function actions(entry: Entry) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={t('Actions', { name: entry.name })}>
                        <MoreHorizontal />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => ask({ operation: 'rename', entry })}>
                        <Pencil />
                        {t('Rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => ask({ operation: 'move', entry })}>
                        <FolderInput />
                        {t('Move')}
                    </DropdownMenuItem>
                    {entry.kind === 'folder' && (
                        <DropdownMenuItem onSelect={() => ask({ operation: 'delete', entry })}>
                            <Trash2 />
                            {t('Delete')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }
    function treeNode(folder: DocumentFolder): ReactNode {
        const children = index.children.get(folder.id) ?? [];
        const isOpen = expanded.has(folder.id);
        return (
            <li key={folder.id}>
                <div
                    {...dropTarget(folder)}
                    {...draggable({ ...folder, kind: 'folder' }, data.canWrite && !folder.managed && folder.id !== ROOT)}
                    className={`flex min-w-0 items-center rounded-md px-1 text-sm hover:bg-muted ${current.id === folder.id ? 'bg-accent font-medium text-accent-foreground' : ''} ${over === folder.id ? 'ring-2 ring-ring' : ''}`}
                >
                    {children.length > 0 ? (
                        <button
                            className="shrink-0 rounded p-1 hover:bg-background"
                            aria-expanded={isOpen}
                            aria-label={t(isOpen ? 'Collapse' : 'Expand', { name: folder.name })}
                            onClick={() =>
                                setExpanded(previous => {
                                    const next = new Set(previous);
                                    if (isOpen) next.delete(folder.id);
                                    else next.add(folder.id);
                                    return next;
                                })
                            }
                        >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    ) : (
                        <span className="w-[22px] shrink-0" />
                    )}
                    <button
                        aria-current={current.id === folder.id ? 'location' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start"
                        onClick={() => navigate(folder.id)}
                    >
                        {current.id === folder.id ? <FolderOpen size={16} className="shrink-0" /> : <Folder size={16} className="shrink-0 text-muted-foreground" />}
                        <span className="truncate" title={folder.name}>
                            {folder.name}
                        </span>
                        <span className="ms-auto rounded-md border px-1.5 text-xs tabular-nums text-muted-foreground">{index.counts.get(folder.id) ?? 0}</span>
                    </button>
                </div>
                {isOpen && children.length > 0 && <ul className="ms-3 border-s ps-1">{children.map(treeNode)}</ul>}
            </li>
        );
    }
    const path = (id: string) =>
        index
            .trail(id)
            .map(folder => folder.name)
            .join(' / ');
    const needle = search.trim().toLocaleLowerCase();
    function searchResult(id: string, name: string, fullPath: string, select: () => void, icon: ReactNode) {
        return (
            <li key={id}>
                <button className="flex w-full items-start gap-2 rounded-md p-2 text-start hover:bg-accent" onClick={select}>
                    {icon}
                    <span className="min-w-0 text-sm">
                        <span className="block break-words">{name}</span>
                        <span className="block break-words text-xs text-muted-foreground">{fullPath}</span>
                    </span>
                </button>
            </li>
        );
    }
    function sidebar() {
        const matches = needle
            ? [
                  ...Array.from(index.folders.values())
                      .filter(folder => folder.id !== ROOT && folder.name.toLocaleLowerCase().includes(needle))
                      .map(folder => searchResult(folder.id, folder.name, path(folder.id), () => navigate(folder.id), <Folder size={16} />)),
                  ...index.documents
                      .filter(doc => doc.name.toLocaleLowerCase().includes(needle))
                      .map(doc =>
                          searchResult(
                              doc.id,
                              doc.name,
                              path(doc.parentId) + ' / ' + doc.name,
                              () => {
                                  navigate(doc.parentId);
                                  onRead(doc.source);
                              },
                              <FileText size={16} />,
                          ),
                      ),
              ]
            : [];
        return (
            <div className="space-y-3 p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input
                        className="ps-8"
                        type="search"
                        aria-label={t('Search')}
                        placeholder={t('SearchPlaceholder')}
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                    />
                </div>
                <nav aria-label={t('Directory')}>
                    <ul className="space-y-0.5">
                        {needle ? matches.length ? matches : <li className="px-2 text-sm text-muted-foreground">{t('NoMatches')}</li> : treeNode(index.root)}
                    </ul>
                </nav>
            </div>
        );
    }
    function documentRow(doc: DirectoryDocument) {
        const entry: Entry = { ...doc, kind: 'document' };
        const writable = Boolean(data.canWrite && doc.source && !doc.source.connectorId);
        return (
            <li key={doc.id} {...draggable(entry, writable)} className="flex min-w-0 items-center gap-2 px-2 py-1.5">
                <Button variant="ghost" className="min-w-0 flex-1 justify-start" onClick={() => onRead(doc.source)}>
                    {doc.source ? <FileText className="text-muted-foreground" /> : <Pin />}
                    <span className="truncate">{doc.name}</span>
                </Button>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {doc.source?.connectorProvider === 'github' ? 'GitHub' : doc.source?.connectorProvider === 'linear' ? 'Linear' : 'Markdown'}
                </span>
                {writable && doc.source && (
                    <>
                        <Button variant="ghost" size="icon-sm" aria-label={knowledge('EditNamedDefinition', { name: doc.name })} onClick={() => onEdit(doc.source!)}>
                            <Pencil />
                        </Button>
                        {actions(entry)}
                    </>
                )}
            </li>
        );
    }
    const unknownFolder = Boolean(location && !index.folders.has(location));
    const loading = directoryPending || sourcesPending;
    const loadError = directoryError || sourcesError;
    const local = data.canWrite && !current.managed && !unknownFolder;
    const children = index.children.get(current.id) ?? [];
    const documents = index.documents.filter(doc => doc.parentId === current.id);
    const promptTitle = prompt?.operation === 'move' ? t('Move') : prompt?.operation === 'rename' ? t('Rename') : prompt?.operation === 'delete' ? t('Delete') : t('NewFolder');
    const nonEmpty = prompt?.operation === 'delete' && (Boolean(index.children.get(prompt.entry.id)?.length) || Boolean(index.counts.get(prompt.entry.id)));
    const targets =
        prompt?.operation === 'move'
            ? Array.from(index.folders.values())
                  .filter(folder => validDestination(prompt.entry, folder))
                  .sort((a, b) => path(a.id).localeCompare(path(b.id)))
            : [];
    return (
        <div className="grid min-w-0 overflow-hidden rounded-xl border bg-background text-foreground md:grid-cols-[minmax(12rem,24%)_minmax(0,1fr)]">
            <aside className="hidden min-w-0 overflow-auto border-e bg-muted/20 md:block">
                <h3 className="flex min-h-12 items-center border-b px-4 text-sm font-semibold">{t('Directory')}</h3>
                {sidebar()}
            </aside>
            <div className="min-w-0">
                <div className="flex min-h-12 items-center gap-2 border-b px-3 sm:px-5">
                    <Button className="md:hidden" variant="outline" size="sm" onClick={() => setDrawer(true)}>
                        <PanelLeft />
                        {t('Directory')}
                    </Button>
                    <nav aria-label={t('Breadcrumb')} className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-2">
                        {trail.map((folder, i) => (
                            <span key={folder.id} className="flex min-w-0 max-w-full items-center gap-1">
                                {i > 0 && <ChevronRight size={13} className="shrink-0 text-muted-foreground" />}
                                <button
                                    {...dropTarget(folder)}
                                    aria-current={folder.id === current.id ? 'page' : undefined}
                                    className={`truncate rounded px-1 text-sm hover:bg-muted ${i === trail.length - 1 ? 'font-medium' : 'text-muted-foreground'} ${over === folder.id ? 'ring-2 ring-ring' : ''}`}
                                    onClick={() => navigate(folder.id)}
                                >
                                    {folder.name}
                                </button>
                            </span>
                        ))}
                    </nav>
                    {local && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm">
                                    <Plus />
                                    {t('New')}
                                    <ChevronDown />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => ask({ operation: 'create' })}>
                                    <FolderPlus />
                                    {t('NewFolder')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onNew(current.id || null)}>
                                    <FilePlus2 />
                                    {t('Create')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onUpload(current.id || null)}>
                                    <Upload />
                                    {t('Upload')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                <div className="min-h-72 space-y-6 p-4 sm:p-5">
                    {loadError && (
                        <p role="alert" className="text-sm text-destructive">
                            {loadError}
                        </p>
                    )}
                    {unknownFolder && !loading && !loadError && (
                        <p role="status" className="text-sm text-muted-foreground">
                            {t('MissingFolder')}
                        </p>
                    )}
                    {!unknownFolder && children.length > 0 && (
                        <section>
                            <h3 className="mb-3 text-sm font-semibold">{t('Folders')}</h3>
                            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(8rem,100%),1fr))] gap-2">
                                {children.map(folder => (
                                    <li
                                        key={folder.id}
                                        {...draggable({ ...folder, kind: 'folder' }, data.canWrite && !folder.managed)}
                                        {...dropTarget(folder)}
                                        className={`group relative rounded-lg border bg-muted/20 hover:bg-accent ${over === folder.id ? 'ring-2 ring-ring' : ''}`}
                                    >
                                        <button className="flex w-full min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-4" onClick={() => navigate(folder.id)}>
                                            <FolderClosed aria-hidden="true" className="mb-1 size-16 fill-muted-foreground/35 stroke-muted-foreground" strokeWidth={1} />
                                            <span className="w-full truncate text-center text-sm font-medium" title={folder.name}>
                                                {folder.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">{t('FileCount', { count: index.counts.get(folder.id) ?? 0 })}</span>
                                        </button>
                                        {!folder.managed && data.canWrite && <div className="absolute end-1 top-1">{actions({ ...folder, kind: 'folder' })}</div>}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    <section>
                        <h3 className="mb-3 text-sm font-semibold">{t('Files')}</h3>
                        {!unknownFolder && documents.length ? (
                            <ul className="divide-y rounded-lg border">{documents.map(documentRow)}</ul>
                        ) : (
                            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                {loading ? t('Loading') : !unknownFolder && !loadError ? t('Empty') : null}
                                {local && (
                                    <Button size="sm" variant="outline" onClick={() => onNew(current.id || null)}>
                                        <FilePlus2 />
                                        {t('Create')}
                                    </Button>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>
            <Sheet open={drawer} onOpenChange={setDrawer}>
                <SheetContent side="left" className="gap-0 overflow-auto text-foreground">
                    <SheetHeader>
                        <SheetTitle>{t('Directory')}</SheetTitle>
                    </SheetHeader>
                    {sidebar()}
                </SheetContent>
            </Sheet>
            {prompt && (
                <Dialog open onOpenChange={open => !open && setPrompt(null)}>
                    <DialogContent className="text-foreground">
                        <DialogHeader>
                            <DialogTitle>{promptTitle}</DialogTitle>
                        </DialogHeader>
                        <form
                            className="space-y-4"
                            onSubmit={event => {
                                event.preventDefault();
                                if (prompt.operation === 'create') change.mutate({ operation: 'create', name: value, parentId: current.id || null });
                                else if (prompt.operation === 'rename') change.mutate({ operation: 'rename', name: value, id: prompt.entry.id, kind: prompt.entry.kind });
                                else if (prompt.operation === 'move') change.mutate({ operation: 'move', parentId: value || null, id: prompt.entry.id, kind: prompt.entry.kind });
                                else change.mutate({ operation: 'delete', id: prompt.entry.id, kind: 'folder' });
                            }}
                        >
                            {prompt.operation === 'move' ? (
                                <label className="block space-y-2 text-sm">
                                    <span>{t('Destination', { name: prompt.entry.name })}</span>
                                    <select className="w-full rounded-md border bg-background p-2" value={value} onChange={event => setValue(event.target.value)}>
                                        <option value={prompt.entry.parentId ?? ROOT} disabled>
                                            {t('ChooseFolder')}
                                        </option>
                                        {targets.map(folder => (
                                            <option key={folder.id} value={folder.id}>
                                                {path(folder.id)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ) : prompt.operation === 'delete' ? (
                                <p className="text-sm">{t(nonEmpty ? 'NonEmpty' : 'ConfirmDelete', { name: prompt.entry.name })}</p>
                            ) : (
                                <Input
                                    autoFocus
                                    required
                                    maxLength={240}
                                    aria-label={t('Name')}
                                    placeholder={t('Name')}
                                    value={value}
                                    onChange={event => setValue(event.target.value)}
                                />
                            )}
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setPrompt(null)}>
                                    {knowledge('KnowledgeSources.Cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={
                                        change.isPending ||
                                        nonEmpty ||
                                        (prompt.operation === 'move' ? !targets.some(folder => folder.id === value) : prompt.operation !== 'delete' && !value.trim())
                                    }
                                >
                                    {prompt.operation === 'delete' ? t('Delete') : knowledge('KnowledgeSources.Save')}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
