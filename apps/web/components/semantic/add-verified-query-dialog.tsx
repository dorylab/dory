'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

type SemanticModelOption = { id: string; name: string };

export function AddVerifiedQueryDialog({
    open,
    onOpenChange,
    connectionId,
    sql,
    sourceType,
    sourceId,
    initialTitle = '',
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connectionId: string | null | undefined;
    sql: string | null | undefined;
    sourceType: string;
    sourceId?: string | null;
    initialTitle?: string;
}) {
    const t = useTranslations('SemanticContext');
    const [semanticModelId, setSemanticModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const [title, setTitle] = useState(initialTitle);
    const [question, setQuestion] = useState('');
    const models = useQuery({
        queryKey: ['semantic-model-options', connectionId],
        enabled: open && Boolean(connectionId),
        queryFn: () => executeActionClient<{ models: SemanticModelOption[] }>('semantic.list', { connectionId }, { currentConnectionId: connectionId ?? null }),
    });
    useEffect(() => {
        if (!open) return;
        setTitle(initialTitle);
        setQuestion('');
        setNewModelName('');
        setSemanticModelId('');
    }, [open, initialTitle]);
    useEffect(() => {
        if (!semanticModelId && models.data?.models[0]) setSemanticModelId(models.data.models[0].id);
    }, [models.data, semanticModelId]);
    const save = useMutation({
        mutationFn: async () => {
            let targetModelId = semanticModelId;
            if (!targetModelId) {
                if (!connectionId || !newModelName.trim()) throw new Error(t('Errors.ChooseOrCreateModel'));
                const model = await executeActionClient<SemanticModelOption>('semantic.create', { name: newModelName, connectionIds: [connectionId] });
                targetModelId = model.id;
            }
            return executeActionClient(
                'semantic.createVerifiedQuery',
                { semanticModelId: targetModelId, sourceConnectionId: connectionId, title, question, sql, sourceType, sourceId },
                { currentConnectionId: connectionId ?? null },
            );
        },
        onSuccess: () => {
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
                    {hasModels ? (
                        <Select value={semanticModelId} onValueChange={setSemanticModelId}>
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
                    <Input value={title} onChange={event => setTitle(event.target.value)} placeholder={t('VerifiedQueryTitlePlaceholder')} />
                    <Textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder={t('VerifiedQueryQuestionPlaceholder')} />
                    <Textarea className="min-h-40 font-mono" value={sql ?? ''} readOnly />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        onClick={() => save.mutate()}
                        disabled={!connectionId || !sql?.trim() || !title.trim() || !question.trim() || (!semanticModelId && !newModelName.trim()) || save.isPending}
                    >
                        {save.isPending ? t('Saving') : t('AddVerifiedQuery')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
