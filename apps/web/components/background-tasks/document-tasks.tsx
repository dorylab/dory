'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DocumentGenerationTask } from '@dory/shared/types/knowledge-document-draft';
import { CheckCircle2, ClipboardList, Loader2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { documentTaskHref, documentTasksKey } from '@/lib/client/document-generation-tasks';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';

const emptyTasks: DocumentGenerationTask[] = [];
export function DocumentTasks({ organizationId, userId }: { organizationId: string; userId: string }) {
    const t = useTranslations('Knowledge.Tasks');
    const format = useFormatter();
    const [open, setOpen] = useState(false);
    const previous = useRef<Map<string, DocumentGenerationTask['status']> | null>(null);
    const query = useQuery({
        queryKey: [...documentTasksKey(organizationId), userId],
        queryFn: ({ signal }) => executeActionClient<{ tasks: DocumentGenerationTask[] }>('knowledge.listDocumentGenerationTasks', {}, { organizationId, signal }),
        enabled: Boolean(userId),
        retry: 1,
        refetchInterval: query => (query.state.error ? false : query.state.data?.tasks.some(task => task.status === 'queued' || task.status === 'running') ? 2000 : 30_000),
    });
    const tasks = query.data?.tasks ?? emptyTasks;
    const running = tasks.filter(task => task.status === 'queued' || task.status === 'running').length;
    const ready = tasks.filter(task => task.status === 'ready').length;
    const visible = running > 0 || ready > 0;
    function href(task: DocumentGenerationTask) {
        const doc = task.documents[0];
        return documentTaskHref(organizationId, task.knowledgeModelId, task.status === 'saved' && doc ? { file: doc.id, folder: doc.folderId } : { generationTask: task.id });
    }
    useEffect(() => {
        if (!query.data) return;
        const statuses = new Map(tasks.map(task => [task.id, task.status]));
        if (previous.current) {
            for (const task of tasks) {
                if (previous.current.get(task.id) === task.status || !['ready', 'failed'].includes(task.status) || (open && visible)) continue;
                const options = {
                    id: 'document-task-' + task.id,
                    description: task.modelName + ' · ' + task.database,
                    position: 'bottom-right' as const,
                    action: (
                        <Button asChild size="sm" variant="outline">
                            <Link href={documentTaskHref(organizationId, task.knowledgeModelId, { generationTask: task.id })}>
                                {t(task.status === 'ready' ? 'Preview' : 'ReviewFailure')}
                            </Link>
                        </Button>
                    ),
                };
                if (task.status === 'ready') toast.success(t('Completed'), options);
                else toast.error(t('Failed'), options);
            }
        }
        previous.current = statuses;
    }, [tasks, query.data, organizationId, t, open, visible]);
    useEffect(() => {
        if (!visible) setOpen(false);
    }, [visible]);
    if (!visible) return null;
    return (
        <div className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40">
            <Popover
                open={open}
                onOpenChange={value => {
                    setOpen(value);
                    if (value) {
                        for (const task of tasks) toast.dismiss('document-task-' + task.id);
                        void query.refetch();
                    }
                }}
            >
                <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2 bg-popover text-popover-foreground shadow-md" aria-label={t('Title')}>
                        {running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ClipboardList className="size-4" aria-hidden="true" />}
                        <span aria-live="polite">{running ? t('RunningCount', { count: running }) : ready ? t('ReadyCount', { count: ready }) : t('Title')}</span>
                        {query.error && <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />}
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" sideOffset={12} className="w-[min(24rem,calc(100vw-2rem))] p-0" aria-label={t('Title')}>
                    <h2 className="border-b px-4 py-3 text-sm font-semibold">{t('Title')}</h2>
                    {query.error ? (
                        <div role="alert" className="p-4 text-sm">
                            <p>{t('LoadFailed')}</p>
                            <Button variant="link" onClick={() => query.refetch()}>
                                {t('Retry')}
                            </Button>
                        </div>
                    ) : query.isPending ? (
                        <p role="status" className="p-4 text-sm text-muted-foreground">
                            {t('Loading')}
                        </p>
                    ) : !tasks.length ? (
                        <p className="p-4 text-sm text-muted-foreground">{t('Empty')}</p>
                    ) : (
                        <ul className="max-h-[min(28rem,70dvh)] divide-y overflow-y-auto">
                            {tasks.map(task => (
                                <li key={task.id} className="space-y-2 p-4">
                                    <div className="flex items-start gap-2">
                                        {task.status === 'running' || task.status === 'queued' ? (
                                            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
                                        ) : task.status === 'failed' ? (
                                            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                                        ) : (
                                            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-medium">
                                                {task.modelName} · {task.database}
                                            </p>
                                            <p className="break-words text-xs text-muted-foreground">
                                                {t('Destination', { name: task.folderName ?? (task.folderId ? t('RemovedFolder') : task.modelName) })}
                                            </p>
                                            <time dateTime={task.createdAt} className="text-xs text-muted-foreground">
                                                {format.dateTime(new Date(task.createdAt), { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
                                            </time>
                                        </div>
                                    </div>
                                    <p role="status" className="text-sm">
                                        {task.phase === 'reading' ? t('Reading', { completed: task.completedTables, total: task.totalTables }) : t('Phase.' + task.phase)}
                                    </p>
                                    {task.error && (
                                        <p className="text-xs text-destructive">
                                            {['TABLES_UNAVAILABLE', 'AUTH_REQUIRED', 'ACCESS_DENIED', 'GENERATION_FAILED', 'INTERRUPTED'].includes(task.error)
                                                ? t('Errors.' + task.error)
                                                : task.error}
                                        </p>
                                    )}
                                    {['ready', 'failed', 'saved'].includes(task.status) && (
                                        <Button asChild size="sm" variant="outline">
                                            <Link href={href(task)} onClick={() => setOpen(false)}>
                                                {t(task.status === 'ready' ? 'Preview' : task.status === 'failed' ? 'ReviewFailure' : 'OpenDocuments')}
                                            </Link>
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
}
