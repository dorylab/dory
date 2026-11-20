'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import type { KnowledgeModelView } from './knowledge-page.client';
import { MarkdownViewer } from './knowledge-sources-panel';

export function KnowledgeGuide({
    model,
    organization,
    editing,
    canWrite,
    onEdit,
    onCloseEditor,
    onDirtyChange,
}: {
    model: KnowledgeModelView;
    organization: string;
    editing: boolean;
    canWrite: boolean;
    onEdit: () => void;
    onCloseEditor: (removed?: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
}) {
    const t = useTranslations('Knowledge');
    const client = useQueryClient();
    const [draft, setDraft] = useState(model.businessContextMd);
    const save = useMutation({
        mutationFn: () => executeActionClient<KnowledgeModelView>('knowledge.update', { knowledgeModelId: model.id, businessContextMd: draft }, { organizationId: organization }),
        onSuccess: updated => {
            client.setQueryData(['knowledge-model', model.id], updated);
            onCloseEditor(!updated.businessContextMd.trim());
        },
        onError: error => toast.error(error.message),
    });
    return (
        <section aria-label={t('Documents.Guide')} className="min-w-0 space-y-4">
            <header className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{t('Documents.Guide')}</h3>
                {canWrite && !editing && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setDraft(model.businessContextMd);
                            onEdit();
                        }}
                    >
                        <Pencil />
                        {t('KnowledgeSources.Edit')}
                    </Button>
                )}
            </header>
            {editing && canWrite ? (
                <>
                    <Textarea
                        aria-label={t('Documents.Body')}
                        disabled={save.isPending}
                        className="min-h-72 font-mono"
                        maxLength={100000}
                        value={draft}
                        onChange={event => {
                            setDraft(event.target.value);
                            onDirtyChange(event.target.value !== model.businessContextMd);
                        }}
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" disabled={save.isPending} onClick={() => onCloseEditor()}>
                            {t('KnowledgeSources.Cancel')}
                        </Button>
                        <Button disabled={save.isPending} onClick={() => save.mutate()}>
                            {t('KnowledgeSources.Save')}
                        </Button>
                    </div>
                </>
            ) : (
                <div className="overflow-x-auto rounded-md border bg-card p-4">
                    <MarkdownViewer mode="static">{model.businessContextMd}</MarkdownViewer>
                </div>
            )}
        </section>
    );
}
