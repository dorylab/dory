'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

export function AddKnowledgeDocumentDialog({ title, text, connectionIds, onClose }: { title: string; text: string; connectionIds: string[]; onClose: () => void }) {
    const t = useTranslations('Knowledge');
    const w = useTranslations('WorkDocuments');
    const client = useQueryClient();
    const [name, setName] = useState(title);
    const [description, setDescription] = useState(text);
    const [selection, setSelection] = useState('');
    const models = useQuery({
        queryKey: ['work-knowledge-model-options', connectionIds],
        queryFn: () => executeActionClient<{ models: Array<{ id: string; name: string; dataSources: Array<{ connectionId: string; name: string }> }> }>('knowledge.list', {}),
    });
    const options =
        models.data?.models.flatMap(model =>
            model.dataSources
                .filter(source => connectionIds.includes(source.connectionId))
                .map(source => ({
                    value: JSON.stringify([model.id, source.connectionId]),
                    label: `${model.name} · ${source.name}`,
                })),
        ) ?? [];
    const selected = selection || options[0]?.value || '';
    const save = useMutation({
        mutationFn: async () => {
            const [knowledgeModelId, sourceConnectionId] = JSON.parse(selected) as [string, string];
            return executeActionClient(
                'knowledge.createKnowledgeSource',
                {
                    knowledgeModelId,
                    fileName: /\.(md|markdown)$/i.test(name.trim()) ? name.trim() : name.trim() + '.md',
                    connectionId: sourceConnectionId,
                    contentText: description,
                },
                { currentConnectionId: sourceConnectionId },
            );
        },
        onSuccess: () => {
            const [knowledgeModelId] = JSON.parse(selected) as [string, string];
            void client.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId] });
            void client.invalidateQueries({ queryKey: ['knowledge-directory-search'] });
            toast.success(w('KnowledgeDocumentSaved'));
            onClose();
        },
        onError: error => toast.error(error.message),
    });
    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{w('SaveKnowledgeDocument')}</DialogTitle>
                </DialogHeader>
                {models.error ? <p role="alert">{models.error.message}</p> : null}
                {!models.isPending && !options.length ? <p>{w('DocumentNeedsKnowledge')}</p> : null}
                <Select value={selected} onValueChange={setSelection} disabled={!options.length}>
                    <SelectTrigger className="w-full" aria-label={w('Knowledge')}>
                        <SelectValue placeholder={w('Knowledge')} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input aria-label={t('Documents.Title')} value={name} maxLength={160} onChange={event => setName(event.target.value)} />
                <Textarea aria-label={t('Documents.Body')} value={description} maxLength={10_000_000} onChange={event => setDescription(event.target.value)} />
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button disabled={!selected || !name.trim() || !description.trim() || save.isPending} onClick={() => save.mutate()}>
                        {t('KnowledgeSources.Save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
