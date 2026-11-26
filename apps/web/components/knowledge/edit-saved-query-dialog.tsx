'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { refreshQueryLibraries } from '@/lib/knowledge-query-cache';
import { executeActionClient } from '@/lib/actions/client';
import { KnowledgeBaseCheckboxes } from '@/components/knowledge/query-knowledge-target';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

export type EditableQuery = { id: string; title: string; description?: string | null; sqlText: string; revision?: number; knowledgeModelId?: string; queryId?: string };

export function EditSavedQueryDialog({
    query,
    connectionId,
    organizationId,
    onSaved,
    onClose,
}: {
    query: EditableQuery;
    connectionId: string;
    organizationId?: string;
    onSaved?: (removedModelIds: string[]) => void | Promise<void>;
    onClose: () => void;
}) {
    const t = useTranslations('SqlConsole.SavedQueries');
    const client = useQueryClient();
    const actionContext = { currentConnectionId: connectionId, organizationId };
    const [changes, setChanges] = useState<Record<string, boolean>>({});
    const [newModelName, setNewModelName] = useState('');
    const options = useQuery({
        queryKey: ['saved-query-memberships', organizationId, connectionId, query.id],
        queryFn: ({ signal }) =>
            executeActionClient<{ collected: boolean; models: { id: string; name: string; included: boolean }[] }>(
                'knowledge.listQueryMembershipOptions',
                { id: query.id, connectionId },
                { ...actionContext, signal },
            ),
    });
    const models = options.data?.models ?? [];
    const selected = (model: (typeof models)[number]) => changes[model.id] ?? model.included;
    const savingToMyQueries = options.data && !options.data.collected && models.some(model => model.included) && !models.some(selected);
    const save = useMutation({
        mutationFn: async (form: FormData) => {
            const patch = {
                title: String(form.get('title')).trim(),
                description: String(form.get('description')).trim(),
                sqlText: String(form.get('sql')).trim(),
                revision: query.revision,
            };
            const addModelIds = models.filter(model => !model.included && selected(model)).map(model => model.id);
            const removeModelIds = models.filter(model => model.included && !selected(model)).map(model => model.id);
            if (addModelIds.length || removeModelIds.length || newModelName.trim()) {
                await executeActionClient(
                    'knowledge.editSavedQuery',
                    { ...patch, id: query.id, connectionId, addModelIds, removeModelIds, newModelName: newModelName.trim() || undefined },
                    actionContext,
                );
            } else if (query.knowledgeModelId) {
                await executeActionClient('knowledge.updateQueryContent', { ...patch, knowledgeModelId: query.knowledgeModelId, id: query.queryId }, actionContext);
            } else {
                await executeActionClient('savedQuery.update', { connectionId, id: query.id, patch }, actionContext);
            }
            return removeModelIds;
        },
        onSuccess: async removedModelIds => {
            await refreshQueryLibraries(client);
            await onSaved?.(removedModelIds);
            onClose();
        },
        onError: () => {
            void client.invalidateQueries({ queryKey: ['knowledge-connection-queries', connectionId] });
            window.dispatchEvent(new CustomEvent('saved-queries-updated'));
        },
    });
    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open && !save.isPending) onClose();
            }}
        >
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('EditSql')}</DialogTitle>
                </DialogHeader>
                <form
                    className="space-y-3"
                    onSubmit={event => {
                        event.preventDefault();
                        if (options.isSuccess && !save.isPending) save.mutate(new FormData(event.currentTarget));
                    }}
                >
                    <label className="block text-sm">
                        {t('QueryTitle')}
                        <Input name="title" defaultValue={query.title} required maxLength={240} />
                    </label>
                    <label className="block text-sm">
                        {t('QueryDescription')}
                        <Textarea name="description" defaultValue={query.description ?? ''} maxLength={4000} />
                    </label>
                    <label className="block text-sm">
                        SQL
                        <Textarea aria-label="SQL" name="sql" defaultValue={query.sqlText} required className="min-h-36 font-mono" />
                    </label>
                    <fieldset className="space-y-2 border-t pt-2" disabled={save.isPending}>
                        <legend className="text-sm font-medium">{t('Memberships')}</legend>
                        {options.isPending && <p className="text-sm text-muted-foreground">{t('Loading')}</p>}
                        {options.isError && (
                            <p className="text-sm text-destructive" role="alert">
                                {options.error.message}
                            </p>
                        )}
                        {models.length > 0 && (
                            <KnowledgeBaseCheckboxes
                                models={models.map(model => ({ ...model, checked: selected(model) }))}
                                onChange={(id, checked) => setChanges(previous => ({ ...previous, [id]: checked }))}
                                disabled={save.isPending}
                            />
                        )}
                        {options.isSuccess && !models.length && (
                            <Input
                                aria-label={t('NewMembershipName')}
                                placeholder={t('NewMembershipName')}
                                maxLength={160}
                                value={newModelName}
                                onChange={event => setNewModelName(event.target.value)}
                            />
                        )}
                        {savingToMyQueries && <p className="text-xs text-muted-foreground">{t('KeepInMyQueries')}</p>}
                    </fieldset>
                    {save.isError && (
                        <p className="text-sm text-destructive" role="alert">
                            {save.error.message}
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
                            {t('Cancel')}
                        </Button>
                        <Button type="submit" disabled={save.isPending || !options.isSuccess}>
                            {t('Save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
