'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';

type ModelOption = { id: string; name: string; dataSources: Array<{ connectionId: string }> };

export function AddDataSourceToKnowledgeModelDialog({ open, onOpenChange, connectionId }: { open: boolean; onOpenChange: (open: boolean) => void; connectionId: string }) {
    const t = useTranslations('Knowledge');
    const [knowledgeModelId, setKnowledgeModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const models = useQuery({
        queryKey: ['knowledge-models-for-source', connectionId],
        enabled: open,
        queryFn: () => executeActionClient<{ models: ModelOption[] }>('knowledge.list', {}),
    });
    const available = useMemo(
        () => models.data?.models.filter(model => !model.dataSources.some(source => source.connectionId === connectionId)) ?? [],
        [connectionId, models.data?.models],
    );
    useEffect(() => {
        if (!knowledgeModelId && available[0]) setKnowledgeModelId(available[0].id);
    }, [available, knowledgeModelId]);
    const save = useMutation({
        mutationFn: () =>
            knowledgeModelId
                ? executeActionClient('knowledge.addDataSource', { knowledgeModelId, connectionId })
                : executeActionClient('knowledge.create', { name: newModelName, connectionIds: [connectionId] }),
        onSuccess: () => {
            toast.success(t('DataSourceAdded'));
            onOpenChange(false);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.AddDataSource')),
    });
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('AddToKnowledgeModel')}</DialogTitle>
                    <DialogDescription>{t('AddDataSourceDescription')}</DialogDescription>
                </DialogHeader>
                {available.length ? (
                    <Select value={knowledgeModelId} onValueChange={setKnowledgeModelId}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {available.map(model => (
                                <SelectItem key={model.id} value={model.id}>
                                    {model.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Input value={newModelName} onChange={event => setNewModelName(event.target.value)} placeholder={t('NewModelName')} />
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={() => save.mutate()} disabled={(!knowledgeModelId && !newModelName.trim()) || save.isPending}>
                        {save.isPending ? t('Saving') : knowledgeModelId ? t('AddDataSource') : t('CreateModel')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
