'use client';

import { newEntityId } from '@dory/shared/id';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { refreshQueryLibraries } from '@/lib/knowledge-query-cache';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

type KnowledgeModelOption = { id: string; name: string };

export function AddVerifiedQueryDialog({
    open,
    onOpenChange,
    connectionId,
    sql,
    sourceType,
    sourceId,
    model,
    initialTitle = '',
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    model?: { id: string; dataSources: { connectionId: string; name: string }[] };
    connectionId?: string | null;
    sql?: string | null;
    sourceType: string;
    sourceId?: string | null;
    initialTitle?: string;
}) {
    const t = useTranslations('Knowledge');
    const client = useQueryClient();
    const requestId = useRef('');
    const [selectedConnection, setConnection] = useState('');
    const [existing, setExisting] = useState('');
    const [draft, setDraft] = useState('');
    const targetConnection = model ? selectedConnection : connectionId;
    const candidates = useQuery({
        queryKey: ['knowledge-query-options', targetConnection],
        enabled: open && Boolean(model && targetConnection),
        queryFn: () =>
            executeActionClient<{ queries: { id: string; title: string }[] }>(
                'knowledge.queryOptions',
                { connectionId: targetConnection },
                { currentConnectionId: targetConnection },
            ),
    });
    const [knowledgeModelId, setKnowledgeModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const [title, setTitle] = useState(initialTitle);
    const [description, setDescription] = useState('');
    const models = useQuery({
        queryKey: ['knowledge-model-options', connectionId],
        enabled: open && !model && Boolean(connectionId),
        queryFn: () => executeActionClient<{ models: KnowledgeModelOption[] }>('knowledge.list', { connectionId }, { currentConnectionId: connectionId ?? null }),
    });
    useEffect(() => {
        if (!open) return;
        requestId.current = newEntityId();
        setConnection(model?.dataSources[0]?.connectionId ?? '');
        setExisting('');
        setDraft('');
        setTitle(initialTitle);
        setDescription('');
        setNewModelName('');
        setKnowledgeModelId('');
    }, [open, initialTitle, model?.id]);
    useEffect(() => {
        if (!knowledgeModelId && models.data?.models[0]) setKnowledgeModelId(models.data.models[0].id);
    }, [models.data, knowledgeModelId]);
    const save = useMutation({
        mutationFn: async () => {
            return executeActionClient(
                'knowledge.saveQuery',
                {
                    requestId: requestId.current,
                    knowledgeModelId: model?.id || knowledgeModelId || undefined,
                    newModelName: model || knowledgeModelId ? undefined : newModelName,
                    sourceConnectionId: targetConnection,
                    existingQueryId: existing || undefined,
                    title: existing ? undefined : title,
                    description: existing ? undefined : description.trim() || null,
                    sql: existing ? undefined : model ? draft : sql,
                    sourceType,
                    sourceId,
                },
                { currentConnectionId: targetConnection },
            );
        },
        onSuccess: async () => {
            await refreshQueryLibraries(client);
            toast.success(t('VerifiedQueryAdded'));
            onOpenChange(false);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.AddVerifiedQuery')),
    });
    const hasModels = Boolean(models.data?.models.length);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('AddVerifiedQuery')}</DialogTitle>
                    <DialogDescription>{t('AddVerifiedQueryDescription')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    {model ? (
                        <>
                            <Select
                                value={selectedConnection}
                                onValueChange={value => {
                                    setConnection(value);
                                    setExisting('');
                                }}
                            >
                                <SelectTrigger aria-label={t('QueryConnection')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {model.dataSources.map(source => (
                                        <SelectItem key={source.connectionId} value={source.connectionId}>
                                            {source.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={existing || '__new'} onValueChange={v => setExisting(v === '__new' ? '' : v)}>
                                <SelectTrigger aria-label={t('SelectSavedQuery')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__new">{t('NewSql')}</SelectItem>
                                    {candidates.data?.queries.map(query => (
                                        <SelectItem key={query.id} value={query.id}>
                                            {query.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {candidates.isError && <p role="alert">{candidates.error.message}</p>}
                            {!existing && <Textarea aria-label="SQL" value={draft} onChange={event => setDraft(event.target.value)} />}
                        </>
                    ) : hasModels ? (
                        <Select value={knowledgeModelId} onValueChange={setKnowledgeModelId}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {models.data!.models.map(model => (
                                    <SelectItem key={model.id} value={model.id}>
                                        {model.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Input value={newModelName} onChange={event => setNewModelName(event.target.value)} placeholder={t('NewModelName')} />
                    )}
                    {!existing && <Input value={title} onChange={event => setTitle(event.target.value)} placeholder={t('VerifiedQueryTitlePlaceholder')} />}
                    {!existing && (
                        <Textarea aria-label={t('VerifiedQueryDescription')} value={description} onChange={event => setDescription(event.target.value)} maxLength={4000} />
                    )}
                    {!model && <Textarea className="min-h-40 font-mono" value={sql ?? ''} readOnly />}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        onClick={() => save.mutate()}
                        disabled={
                            !targetConnection ||
                            (!existing && (!(model ? draft : sql)?.trim() || !title.trim())) ||
                            (!model && !knowledgeModelId && !newModelName.trim()) ||
                            save.isPending
                        }
                    >
                        {save.isPending ? t('Saving') : t('AddVerifiedQuery')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
