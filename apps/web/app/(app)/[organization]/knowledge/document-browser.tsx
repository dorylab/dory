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
import { parseAsString, useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/registry/new-york-v4/ui/sheet';
import { buildDocumentDirectory, ROOT, storedFolderId, type DirectoryData, type DocumentFolder, type DirectoryDocument } from './document-directory';
import type { KnowledgeModelView } from './knowledge-page.client';
import { SourceLogo } from './source-logo';
import { KnowledgeGuide } from './knowledge-guide';
import { SourceEditor, SourceViewer, UploadSourcesDialog, type KnowledgeSourceSummary } from './knowledge-sources-panel';

type Entry = { id: string; kind: 'folder' | 'document'; name: string; parentId: string | null };
type Command =
    | { operation: 'create'; parentId: string | null; name: string }
    | { operation: 'move'; id: string; kind: Entry['kind']; parentId: string | null }
    | { operation: 'rename'; id: string; kind: Entry['kind']; name: string }
    | { operation: 'delete'; id: string; kind: 'folder' };
type Prompt = { operation: 'create'; folderId: string } | { operation: 'move' | 'rename' | 'delete'; entry: Entry };
type Props = {
    model: KnowledgeModelView;
    organization: string;
    sources: KnowledgeSourceSummary[];
    directory?: DirectoryData;
    directoryPending: boolean;
    directoryError?: string;
    sourcesPending: boolean;
    sourcesError?: string;
};
type Destination = { folder: string | null; file: string | null };
const locationParsers = { folder: parseAsString, file: parseAsString };
const emptyDirectory: DirectoryData = { canWrite: false, folders: [], connectors: [] };

export function DocumentBrowser({ model, organization, sources, directory, directoryPending, directoryError, sourcesPending, sourcesError }: Props) {
    const t = useTranslations('Knowledge.Documents');
    const knowledge = useTranslations('Knowledge');
    const client = useQueryClient();
    const data = directory ?? emptyDirectory;
    const { id: modelId, dataSources } = model;
    const guide = model.businessContextMd.trim() ? t('Guide') : null;
    const rootName = t('RootDirectory');
    const rulesAlias = t('RulesSearchAlias').toLocaleLowerCase();
    const index = useMemo(() => buildDocumentDirectory(guide, data, sources, rootName), [data, sources, guide, rootName]);
    const [{ folder: location, file }, setLocation] = useQueryStates(locationParsers, { history: 'push' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [pending, setPending] = useState<Destination | null>(null);
    // A history traversal can change the URL before a dirty editor is dismissed.
    const historyChanged = dirty && editingId !== null && file !== editingId;
    const visibleId = historyChanged ? editingId : file;
    const selected = visibleId ? index.documents.find(doc => doc.id === visibleId) : undefined;
    const current = index.folders.get(selected?.parentId ?? (location || ROOT)) ?? index.root;
    useEffect(() => {
        if (!dirty && editingId !== file) setEditingId(null);
    }, [dirty, editingId, file]);
    useEffect(() => {
        if (selected && !historyChanged && directory && !directoryPending && !sourcesPending && (location ?? ROOT) !== selected.parentId) {
            void setLocation({ folder: selected.parentId }, { history: 'replace' });
        }
    }, [selected, historyChanged, directory, directoryPending, sourcesPending, location, setLocation]);
    useEffect(() => {
        if (!dirty) return;
        const protectDraft = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', protectDraft);
        return () => window.removeEventListener('beforeunload', protectDraft);
    }, [dirty]);
    const trail = useMemo(() => {
        const folders = index.trail(current.id);
        return folders[0]?.id === ROOT ? folders : [index.root, ...folders];
    }, [index, current.id]);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set([ROOT]));
    const [search, setSearch] = useState('');
    const [drawer, setDrawer] = useState(false);
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    const [fileCreation, setFileCreation] = useState<{ kind: 'document' | 'upload'; folderId: string } | null>(null);
    const [value, setValue] = useState('');
    const [drag, setDrag] = useState<Entry | null>(null);
    const [over, setOver] = useState<string | null>(null);
    useEffect(() => {
        setExpanded(previous => (trail.every(folder => previous.has(folder.id)) ? previous : new Set([...previous, ...trail.map(folder => folder.id)])));
    }, [trail, visibleId]);

    const change = useMutation({
        mutationFn: (command: Command) =>
            executeActionClient<{ id: string }>('knowledge.changeDirectory', { knowledgeModelId: modelId, change: command }, { organizationId: organization }),
        onSuccess: async (_, command) => {
            const affectsSource = 'kind' in command && command.kind === 'document';
            const list = affectsSource ? 'knowledge-sources' : 'directory';
            await client.invalidateQueries({ queryKey: ['knowledge-model', modelId, list] });
            if (command.operation === 'create') navigate(command.parentId ?? ROOT);
            if (command.operation === 'delete' && location === command.id && prompt?.operation === 'delete') navigate(prompt.entry.parentId ?? ROOT);
            setPrompt(null);
        },
        onError: error => toast.error(error.message),
    });
    function openDestination(destination: Destination, edit = false) {
        setDirty(false);
        setPending(null);
        setEditingId(edit ? destination.file : null);
        void setLocation(destination);
        setExpanded(previous => new Set([...previous, ...index.trail(destination.folder ?? ROOT).map(folder => folder.id)]));
        setDrawer(false);
        setSearch('');
    }
    function navigate(id: string, doc?: DirectoryDocument, edit = false) {
        const destination = { folder: id, file: doc?.id ?? null };
        if (dirty && destination.file === editingId) {
            setDrawer(false);
            setSearch('');
        } else if (dirty) {
            setDrawer(false);
            setPending(destination);
        } else {
            openDestination(destination, edit);
        }
    }
    function keepEditing() {
        if (historyChanged && selected) void setLocation({ folder: selected.parentId, file: selected.id });
        setPending(null);
    }
    function finishEdit(removed = false) {
        setDirty(false);
        setEditingId(null);
        if (removed) void setLocation({ folder: null, file: null }, { history: 'replace' });
    }
    function ask(next: Prompt) {
        setValue(next.operation === 'rename' ? next.entry.name : next.operation === 'move' ? (next.entry.parentId ?? ROOT) : '');
        setDrawer(false);
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
                if (drag && validDestination(drag, folder)) change.mutate({ operation: 'move', id: drag.id, kind: drag.kind, parentId: storedFolderId(folder.id) });
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
    function openFileCreation(kind: 'document' | 'upload', folderId: string) {
        setDrawer(false);
        setFileCreation({ kind, folderId });
    }
    function creationItems(folderId: string) {
        return (
            <>
                <DropdownMenuItem onSelect={() => ask({ operation: 'create', folderId })}>
                    <FolderPlus />
                    {t('NewFolder')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openFileCreation('document', folderId)}>
                    <FilePlus2 />
                    {t('Create')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openFileCreation('upload', folderId)}>
                    <Upload />
                    {t('Upload')}
                </DropdownMenuItem>
            </>
        );
    }
    function actions(entry: Entry, fixedDocument?: DirectoryDocument) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={t('Actions', { name: entry.name })}>
                        <MoreHorizontal />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {fixedDocument && (
                        <DropdownMenuItem onSelect={() => navigate(fixedDocument.parentId, fixedDocument, true)}>
                            <Pencil />
                            {knowledge('KnowledgeSources.Edit')}
                        </DropdownMenuItem>
                    )}
                    {entry.kind === 'folder' && (
                        <>
                            {creationItems(entry.id)}
                            {entry.id !== ROOT && <DropdownMenuSeparator />}
                        </>
                    )}
                    {!fixedDocument && entry.id !== ROOT && (
                        <>
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
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }
    function fileNode(doc: DirectoryDocument) {
        return (
            <li key={doc.id}>
                <button
                    aria-current={selected?.id === doc.id ? 'page' : undefined}
                    className={`flex w-full min-w-0 items-center gap-2 rounded-md py-1.5 pe-2 text-start text-sm hover:bg-muted aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground ${doc.parentId === ROOT ? 'ps-2' : 'ps-7'}`}
                    onClick={() => navigate(doc.parentId, doc)}
                >
                    {doc.source ? <FileText size={15} className="shrink-0 text-muted-foreground" /> : <Pin size={15} className="shrink-0" />}
                    <span title={doc.name} className="truncate">
                        {doc.name}
                    </span>
                </button>
            </li>
        );
    }
    function treeNode(folder: DocumentFolder): ReactNode {
        const children = index.children.get(folder.id) ?? [];
        const files = index.documentsByFolder.get(folder.id) ?? [];
        const hasChildren = children.length > 0 || files.length > 0;
        const pinned = files[0]?.source === null ? files[0] : null;
        const isOpen = expanded.has(folder.id);
        return (
            <li key={folder.id}>
                <div
                    {...dropTarget(folder)}
                    {...draggable({ ...folder, kind: 'folder' }, data.canWrite && !folder.managed && folder.id !== ROOT)}
                    className={`flex min-w-0 items-center rounded-md px-1 text-sm hover:bg-muted ${!selected && current.id === folder.id ? 'bg-accent font-medium text-accent-foreground' : ''} ${over === folder.id ? 'ring-2 ring-ring' : ''}`}
                >
                    {hasChildren ? (
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
                        aria-current={!selected && current.id === folder.id ? 'location' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start"
                        onClick={() => navigate(folder.id)}
                    >
                        {folder.provider ? (
                            <SourceLogo provider={folder.provider} className="size-4 shrink-0" />
                        ) : current.id === folder.id ? (
                            <FolderOpen size={16} className="shrink-0" />
                        ) : (
                            <Folder size={16} className="shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate" title={folder.name}>
                            {folder.name}
                        </span>
                        <span className="ms-auto rounded-md border px-1.5 text-xs tabular-nums text-muted-foreground">{index.counts.get(folder.id) ?? 0}</span>
                    </button>
                    {data.canWrite && !folder.managed && actions({ ...folder, kind: 'folder' })}
                </div>
                {isOpen && hasChildren && (
                    <ul className="ms-3 border-s ps-1">
                        {pinned && fileNode(pinned)}
                        {children.map(treeNode)}
                        {(pinned ? files.slice(1) : files).map(fileNode)}
                    </ul>
                )}
            </li>
        );
    }
    const folderPath = (id: string) =>
        index
            .trail(id)
            .filter(folder => folder.id !== ROOT)
            .map(folder => folder.name);
    const path = (id: string) => folderPath(id).join(' / ') || rootName;
    const needle = search.trim().toLocaleLowerCase();
    function searchResult(entry: DocumentFolder | DirectoryDocument) {
        const doc = 'source' in entry ? entry : undefined;
        const folderId = doc?.parentId ?? entry.id;
        const provider = index.trail(folderId)[0]?.provider;
        const fullPath = [...folderPath(folderId), ...(doc ? [doc.name] : [])].join(' / ');
        return (
            <li key={entry.id}>
                <button className="flex w-full items-start gap-2 rounded-md p-2 text-start hover:bg-accent" onClick={() => navigate(folderId, doc)}>
                    {doc ? <FileText size={16} /> : <Folder size={16} />}
                    <span className="min-w-0 text-sm">
                        <span className="block break-words">{entry.name}</span>
                        {fullPath !== entry.name && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                {provider && <SourceLogo provider={provider} className="size-3 shrink-0" />}
                                <span className="min-w-0 break-words">{fullPath}</span>
                            </span>
                        )}
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
                      .map(searchResult),
                  ...index.documents
                      .filter(
                          doc =>
                              doc.name.toLocaleLowerCase().includes(needle) ||
                              doc.source?.fileName.toLocaleLowerCase().includes(needle) ||
                              (doc.source?.systemRole === 'analysis_rules' && rulesAlias.includes(needle)),
                      )
                      .map(searchResult),
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
                        {needle ? (
                            matches.length ? (
                                matches
                            ) : (
                                <li className="px-2 text-sm text-muted-foreground">{t('NoMatches')}</li>
                            )
                        ) : (
                            <>
                                {(index.children.get(ROOT) ?? []).map(treeNode)}
                                {(index.documentsByFolder.get(ROOT) ?? []).map(fileNode)}
                                {index.sourceRoots.map(treeNode)}
                            </>
                        )}
                    </ul>
                </nav>
            </div>
        );
    }
    function documentRow(doc: DirectoryDocument) {
        const entry: Entry = { ...doc, kind: 'document' };
        const writable = Boolean(data.canWrite && doc.source && !doc.source.connectorId);
        return (
            <li key={doc.id} {...draggable(entry, writable && !doc.source?.systemRole)} className="flex min-w-0 items-center gap-2 px-2 py-1.5">
                <Button variant="ghost" className="min-w-0 flex-1 justify-start" onClick={() => navigate(doc.parentId, doc)}>
                    {doc.source ? <FileText className="text-muted-foreground" /> : <Pin />}
                    <span className="truncate">{doc.name}</span>
                </Button>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {doc.source?.connectorProvider === 'github'
                        ? 'GitHub'
                        : doc.source?.connectorProvider === 'linear'
                          ? 'Linear'
                          : doc.source?.connectorProvider === 'drive'
                            ? 'Google Drive'
                            : 'Markdown'}
                </span>
                {writable && doc.source?.systemRole
                    ? actions(entry, doc)
                    : writable &&
                      doc.source && (
                          <>
                              <Button variant="ghost" size="sm" aria-label={knowledge('EditNamedDefinition', { name: doc.name })} onClick={() => navigate(doc.parentId, doc, true)}>
                                  <Pencil />
                                  {knowledge('KnowledgeSources.Edit')}
                              </Button>
                              {actions(entry)}
                          </>
                      )}
            </li>
        );
    }
    function fileContent(doc: DirectoryDocument) {
        if (!doc.source)
            return (
                <KnowledgeGuide
                    model={model}
                    organization={organization}
                    editing={editingId === doc.id}
                    canWrite={data.canWrite}
                    onEdit={() => setEditingId(doc.id)}
                    onCloseEditor={finishEdit}
                    onDirtyChange={setDirty}
                />
            );
        const writable = data.canWrite && !doc.source.connectorId;
        if (editingId === doc.id && writable)
            return (
                <SourceEditor
                    key={doc.id}
                    inline
                    open
                    source={doc.source}
                    organization={organization}
                    knowledgeModelId={modelId}
                    dataSources={dataSources}
                    onDirtyChange={setDirty}
                    onOpenChange={open => !open && finishEdit()}
                />
            );
        return (
            <SourceViewer
                title={doc.name}
                key={doc.id}
                source={doc.source}
                organization={organization}
                knowledgeModelId={modelId}
                onEdit={writable ? () => setEditingId(doc.id) : undefined}
            />
        );
    }
    const unknownFolder = !selected && Boolean(location && !index.folders.has(location));
    const loading = directoryPending || sourcesPending;
    const loadError = directoryError || sourcesError;
    const local = data.canWrite && !current.managed && !unknownFolder;
    const children = index.children.get(current.id) ?? [];
    const documents = index.documentsByFolder.get(current.id) ?? [];
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
                                    title={folder.name}
                                    aria-current={!selected && folder.id === current.id ? 'page' : undefined}
                                    className={`flex min-w-0 items-center gap-1.5 rounded px-1 text-sm hover:bg-muted ${i === trail.length - 1 ? 'font-medium' : 'text-muted-foreground'} ${over === folder.id ? 'ring-2 ring-ring' : ''}`}
                                    onClick={() => navigate(folder.id)}
                                >
                                    {folder.id === ROOT ? (
                                        <>
                                            <FolderOpen size={16} aria-hidden="true" />
                                            <span className="sr-only">{rootName}</span>
                                        </>
                                    ) : (
                                        <>
                                            {folder.provider && <SourceLogo provider={folder.provider} className="size-4 shrink-0" />}
                                            <span className="truncate">{folder.name}</span>
                                        </>
                                    )}
                                </button>
                            </span>
                        ))}
                        {selected && (
                            <span aria-current="page" className="flex min-w-0 max-w-full items-center gap-1 text-sm font-medium">
                                <ChevronRight size={13} className="shrink-0 text-muted-foreground" />
                                <span className="truncate">{selected.name}</span>
                            </span>
                        )}
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
                            <DropdownMenuContent align="end">{creationItems(current.id)}</DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                <div className="min-h-72 space-y-6 p-4 sm:p-5">
                    {loadError && (
                        <p role="alert" className="text-sm text-destructive">
                            {loadError}
                        </p>
                    )}
                    {selected ? (
                        fileContent(selected)
                    ) : visibleId ? (
                        <p role="status" className="text-sm text-muted-foreground">
                            {loading ? t('Loading') : !loadError ? t('MissingFile') : null}
                        </p>
                    ) : (
                        <>
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
                                            <Button size="sm" variant="outline" onClick={() => openFileCreation('document', current.id)}>
                                                <FilePlus2 />
                                                {t('Create')}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </div>
            <AlertDialog open={Boolean(pending || historyChanged)} onOpenChange={open => !open && keepEditing()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('UnsavedTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('UnsavedDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('KeepEditing')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={event => {
                                event.preventDefault();
                                openDestination(pending ?? { folder: location, file });
                            }}
                        >
                            {t('DiscardChanges')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Sheet open={drawer} onOpenChange={setDrawer}>
                <SheetContent side="left" className="gap-0 overflow-auto text-foreground">
                    <SheetHeader>
                        <SheetTitle>{t('Directory')}</SheetTitle>
                    </SheetHeader>
                    {sidebar()}
                </SheetContent>
            </Sheet>
            {fileCreation &&
                data.canWrite &&
                (fileCreation.kind === 'upload' ? (
                    <UploadSourcesDialog
                        open
                        markdownOnly
                        folderId={storedFolderId(fileCreation.folderId)}
                        targetPath={path(fileCreation.folderId)}
                        organization={organization}
                        knowledgeModelId={modelId}
                        dataSources={dataSources}
                        onOpenChange={open => !open && setFileCreation(null)}
                        onUploaded={() => navigate(fileCreation.folderId)}
                    />
                ) : (
                    <SourceEditor
                        open
                        source={null}
                        folderId={storedFolderId(fileCreation.folderId)}
                        targetPath={path(fileCreation.folderId)}
                        organization={organization}
                        knowledgeModelId={modelId}
                        dataSources={dataSources}
                        onOpenChange={open => !open && setFileCreation(null)}
                        onSaved={() => navigate(fileCreation.folderId)}
                    />
                ))}
            {prompt && data.canWrite && (
                <Dialog open onOpenChange={open => !open && !change.isPending && setPrompt(null)}>
                    <DialogContent className="text-foreground">
                        <DialogHeader>
                            <DialogTitle>{promptTitle}</DialogTitle>
                            {prompt.operation === 'create' && <DialogDescription className="break-words">{t('TargetFolder', { path: path(prompt.folderId) })}</DialogDescription>}
                        </DialogHeader>
                        <form
                            className="space-y-4"
                            onSubmit={event => {
                                event.preventDefault();
                                if (prompt.operation === 'create') change.mutate({ operation: 'create', name: value, parentId: storedFolderId(prompt.folderId) });
                                else if (prompt.operation === 'rename') change.mutate({ operation: 'rename', name: value, id: prompt.entry.id, kind: prompt.entry.kind });
                                else if (prompt.operation === 'move')
                                    change.mutate({ operation: 'move', parentId: storedFolderId(value), id: prompt.entry.id, kind: prompt.entry.kind });
                                else change.mutate({ operation: 'delete', id: prompt.entry.id, kind: 'folder' });
                            }}
                        >
                            {prompt.operation === 'move' ? (
                                <label className="block space-y-2 text-sm">
                                    <span>{t('Destination', { name: prompt.entry.name })}</span>
                                    <Select value={targets.some(folder => folder.id === value) ? value : ''} onValueChange={setValue}>
                                        <SelectTrigger className="w-full" aria-label={t('Destination', { name: prompt.entry.name })}>
                                            <SelectValue placeholder={t('ChooseFolder')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {targets.map(folder => (
                                                <SelectItem key={folder.id} value={folder.id}>
                                                    {path(folder.id)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
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
                                <Button type="button" variant="outline" disabled={change.isPending} onClick={() => setPrompt(null)}>
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
