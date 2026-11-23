'use client';

import { useEffect, useEffectEvent, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { IconFileTypeSql } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FilePlus2, FileText, LibraryBig, FolderInput, Settings, FolderPlus, MoreHorizontal, PanelLeft, Pencil, Pin, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useRouter } from 'next/navigation';
import { KnowledgeNavigation, TreeDisclosure, treeRowClassName, modelActionParser, serializeKnowledge, type ModelAction, type NavigationIndex } from './knowledge-navigation';
import { KnowledgeSourcesPanel } from './knowledge-connections-panel';
import { QUERY_FOLDER, type NavigationHit } from '@dory/shared/utils/knowledge-directory';
import { DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { providers, type Provider } from './document-directory';
import { toast } from 'sonner';

import { FileTreeName } from '@/components/ai-elements/file-tree';
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
import { buildDocumentDirectory, getRootFolders, ROOT, storedFolderId, type DirectoryData, type DocumentFolder, type DirectoryDocument } from './document-directory';
import type { KnowledgeModelView } from './knowledge-page.client';
import { DirectoryFolderIcon, SourceLogo } from './source-logo';
import dynamic from 'next/dynamic';
import { KnowledgeGuide } from './knowledge-guide';
import { SourceEditor, SourceViewer, UploadSourcesDialog, type KnowledgeSourceSummary } from './knowledge-sources-panel';

const GenerateDocumentsDialog = dynamic(() => import('./generate-documents-dialog').then(module => module.GenerateDocumentsDialog));
type Entry = { id: string; kind: 'folder' | 'document'; name: string; parentId: string | null };
type Command =
    | { operation: 'create'; parentId: string | null; name: string }
    | { operation: 'move'; id: string; kind: Entry['kind']; parentId: string | null }
    | { operation: 'rename'; id: string; kind: Entry['kind']; name: string }
    | { operation: 'delete'; id: string; kind: 'folder' };
type Prompt = { operation: 'create'; folderId: string } | { operation: 'move' | 'rename' | 'delete'; entry: Entry };
export type BrowserWorkspace = {
    navigation: NavigationIndex;
    organizationSlug: string;
    section: string;
    header: (generate: ReactNode) => ReactNode;
    createModel: () => void;
    openSettings: () => void;
};
type Props = {
    workspace: BrowserWorkspace;
    alternate: ReactNode;
    model: KnowledgeModelView;
    organization: string;
    sources: KnowledgeSourceSummary[];
    directory?: DirectoryData;
    directoryPending: boolean;
    directoryError?: string;
    sourcesPending: boolean;
    sourcesError?: string;
};
type Destination = { folder: string | null; file: string | null; tab?: string | null; query?: string | null; modelId?: string; manageSource?: string; modelAction?: ModelAction };
const locationParsers = {
    folder: parseAsString,
    file: parseAsString,
    tab: parseAsString,
    query: parseAsString,
    source: parseAsString,
    manageSource: parseAsString,
    modelAction: modelActionParser,
    querySearch: parseAsString,
    definition: parseAsString,
    rule: parseAsString,
};
const emptyDirectory: DirectoryData = { canWrite: false, folders: [], connectors: [] };

export function DocumentBrowser({ workspace, alternate, model, organization, sources, directory, directoryPending, directoryError, sourcesPending, sourcesError }: Props) {
    const t = useTranslations('Knowledge.Documents');
    const knowledge = useTranslations('Knowledge');
    const common = useTranslations('Common');
    const client = useQueryClient();
    const data = directory ?? emptyDirectory;
    const { id: modelId, dataSources } = model;
    const [generationOpenedAt, setGenerationOpenedAt] = useState<number | null>(null);
    const guide = model.businessContextMd.trim() ? t('Guide') : null;
    const rootName = t('RootDirectory');
    const router = useRouter();
    const [localAction, setSourceAction] = useState<{ provider?: Provider; connectorId?: string } | null>(null);
    const index = useMemo(() => buildDocumentDirectory(guide, data, sources, rootName), [data, sources, guide, rootName]);
    const [{ folder: location, file, query: queryId, manageSource, modelAction }, setLocation] = useQueryStates(locationParsers, { history: 'push' });
    const sourceAction = localAction ?? (manageSource ? { connectorId: manageSource } : null);
    const closeSourceAction = () => {
        setSourceAction(null);
        if (manageSource) void setLocation({ manageSource: null }, { history: 'replace' });
    };
    const [editingId, setEditingId] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [pending, setPending] = useState<Destination | null>(null);
    const [pendingPath, setPendingPath] = useState<string | null>(null);
    const [pendingCreate, setPendingCreate] = useState(false);
    // A history traversal can change the URL before a dirty editor is dismissed.
    const documentsView = workspace.section === 'documents';
    const historyChanged = dirty && editingId !== null && (file !== editingId || !documentsView);
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
        const editingUrl = window.location.href;
        const fromPath = window.location.pathname;
        const editingState = window.history.state;
        const protectModelChange = (event: PopStateEvent) => {
            if (window.location.pathname === fromPath) return;
            const destination = window.location.pathname + window.location.search + window.location.hash;
            event.stopImmediatePropagation();
            window.history.pushState(editingState, '', editingUrl);
            setPendingPath(destination);
        };
        window.addEventListener('beforeunload', protectDraft);
        window.addEventListener('popstate', protectModelChange, true);
        return () => {
            window.removeEventListener('beforeunload', protectDraft);
            window.removeEventListener('popstate', protectModelChange, true);
        };
    }, [dirty]);
    const trail = useMemo(() => {
        const folders = index.trail(current.id);
        return folders[0]?.id === ROOT ? folders : [index.root, ...folders];
    }, [index, current.id]);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set([ROOT]));
    const showQueries = workspace.section === 'queries';
    function currentTreeEntry(): Pick<NavigationHit, 'kind' | 'id'> | null {
        if (documentsView || historyChanged) {
            if (visibleId) return { kind: 'document', id: visibleId };
            if (location && location !== ROOT) return { kind: 'folder', id: location };
            return { kind: 'model', id: modelId };
        }
        if (showQueries) return queryId ? { kind: 'query', id: queryId } : { kind: 'folder', id: QUERY_FOLDER };
        return null;
    }
    const treeEntry = currentTreeEntry();
    const isCurrent = (kind: NavigationHit['kind'], id: string) => treeEntry?.kind === kind && treeEntry.id === id;
    const [queriesExpanded, setQueriesExpanded] = useState(showQueries);
    useEffect(() => {
        if (showQueries) setQueriesExpanded(true);
    }, [showQueries]);
    const queryEntries = useQuery({
        queryKey: ['knowledge-model', modelId, 'query-entries'],
        enabled: queriesExpanded || showQueries,
        queryFn: () =>
            executeActionClient<{ entries: { id: string; title: string; question: string }[] }>(
                'knowledge.queryEntries',
                { knowledgeModelId: modelId },
                { organizationId: organization },
            ),
    });
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
        const { modelId: target, folder, file, tab, query } = destination;
        if (target && target !== modelId) {
            router.push(
                serializeKnowledge('/' + workspace.organizationSlug + '/knowledge/' + encodeURIComponent(target), {
                    folder,
                    file,
                    tab,
                    query,
                    manageSource: destination.manageSource,
                    modelAction: destination.modelAction,
                }),
            );
        } else {
            void setLocation({ folder, file, tab: tab ?? 'documents', query: query ?? null, source: null, querySearch: null, definition: null, rule: null, manageSource: null });
        }
        setExpanded(previous => new Set([...previous, ...index.trail(destination.folder ?? ROOT).map(folder => folder.id)]));
        setDrawer(false);
    }
    function navigate(id: string, doc?: DirectoryDocument, edit = false) {
        const destination = { folder: id, file: doc?.id ?? null };
        if (dirty && destination.file === editingId) {
            setDrawer(false);
        } else if (dirty) {
            setDrawer(false);
            setPending(destination);
        } else {
            openDestination(destination, edit);
        }
    }
    function keepEditing() {
        setPendingPath(null);
        setPendingCreate(false);
        if (historyChanged && selected) void setLocation({ folder: selected.parentId, file: selected.id, tab: 'documents', query: null });
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
    function createInFolder(kind: 'folder' | 'document' | 'upload', folderId: string) {
        if (kind === 'folder') ask({ operation: 'create', folderId });
        else openFileCreation(kind, folderId);
    }
    function creationItems(onCreate: (kind: 'folder' | 'document' | 'upload') => void) {
        return (
            <>
                <DropdownMenuItem onSelect={() => onCreate('folder')}>
                    <FolderPlus />
                    {t('NewFolder')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCreate('document')}>
                    <FilePlus2 />
                    {t('Create')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCreate('upload')}>
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
                            {creationItems(kind => createInFolder(kind, entry.id))}
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
                    aria-current={isCurrent('document', doc.id) ? 'page' : undefined}
                    className="flex w-full min-w-0 items-center gap-2 rounded-md py-1.5 ps-7 pe-2 text-start text-sm hover:bg-muted aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground"
                    onClick={() => navigate(doc.parentId, doc)}
                >
                    {doc.source ? <FileText size={16} className="shrink-0 text-muted-foreground" /> : <Pin size={16} className="shrink-0" />}
                    <FileTreeName title={doc.name}>{doc.name}</FileTreeName>
                </button>
            </li>
        );
    }
    function treeNode(folder: DocumentFolder): ReactNode {
        const children = index.children.get(folder.id) ?? [];
        const files = index.documentsByFolder.get(folder.id) ?? [];
        const hasChildren = children.length > 0 || files.length > 0;
        const isOpen = expanded.has(folder.id);
        return (
            <li key={folder.id}>
                <div
                    {...dropTarget(folder)}
                    {...draggable({ ...folder, kind: 'folder' }, data.canWrite && !folder.managed && folder.id !== ROOT)}
                    className={`${treeRowClassName} px-1 text-sm ${over === folder.id ? 'ring-2 ring-ring' : ''}`}
                >
                    <TreeDisclosure
                        open={isOpen}
                        label={t(isOpen ? 'Collapse' : 'Expand', { name: folder.name })}
                        onToggle={
                            hasChildren
                                ? () =>
                                      setExpanded(previous => {
                                          const next = new Set(previous);
                                          if (isOpen) next.delete(folder.id);
                                          else next.add(folder.id);
                                          return next;
                                      })
                                : undefined
                        }
                    />
                    <button
                        aria-current={isCurrent('folder', folder.id) ? 'page' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start"
                        onClick={() => navigate(folder.id)}
                    >
                        <DirectoryFolderIcon folder={folder} open={isOpen} className="size-4 shrink-0 text-muted-foreground" />
                        <FileTreeName title={folder.name}>{folder.name}</FileTreeName>
                        <span className="ms-auto rounded-md border px-1.5 text-xs tabular-nums text-muted-foreground">{index.counts.get(folder.id) ?? 0}</span>
                    </button>
                    {data.canWrite && !folder.managed && actions({ ...folder, kind: 'folder' })}
                    {folder.managed && folder.provider && (
                        <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('Actions', { name: folder.name })}
                            onClick={() => {
                                setDrawer(false);
                                setSourceAction({ connectorId: folder.id });
                            }}
                        >
                            <MoreHorizontal />
                        </Button>
                    )}
                </div>
                {isOpen && hasChildren && (
                    <ul className="ms-3 border-s ps-1">
                        {children.map(treeNode)}
                        {files.map(fileNode)}
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
    const creationPath = (id: string) => [model.name, ...folderPath(id)].join(' / ');
    function selectEntry(hit: NavigationHit) {
        const destination = {
            modelId: hit.modelId,
            folder: hit.kind === 'folder' && hit.id !== QUERY_FOLDER ? hit.id : null,
            file: hit.kind === 'document' ? hit.id : null,
            tab: hit.kind === 'query' || (hit.kind === 'folder' && hit.id === QUERY_FOLDER) ? 'queries' : 'documents',
            query: hit.kind === 'query' ? hit.id : null,
        };
        if (dirty) {
            setDrawer(false);
            setPending(destination);
        } else openDestination(destination);
    }
    function selectQueries(id?: string) {
        setQueriesExpanded(true);
        const dest = { folder: null, file: null, tab: 'queries', query: id ?? null };
        if (dirty) {
            setDrawer(false);
            setPending(dest);
        } else openDestination(dest);
    }
    function runModelAction(action: ModelAction) {
        setDrawer(false);
        if (action === 'settings') workspace.openSettings();
        else if (action === 'folder' || action === 'document' || action === 'upload') createInFolder(action, ROOT);
        else if (action !== 'linear' || workspace.navigation.canManageLinear) setSourceAction({ provider: action });
    }
    const runRequestedAction = useEffectEvent(runModelAction);
    useEffect(() => {
        if (!modelAction || directoryPending) return;
        if (workspace.navigation.canWrite && data.canWrite) runRequestedAction(modelAction);
        void setLocation({ modelAction: null }, { history: 'replace' });
    }, [modelAction, directoryPending, workspace.navigation.canWrite, data.canWrite, setLocation]);

    function modelMenu(target: NavigationIndex['models'][number]) {
        if (!workspace.navigation.canWrite || (target.id === modelId && !data.canWrite)) return null;
        function selectAction(action: ModelAction) {
            if (target.id === modelId) return runModelAction(action);
            const destination = { modelId: target.id, folder: null, file: null, modelAction: action };
            setDrawer(false);
            if (dirty) setPending(destination);
            else openDestination(destination);
        }
        return (
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={knowledge('ActionsForModel', { name: target.name })}>
                        <MoreHorizontal />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="data-[state=closed]:animate-none"
                    onCloseAutoFocus={event => {
                        if (document.querySelector('[role="dialog"][data-state="open"]')) event.preventDefault();
                    }}
                >
                    <DropdownMenuItem onSelect={() => selectAction('settings')}>
                        <Settings />
                        {common('settings')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {creationItems(selectAction)}
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>{knowledge('KnowledgeSources.Tab')}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="data-[state=closed]:animate-none">
                            {providers.map(provider => (
                                <DropdownMenuItem key={provider} disabled={provider === 'linear' && !workspace.navigation.canManageLinear} onSelect={() => selectAction(provider)}>
                                    <SourceLogo provider={provider} className="size-4" />
                                    {provider === 'local' ? knowledge('Connections.Local') : provider === 'drive' ? 'Google Drive' : provider === 'github' ? 'GitHub' : 'Linear'}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }
    function queryNode(folder: DocumentFolder) {
        return (
            <li key={folder.id}>
                <div className={`${treeRowClassName} px-1`}>
                    <TreeDisclosure
                        open={queriesExpanded}
                        label={t(queriesExpanded ? 'Collapse' : 'Expand', { name: folder.name })}
                        onToggle={() => setQueriesExpanded(!queriesExpanded)}
                    />
                    <button
                        aria-current={isCurrent('folder', QUERY_FOLDER) ? 'page' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start text-sm"
                        onClick={() => selectQueries()}
                    >
                        <DirectoryFolderIcon folder={folder} className="size-4 shrink-0" />
                        <FileTreeName>{folder.name}</FileTreeName>
                    </button>
                </div>
                {queriesExpanded && (
                    <ul className="ms-3 border-s ps-1">
                        {queryEntries.isError && <li role="alert">{queryEntries.error.message}</li>}
                        {queryEntries.data?.entries.map(item => (
                            <li key={item.id}>
                                <button
                                    className="flex w-full items-center gap-2 rounded-md py-1.5 ps-7 pe-2 text-start text-sm hover:bg-muted aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground"
                                    aria-current={isCurrent('query', item.id) ? 'page' : undefined}
                                    onClick={() => selectQueries(item.id)}
                                >
                                    <IconFileTypeSql size={16} className="shrink-0 text-muted-foreground" />
                                    <FileTreeName>{item.title || item.question}</FileTreeName>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </li>
        );
    }
    function sidebar() {
        return (
            <KnowledgeNavigation
                organization={organization}
                models={
                    workspace.navigation.models.some(entry => entry.id === modelId)
                        ? workspace.navigation.models
                        : [...workspace.navigation.models, { id: modelId, name: model.name }]
                }
                active={modelId}
                selectedModelId={treeEntry?.kind === 'model' ? treeEntry.id : null}
                onSelect={selectEntry}
                onManage={(modelId, connectorId) => {
                    const destination = { modelId, folder: connectorId, file: null, manageSource: connectorId };
                    if (dirty) {
                        setDrawer(false);
                        setPending(destination);
                    } else openDestination(destination);
                }}
                modelMenu={modelMenu}
                create={
                    workspace.navigation.canWrite && (
                        <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={knowledge('NewModel')}
                            title={knowledge('NewModel')}
                            onClick={() => {
                                setDrawer(false);
                                if (dirty) setPendingCreate(true);
                                else workspace.createModel();
                            }}
                        >
                            <Plus />
                        </Button>
                    )
                }
            >
                {rootFolders.map(folder => (folder.id === QUERY_FOLDER ? queryNode(folder) : treeNode(folder)))}
                {(index.documentsByFolder.get(ROOT) ?? []).map(fileNode)}
            </KnowledgeNavigation>
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
    const rootFolders = getRootFolders(index, knowledge('VerifiedQueries'));
    const children = current.id === ROOT ? rootFolders : (index.children.get(current.id) ?? []);
    const documents = index.documentsByFolder.get(current.id) ?? [];
    const promptTitle = prompt?.operation === 'move' ? t('Move') : prompt?.operation === 'rename' ? t('Rename') : prompt?.operation === 'delete' ? t('Delete') : t('NewFolder');
    const nonEmpty = prompt?.operation === 'delete' && (Boolean(index.children.get(prompt.entry.id)?.length) || Boolean(index.counts.get(prompt.entry.id)));
    const targets =
        prompt?.operation === 'move'
            ? Array.from(index.folders.values())
                  .filter(folder => validDestination(prompt.entry, folder))
                  .sort((a, b) => path(a.id).localeCompare(path(b.id)))
            : [];
    const generateButton = data.canWrite && (
        <Button variant="outline" disabled={loading || Boolean(loadError)} onClick={() => setGenerationOpenedAt(Date.now())}>
            {knowledge('Generation.Title')}
        </Button>
    );
    return (
        <div className="grid h-full min-w-0 grid-rows-[minmax(0,1fr)] bg-background text-foreground md:grid-cols-[minmax(14rem,22%)_minmax(0,1fr)]">
            <aside className="hidden min-w-0 flex-col border-e bg-muted/20 md:flex">{sidebar()}</aside>
            <div className="flex min-w-0 flex-col">
                <header className="flex min-h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
                    <Button className="md:hidden" variant="outline" size="sm" onClick={() => setDrawer(true)}>
                        <PanelLeft />
                        {t('Directory')}
                    </Button>
                    <nav aria-label={t('Breadcrumb')} className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-2">
                        {(documentsView ? trail : [index.root]).map((folder, i) => (
                            <span key={folder.id} className="flex min-w-0 max-w-full items-center gap-1">
                                {i > 0 && <ChevronRight size={13} className="shrink-0 text-muted-foreground" />}
                                <button
                                    {...dropTarget(folder)}
                                    title={folder.name}
                                    aria-label={folder.id === ROOT ? rootName : undefined}
                                    aria-current={(folder.id === ROOT ? isCurrent('model', modelId) : isCurrent('folder', folder.id)) ? 'page' : undefined}
                                    className={`flex min-w-0 items-center gap-1.5 rounded px-1 text-sm hover:bg-muted ${i === trail.length - 1 ? 'font-medium' : 'text-muted-foreground'} ${over === folder.id ? 'ring-2 ring-ring' : ''}`}
                                    onClick={() => navigate(folder.id)}
                                >
                                    {folder.id === ROOT ? (
                                        <>
                                            <LibraryBig size={16} aria-hidden="true" />
                                            <span className="truncate">{model.name}</span>
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
                        {!documentsView && (
                            <>
                                <ChevronRight size={13} />
                                {showQueries ? (
                                    <button aria-current={isCurrent('folder', QUERY_FOLDER) ? 'page' : undefined} className="text-sm" onClick={() => selectQueries()}>
                                        {knowledge('VerifiedQueries')}
                                    </button>
                                ) : (
                                    <span className="text-sm">
                                        {knowledge(
                                            workspace.section === 'definitions'
                                                ? 'Definitions'
                                                : workspace.section === 'rules'
                                                  ? 'Extraction.BusinessRules'
                                                  : 'KnowledgeSources.Tab',
                                        )}
                                    </span>
                                )}
                                {showQueries && queryId && (
                                    <span aria-current="page" className="truncate text-sm">
                                        {' '}
                                        / {queryEntries.data?.entries.find(q => q.id === queryId)?.title}
                                    </span>
                                )}
                            </>
                        )}
                        {documentsView && selected && (
                            <span aria-current="page" className="flex min-w-0 max-w-full items-center gap-1 text-sm font-medium">
                                <ChevronRight size={13} className="shrink-0 text-muted-foreground" />
                                <span className="truncate">{selected.name}</span>
                            </span>
                        )}
                    </nav>
                    {workspace.header(generateButton)}
                </header>
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-5">
                    {loadError && (
                        <p role="alert" className="text-sm text-destructive">
                            {loadError}
                        </p>
                    )}
                    {!documentsView && !historyChanged ? (
                        alternate
                    ) : selected ? (
                        fileContent(selected)
                    ) : visibleId ? (
                        <p role="status" className="text-sm text-muted-foreground">
                            {loading ? t('Loading') : !loadError ? t('MissingFile') : null}
                        </p>
                    ) : (
                        <>
                            {current.id === ROOT && !unknownFolder && model.description && <p className="text-sm text-muted-foreground">{model.description}</p>}
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
                                                <button
                                                    className="flex w-full min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-4"
                                                    onClick={() => (folder.id === QUERY_FOLDER ? selectQueries() : navigate(folder.id))}
                                                >
                                                    <DirectoryFolderIcon folder={folder} card className="mb-1 size-16 text-muted-foreground" />
                                                    <span className="w-full truncate text-center text-sm font-medium" title={folder.name}>
                                                        {folder.name}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {folder.id === QUERY_FOLDER
                                                            ? knowledge('Readiness.Requirements.VerifiedQueries', { count: model.verifiedQueryCount })
                                                            : t('FileCount', { count: index.counts.get(folder.id) ?? 0 })}
                                                    </span>
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
                                    <>
                                        <ul className="divide-y rounded-lg border">{documents.map(documentRow)}</ul>
                                        {current.id === ROOT &&
                                            documents.every(doc => doc.source?.systemRole === 'analysis_rules') &&
                                            !data.folders.length &&
                                            !data.connectors.length && <div className="mt-3">{generateButton}</div>}
                                    </>
                                ) : (
                                    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                        {loading ? t('Loading') : !unknownFolder && !loadError ? t('Empty') : null}
                                        {!current.managed && !unknownFolder && !loading && !loadError && generateButton}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </div>
            {generationOpenedAt !== null && (
                <GenerateDocumentsDialog
                    opened={generationOpenedAt}
                    model={model}
                    organization={organization}
                    sources={sources}
                    folders={data.folders}
                    targets={[...index.folders.values()].filter(f => !f.managed).map(f => ({ id: f.id, label: f.id === ROOT ? model.name : path(f.id) }))}
                    target={documentsView && !current.managed ? current.id : ROOT}
                    currentId={documentsView ? selected?.source?.id : undefined}
                    close={() => setGenerationOpenedAt(null)}
                    created={async (docs, parent, landing) => {
                        await Promise.all([
                            client.invalidateQueries({ queryKey: ['knowledge-model', modelId] }),
                            client.invalidateQueries({ queryKey: ['knowledge-directory-search', organization] }),
                        ]);
                        setGenerationOpenedAt(null);
                        setExpanded(prev => new Set([...prev, ...index.trail(parent).map(f => f.id), ...docs.map(doc => doc.folderId)]));
                        const destination = { folder: landing.folderId, file: landing.id };
                        if (dirty) setPending(destination);
                        else openDestination(destination);
                    }}
                />
            )}
            <AlertDialog open={Boolean(pending || pendingCreate || pendingPath || historyChanged)} onOpenChange={open => !open && keepEditing()}>
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
                                if (pendingPath) {
                                    setDirty(false);
                                    setPendingPath(null);
                                    router.replace(pendingPath);
                                    return;
                                }
                                if (pendingCreate) {
                                    setPendingCreate(false);
                                    finishEdit();
                                    workspace.createModel();
                                    return;
                                }
                                openDestination(pending ?? { folder: location, file, tab: workspace.section, query: queryId });
                            }}
                        >
                            {t('DiscardChanges')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {sourceAction && (
                <KnowledgeSourcesPanel
                    key={sourceAction.connectorId ?? sourceAction.provider}
                    organization={organization}
                    knowledgeModelId={modelId}
                    action={sourceAction}
                    onDone={closeSourceAction}
                    onView={id => {
                        closeSourceAction();
                        navigate(id);
                    }}
                />
            )}
            <Sheet open={drawer} onOpenChange={setDrawer}>
                <SheetContent side="left" className="gap-0 text-foreground">
                    <SheetHeader className="sr-only">
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
                        targetPath={creationPath(fileCreation.folderId)}
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
                        targetPath={creationPath(fileCreation.folderId)}
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
                            {prompt.operation === 'create' && (
                                <DialogDescription className="break-words">{t('TargetFolder', { path: creationPath(prompt.folderId) })}</DialogDescription>
                            )}
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
