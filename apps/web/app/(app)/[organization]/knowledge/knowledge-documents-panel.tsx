'use client';

import { useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import type { KnowledgeModelView } from './knowledge-page.client';
import type { DirectoryData } from './document-directory';
import { DocumentBrowser } from './document-browser';
import { MarkdownViewer, SourceEditorDialog, SourceViewerDialog, UploadSourcesDialog, type KnowledgeSourceSummary } from './knowledge-sources-panel';

export function KnowledgeDocumentsPanel({
    model,
    organization,
    sources,
    sourcesPending,
    sourcesError,
}: {
    model: KnowledgeModelView;
    organization: string;
    sources: KnowledgeSourceSummary[];
    sourcesPending: boolean;
    sourcesError?: string;
}) {
    const t = useTranslations('Knowledge');
    const client = useQueryClient();
    const [editor, setEditor] = useState<KnowledgeSourceSummary | 'new' | null>(null);
    const directory = useQuery({
        queryKey: ['knowledge-model', model.id, 'directory'],
        queryFn: () => executeActionClient<DirectoryData>('knowledge.listDirectory', { knowledgeModelId: model.id }, { organizationId: organization }),
        refetchInterval: 15_000,
    });
    const [target, setTarget] = useState<string | null>(null);
    const [upload, setUpload] = useState(false);
    const [viewId, setViewId] = useState<string | null>(null);
    const [guide, setGuide] = useState<'read' | 'edit' | null>(null);
    const [draft, setDraft] = useState('');
    const documents = sources.filter(source => source.format === 'markdown');
    const selected = documents.find(doc => doc.id === viewId);
    const saveGuide = useMutation({
        mutationFn: () => executeActionClient<KnowledgeModelView>('knowledge.update', { knowledgeModelId: model.id, businessContextMd: draft }, { organizationId: organization }),
        onSuccess: updated => {
            client.setQueryData(['knowledge-model', model.id], updated);
            setGuide(updated.businessContextMd.trim() ? 'read' : null);
        },
        onError: error => toast.error(error.message),
    });
    return (
        <div className="space-y-4">
            <DocumentBrowser
                key={model.id}
                modelId={model.id}
                modelName={model.name}
                hasGuide={Boolean(model.businessContextMd.trim())}
                organization={organization}
                sources={sources}
                sourcesPending={sourcesPending}
                sourcesError={sourcesError}
                directory={directory.data}
                directoryPending={directory.isPending}
                directoryError={directory.error?.message}
                onRead={source => (source ? setViewId(source.id) : setGuide('read'))}
                onEdit={setEditor}
                onNew={folder => {
                    setTarget(folder);
                    setEditor('new');
                }}
                onUpload={folder => {
                    setTarget(folder);
                    setUpload(true);
                }}
            />
            {upload && (
                <UploadSourcesDialog
                    open
                    markdownOnly
                    folderId={target}
                    knowledgeModelId={model.id}
                    organization={organization}
                    dataSources={model.dataSources}
                    onOpenChange={setUpload}
                />
            )}
            {selected ? <SourceViewerDialog organization={organization} knowledgeModelId={model.id} source={selected} onClose={() => setViewId(null)} /> : null}
            {editor ? (
                <SourceEditorDialog
                    open
                    folderId={target}
                    source={editor === 'new' ? null : editor}
                    dataSources={model.dataSources}
                    organization={organization}
                    knowledgeModelId={model.id}
                    onOpenChange={open => !open && setEditor(null)}
                />
            ) : null}
            {guide ? (
                <Dialog open onOpenChange={open => !open && setGuide(null)}>
                    <DialogContent className="sm:max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>{t('Documents.Guide')}</DialogTitle>
                        </DialogHeader>
                        {guide === 'read' ? (
                            <div className="max-h-[65vh] overflow-auto">
                                <MarkdownViewer mode="static">{model.businessContextMd}</MarkdownViewer>
                            </div>
                        ) : (
                            <Textarea
                                aria-label={t('Documents.Body')}
                                className="min-h-72 font-mono"
                                maxLength={100000}
                                value={draft}
                                onChange={event => setDraft(event.target.value)}
                            />
                        )}
                        <DialogFooter>
                            {guide === 'read' ? (
                                directory.data?.canWrite && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setDraft(model.businessContextMd);
                                            setGuide('edit');
                                        }}
                                    >
                                        <Pencil />
                                        {t('KnowledgeSources.Edit')}
                                    </Button>
                                )
                            ) : (
                                <Button disabled={saveGuide.isPending} onClick={() => saveGuide.mutate()}>
                                    {t('KnowledgeSources.Save')}
                                </Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            ) : null}
        </div>
    );
}
