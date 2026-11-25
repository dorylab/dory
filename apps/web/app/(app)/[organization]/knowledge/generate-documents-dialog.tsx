'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { newTokenId } from '@dory/shared/id';
import type { CreatedDocument, DocumentGenerationTaskDetail, DocumentGenerationTask, SignedDraftFile } from '@dory/shared/types/knowledge-document-draft';
import type { DatabaseMeta, DatabaseObjectRow } from '@dory/drivers/types';
import { FileText, Folder } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { documentTaskKey, documentTasksKey } from '@/lib/client/document-generation-tasks';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { MarkdownViewer, type KnowledgeSourceSummary } from './knowledge-sources-panel';
import { knowledgeSourceDisplayName } from './knowledge-source-display';
import type { KnowledgeModelView } from './knowledge-page.client';
import { ROOT, storedFolderId, type DirectoryData } from './document-directory';

const MAX_TABLES = 20;

type DraftFile = SignedDraftFile & { key: number; topic: number; selected: boolean };
type Props = {
    task?: DocumentGenerationTaskDetail;
    model: KnowledgeModelView;
    organization: string;
    sources: KnowledgeSourceSummary[];
    currentId?: string;
    opened: number;
    folders: DirectoryData['folders'];
    targets: { id: string; label: string }[];
    target: string;
    close: () => void;
    created: (documents: CreatedDocument[], parent: string, landing: CreatedDocument) => void;
};
function Picker({ label, value, change, children }: { label: string; value: string; change: (value: string) => void; children: ReactNode }) {
    return (
        <div className="grid min-w-0 gap-1 text-sm font-medium">
            <span>{label}</span>
            <Select value={value} onValueChange={change}>
                <SelectTrigger aria-label={label} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>{children}</SelectContent>
            </Select>
        </div>
    );
}
function toggle(items: string[], id: string) {
    return items.includes(id) ? items.filter(item => item !== id) : [...items, id];
}
function valid(name: string) {
    return Boolean(name.trim()) && name.trim() !== '.' && name.trim() !== '..' && !/[/\\\0]/.test(name) && name.trim().length <= 240;
}

export function GenerateDocumentsDialog({ task, model, organization, sources, currentId, folders, targets, target, opened, close, created }: Props) {
    const t = useTranslations('Knowledge.Generation');
    const locale = useLocale();
    const tasks = useTranslations('Knowledge.Tasks');
    const submission = useRef<{ fingerprint: string; id: string } | null>(null);
    const client = useQueryClient();
    const [connectionId, setConnection] = useState(task?.input.connectionId ?? model.dataSources[0]?.connectionId ?? '');
    const [db, setDb] = useState(task?.input.database ?? '');
    const [parent, setParent] = useState(task ? (task.folderId ?? ROOT) : target);
    const [search, setSearch] = useState('');
    const [chosen, setChosen] = useState<string[]>(task?.input.tables ?? []);
    const [selectionLimited, setSelectionLimited] = useState(false);
    const [goal, setGoal] = useState(task?.input.prompt ?? '');
    const [docIds, setDocIds] = useState<string[]>(task?.input.documentIds ?? []);
    const [queryIds, setQueryIds] = useState<string[]>(task?.input.queryIds ?? []);
    const [failed, setFailed] = useState<string[]>(task?.draft?.failedTables ?? []);
    const [topics, setTopics] = useState<string[]>(task?.draft?.topics.map(topic => topic.name) ?? []);
    const [files, setFiles] = useState<DraftFile[]>(
        () => task?.draft?.topics.flatMap((topic, i) => topic.documents.map(doc => ({ ...doc, topic: i, selected: true }))).map((doc, key) => ({ ...doc, key })) ?? [],
    );
    const [active, setActive] = useState(0);
    const [batchId, setBatch] = useState(task?.status === 'ready' ? task.id : '');
    const opts = { organizationId: organization, currentConnectionId: connectionId };
    const scope = { knowledgeModelId: model.id, connectionId };
    const databases = useQuery({
        queryKey: ['generation-databases', organization, connectionId],
        enabled: Boolean(connectionId),
        queryFn: ({ signal }) => executeActionClient<{ databases: DatabaseMeta[] }>('schema.listDatabases', { connectionId }, { ...opts, signal }),
    });
    const database = db || databases.data?.databases[0]?.value || '';
    const tables = useQuery({
        queryKey: ['generation-tables', organization, connectionId, database],
        enabled: Boolean(database),
        queryFn: ({ signal }) => executeActionClient<{ tables: DatabaseObjectRow[] }>('schema.listTables', { connectionId, database }, { ...opts, signal }),
    });
    const visibleTables = tables.data?.tables.filter(row => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
    const visibleNames = new Set(visibleTables.map(row => row.name));
    const allVisibleSelected = visibleTables.every(row => chosen.includes(row.name));
    const anyVisibleSelected = visibleTables.some(row => chosen.includes(row.name));
    const queries = useQuery({
        queryKey: ['knowledge-model', model.id, 'query-entries'],
        queryFn: ({ signal }) =>
            executeActionClient<{ entries: { id: string; title: string }[] }>('knowledge.queryEntries', { knowledgeModelId: model.id }, { organizationId: organization, signal }),
    });
    const generate = useMutation({
        mutationFn: () => {
            const input = { ...scope, database, tables: chosen, prompt: goal, documentIds: docIds, queryIds, locale, folderId: storedFolderId(parent) };
            const fingerprint = JSON.stringify(input);
            if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, id: newTokenId() };
            return executeActionClient<DocumentGenerationTaskDetail>(
                task?.status === 'failed' ? 'knowledge.retryDocumentGenerationTask' : 'knowledge.createDocumentGenerationTask',
                { ...input, submissionId: submission.current.id, id: task?.status === 'failed' ? task.id : submission.current.id },
                opts,
            );
        },
        onSuccess: result => {
            client.setQueryData(documentTaskKey(organization, result.id), result);
            client.setQueriesData<{ tasks: DocumentGenerationTask[] }>({ queryKey: documentTasksKey(organization) }, previous =>
                previous ? { tasks: [result, ...previous.tasks.filter(item => item.id !== result.id)] } : previous,
            );
            void client.invalidateQueries({ queryKey: documentTasksKey(organization) });
            toast.success(tasks('Submitted'), { id: 'document-task-' + result.id });
            close();
        },
    });
    const selected = files.filter(f => f.selected);
    const selectedTopics = topics.map((name, i) => ({ name: name.trim(), documents: selected.filter(f => f.topic === i) })).filter(t => t.documents.length);
    const localFolder = (name: string) => folders.find(f => f.parentId === storedFolderId(parent) && f.name === name.trim());
    const collision = (doc: DraftFile) => {
        const name = topics[doc.topic].trim(),
            file = doc.fileName.trim(),
            folder = localFolder(name);
        return (
            sources.some(s => !s.connectorId && ((s.folderId === storedFolderId(parent) && s.fileName === name) || (folder && s.folderId === folder.id && s.fileName === file))) ||
            (folder && folders.some(f => f.parentId === folder.id && f.name === file)) ||
            selected.some(other => other.key !== doc.key && topics[other.topic].trim() === name && other.fileName.trim() === file)
        );
    };
    const badName = (doc: DraftFile) => !valid(topics[doc.topic]) || !valid(doc.fileName) || !/^.+\.(md|markdown)$/i.test(doc.fileName.trim());
    const validParent = targets.some(folder => folder.id === parent);
    const invalid = !validParent || selected.some(f => badName(f) || collision(f));
    const save = useMutation({
        mutationFn: () =>
            executeActionClient<{ documents: CreatedDocument[] }>(
                'knowledge.createDocumentBatch',
                {
                    ...scope,
                    batchId,
                    taskId: task?.id === batchId ? task.id : undefined,
                    folderId: storedFolderId(parent),
                    topics: selectedTopics.map(topic => ({
                        ...topic,
                        documents: topic.documents.map(({ fileName, contentText, evidence, proof }) => ({ fileName: fileName.trim(), contentText, evidence, proof })),
                    })),
                    elapsedMs: Math.max(0, Math.min(Date.now() - opened, 2147483647)),
                },
                opts,
            ),
        onError: () => client.invalidateQueries({ queryKey: ['knowledge-model', model.id] }),
        onSuccess: async result => {
            const order = selectedTopics.flatMap(topic => topic.documents);
            const first = order.findIndex(doc => doc.key === selected[0].key);
            await created(result.documents, parent, result.documents[first] ?? result.documents[0]);
            void client.invalidateQueries({ queryKey: documentTasksKey(organization) });
            void client.invalidateQueries({ queryKey: documentTaskKey(organization, batchId) });
        },
    });
    const preview = Boolean(batchId);
    const busy = generate.isPending || save.isPending;
    const doc = files.find(f => f.key === active);
    function patch(key: number, values: Partial<DraftFile>) {
        setFiles(previous => previous.map(f => (f.key === key ? { ...f, ...values } : f)));
    }
    function resetScope() {
        setChosen([]);
        setFailed([]);
        setSearch('');
        setSelectionLimited(false);
        generate.reset();
    }
    function selectAllTables() {
        const next = [...new Set([...chosen, ...visibleNames])];
        setChosen(next.slice(0, MAX_TABLES));
        setSelectionLimited(next.length > MAX_TABLES);
        setFailed([]);
    }
    function deselectAllTables() {
        setChosen(previous => previous.filter(name => !visibleNames.has(name)));
        setSelectionLimited(false);
        setFailed([]);
    }
    const references = [...sources].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open && !busy) close();
            }}
        >
            <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle>{t('Title')}</DialogTitle>
                    <DialogDescription>{t(preview ? 'Preview' : 'Scope')}</DialogDescription>
                </DialogHeader>
                {!validParent && (
                    <p role="alert" className="text-sm text-destructive">
                        {tasks('MissingDestination')}
                    </p>
                )}
                <div className="min-h-0 overflow-y-auto">
                    <fieldset disabled={busy} className="min-w-0">
                        {!preview ? (
                            <div className="space-y-4 pe-1">
                                {task?.error && task.error !== 'TABLES_UNAVAILABLE' && (
                                    <p role="alert" className="text-sm text-destructive">
                                        {['AUTH_REQUIRED', 'ACCESS_DENIED', 'GENERATION_FAILED', 'INTERRUPTED'].includes(task.error) ? tasks('Errors.' + task.error) : task.error}
                                    </p>
                                )}
                                {!model.dataSources.length && <p role="status">{t('NoSource')}</p>}
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <Picker
                                        label={t('Source')}
                                        value={connectionId}
                                        change={value => {
                                            setConnection(value);
                                            setDb('');
                                            resetScope();
                                        }}
                                    >
                                        {model.dataSources.map(s => (
                                            <SelectItem key={s.connectionId} value={s.connectionId}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </Picker>
                                    <Picker
                                        label={t('Database')}
                                        value={database}
                                        change={value => {
                                            setDb(value);
                                            resetScope();
                                        }}
                                    >
                                        {databases.data?.databases.map(d => (
                                            <SelectItem key={d.value} value={d.value}>
                                                {d.label}
                                            </SelectItem>
                                        ))}
                                    </Picker>
                                    <Picker label={t('Destination')} value={parent} change={setParent}>
                                        {targets.map(f => (
                                            <SelectItem key={f.id} value={f.id}>
                                                {f.label}
                                            </SelectItem>
                                        ))}
                                    </Picker>
                                </div>
                                <section className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h3 className="text-sm font-semibold">{t('Tables', { count: chosen.length })}</h3>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={busy || databases.isFetching || tables.isFetching || !visibleTables.length || allVisibleSelected}
                                                onClick={selectAllTables}
                                            >
                                                {t('SelectAll')}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={busy || databases.isFetching || tables.isFetching || !anyVisibleSelected}
                                                onClick={deselectAllTables}
                                            >
                                                {t('DeselectAll')}
                                            </Button>
                                        </div>
                                    </div>
                                    <Input
                                        aria-label={t('Search')}
                                        placeholder={t('Search')}
                                        value={search}
                                        onChange={e => {
                                            setSearch(e.target.value);
                                            setSelectionLimited(false);
                                        }}
                                    />
                                    {selectionLimited && (
                                        <p role="status" className="text-xs text-muted-foreground">
                                            {t('TableSelectionLimit', { limit: MAX_TABLES })}
                                        </p>
                                    )}
                                    <div className="grid max-h-48 gap-1 overflow-auto rounded-md border p-2 sm:grid-cols-2">
                                        {visibleTables.map(row => (
                                            <label key={row.name} className="flex items-center gap-2 break-all text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={chosen.includes(row.name)}
                                                    disabled={chosen.length >= MAX_TABLES && !chosen.includes(row.name)}
                                                    onChange={() => {
                                                        setChosen(toggle(chosen, row.name));
                                                        setFailed([]);
                                                        setSelectionLimited(false);
                                                    }}
                                                />
                                                {row.name}
                                            </label>
                                        ))}
                                        {(databases.isFetching || tables.isFetching) && <span role="status">{t('Loading')}</span>}
                                        {tables.data && !visibleTables.length && <span>{t('NoTables')}</span>}
                                    </div>
                                    {[databases, tables].map(
                                        (q, i) =>
                                            q.error && (
                                                <div role="alert" key={i}>
                                                    {q.error.message}{' '}
                                                    <Button variant="link" onClick={() => q.refetch()}>
                                                        {t('Retry')}
                                                    </Button>
                                                </div>
                                            ),
                                    )}
                                </section>
                                <details className="rounded-md border p-3">
                                    <summary className="cursor-pointer text-sm font-medium">{t('Background')}</summary>
                                    <div className="mt-3 space-y-3">
                                        <label className="grid gap-1 text-sm">
                                            {t('Goal')}
                                            <Textarea value={goal} maxLength={4000} onChange={e => setGoal(e.target.value)} />
                                        </label>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {[
                                                {
                                                    title: t('Documents'),
                                                    items: references.map(s => ({
                                                        id: s.id,
                                                        title: knowledgeSourceDisplayName(s) + (s.id === currentId ? ' · ' + t('Current') : ''),
                                                    })),
                                                    ids: docIds,
                                                    set: setDocIds,
                                                },
                                                { title: t('Queries'), items: queries.data?.entries ?? [], ids: queryIds, set: setQueryIds },
                                            ].map(list => (
                                                <section key={list.title}>
                                                    <h4 className="text-sm font-medium">{list.title}</h4>
                                                    <div className="max-h-36 overflow-auto">
                                                        {list.items.map(item => (
                                                            <label className="flex items-center gap-2 py-1 text-sm" key={item.id}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={list.ids.includes(item.id)}
                                                                    disabled={list.ids.length >= 10 && !list.ids.includes(item.id)}
                                                                    onChange={() => list.set(toggle(list.ids, item.id))}
                                                                />
                                                                {item.title}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </section>
                                            ))}
                                        </div>
                                        {queries.error && <p role="alert">{queries.error.message}</p>}
                                    </div>
                                </details>
                                {failed.length > 0 && (
                                    <div role="alert" className="space-y-1 text-sm">
                                        <p>{t('Failed')}</p>
                                        <ul>
                                            {failed.map(s => (
                                                <li key={s}>{s}</li>
                                            ))}
                                        </ul>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setChosen(chosen.filter(s => !failed.includes(s)));
                                                setFailed([]);
                                            }}
                                        >
                                            {t('Exclude')}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid min-h-64 gap-4 md:grid-cols-[minmax(13rem,1fr)_2fr]">
                                <div className="md:col-span-2">
                                    <Picker label={t('Destination')} value={parent} change={setParent}>
                                        {targets.map(folder => (
                                            <SelectItem key={folder.id} value={folder.id}>
                                                {folder.label}
                                            </SelectItem>
                                        ))}
                                    </Picker>
                                </div>
                                <div className="max-h-[58vh] space-y-3 overflow-auto border-e pe-3">
                                    {topics.map((name, i) => (
                                        <section key={i}>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    aria-label={name}
                                                    checked={files.some(f => f.topic === i && f.selected)}
                                                    onChange={e => setFiles(files.map(f => (f.topic === i ? { ...f, selected: e.target.checked } : f)))}
                                                />
                                                <Folder className="size-4 shrink-0" />
                                                <Input
                                                    aria-label={t('Folder')}
                                                    value={name}
                                                    maxLength={240}
                                                    onChange={e => setTopics(topics.map((n, j) => (i === j ? e.target.value : n)))}
                                                />
                                            </div>
                                            {localFolder(name) && <small className="ps-6 text-muted-foreground">{t('Reuse')}</small>}
                                            <ul className="ms-3 border-s ps-2">
                                                {files
                                                    .filter(f => f.topic === i)
                                                    .map(f => (
                                                        <li key={f.key}>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    aria-label={f.fileName}
                                                                    checked={f.selected}
                                                                    onChange={e => patch(f.key, { selected: e.target.checked })}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    aria-pressed={active === f.key}
                                                                    onClick={() => setActive(f.key)}
                                                                    className="flex min-w-0 items-center gap-1 rounded p-1 text-start text-sm aria-pressed:bg-accent"
                                                                >
                                                                    <FileText className="size-4 shrink-0" />
                                                                    <span className="truncate">{f.fileName}</span>
                                                                </button>
                                                            </div>
                                                            {f.selected && (badName(f) || collision(f)) && (
                                                                <p role="alert" className="text-xs text-destructive">
                                                                    {t(badName(f) ? 'InvalidName' : 'Collision')}
                                                                </p>
                                                            )}
                                                        </li>
                                                    ))}
                                            </ul>
                                        </section>
                                    ))}
                                </div>
                                {doc && (
                                    <div className="min-w-0 space-y-3">
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <label className="grid gap-1 text-sm font-medium">
                                                {t('Filename')}
                                                <Input value={doc.fileName} maxLength={240} onChange={e => patch(doc.key, { fileName: e.target.value })} />
                                            </label>
                                            <Picker label={t('Move')} value={String(doc.topic)} change={value => patch(doc.key, { topic: Number(value) })}>
                                                {topics.map((name, i) => (
                                                    <SelectItem key={i} value={String(i)}>
                                                        {name}
                                                    </SelectItem>
                                                ))}
                                            </Picker>
                                        </div>
                                        <article className="max-h-[48vh] overflow-auto rounded-md border p-4">
                                            <MarkdownViewer mode="static">{doc.contentText}</MarkdownViewer>
                                        </article>
                                    </div>
                                )}
                            </div>
                        )}
                    </fieldset>
                </div>
                {(save.error || generate.error) && (
                    <p role="alert" className="text-sm text-destructive">
                        {(save.error ?? generate.error)?.message}
                    </p>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={close}>
                        {t('Cancel')}
                    </Button>
                    {preview ? (
                        <>
                            <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                    setBatch('');
                                    save.reset();
                                }}
                            >
                                {t('Back')}
                            </Button>
                            <Button disabled={busy || invalid || !selected.length} onClick={() => save.mutate()}>
                                {save.isPending
                                    ? t('Saving')
                                    : t('Create', {
                                          folders: new Set(selectedTopics.filter(topic => !localFolder(topic.name)).map(topic => topic.name)).size,
                                          docs: selected.length,
                                      })}
                            </Button>
                        </>
                    ) : (
                        <Button disabled={busy || !validParent || !database || !chosen.length} onClick={() => generate.mutate()}>
                            {generate.isPending ? tasks('Submitting') : t(task?.status === 'failed' ? 'Retry' : 'Generate')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
