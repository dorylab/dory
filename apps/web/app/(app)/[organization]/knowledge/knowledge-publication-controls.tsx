'use client';

import { useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { knowledgeSourceDisplayName } from '@dory/shared/utils/knowledge-source-name';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';

type Mode = 'review' | 'automatic';
type Policy = { mode: Mode; version: number; canManage: boolean };
type History = {
    events: Array<{
        id: string;
        candidateId: string | null;
        kind: 'background' | 'automatic' | 'human' | 'rejected' | 'restored' | 'withdrawn' | 'edited';
        assetId: string | null;
        assetRevision: string | null;
        payload: { name: string; description: string };
        reason: string | null;
        createdAt: string;
        evidence: Array<{ quote: string; sourceTitle: string; sourceUrl: string | null }>;
    }>;
    tasks: Array<{ id: string; status: string; error: string | null }>;
};

export function KnowledgePublicationControls({ organization, modelId, settingsOnly = false }: { organization: string; modelId: string; settingsOnly?: boolean }) {
    const t = useTranslations('Knowledge.Publication');
    const locale = useLocale();
    const client = useQueryClient();
    const [settings, setSettings] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [mode, setMode] = useState<Mode>('review');
    const policy = useQuery({
        queryKey: ['knowledge-model', modelId, 'publication-policy'],
        queryFn: () => executeActionClient<Policy>('knowledge.getPublicationPolicy', { knowledgeModelId: modelId }, { organizationId: organization }),
    });
    const history = useQuery({
        queryKey: ['knowledge-model', modelId, 'processing-history'],
        queryFn: () => executeActionClient<History>('knowledge.getProcessingHistory', { knowledgeModelId: modelId }, { organizationId: organization }),
        enabled: historyOpen,
        refetchInterval: historyOpen ? 5000 : false,
    });
    const action = useMutation({
        mutationFn: ({ id, input }: { id: `knowledge.${string}`; input: Record<string, unknown> }) =>
            executeActionClient(id, { knowledgeModelId: modelId, ...input }, { organizationId: organization }),
        onSuccess: async (_, variables) => {
            await client.invalidateQueries({ queryKey: ['knowledge-model', modelId] });
            if (variables.id === 'knowledge.setPublicationPolicy') setSettings(false);
            toast.success(t('Saved'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Failed')),
    });
    return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
                {t('Mode')}: {policy.data?.mode ? t(policy.data.mode) : t('Loading')}
            </span>
            {policy.data?.canManage ? (
                <>
                    <Button
                        size="sm"
                        variant="ghost"
                        disabled={!policy.data?.mode || action.isPending}
                        onClick={() => {
                            setMode(policy.data!.mode);
                            setSettings(true);
                        }}
                    >
                        {t('Settings')}
                    </Button>
                </>
            ) : null}
            {!settingsOnly && policy.data?.canManage ? (
                <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
                    {t('History')}
                </Button>
            ) : null}
            {policy.isError ? (
                <Button variant="ghost" size="sm" onClick={() => void policy.refetch()}>
                    {t('Retry')}
                </Button>
            ) : null}
            <Dialog open={settings} onOpenChange={setSettings}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('Settings')}</DialogTitle>
                        <DialogDescription>{t('Help')}</DialogDescription>
                    </DialogHeader>
                    <Select value={mode} onValueChange={v => setMode(v as Mode)}>
                        <SelectTrigger aria-label={t('Mode')}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="review">{t('review')}</SelectItem>
                            <SelectItem value="automatic">{t('automatic')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">{t(mode === 'automatic' ? 'AutomaticHelp' : 'ReviewHelp')}</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSettings(false)}>
                            {t('Cancel')}
                        </Button>
                        <Button
                            disabled={action.isPending || !policy.data}
                            onClick={() => action.mutate({ id: 'knowledge.setPublicationPolicy', input: { mode, expectedVersion: policy.data!.version } })}
                        >
                            {t('Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('History')}</DialogTitle>
                        <DialogDescription>{t('HistoryHelp')}</DialogDescription>
                    </DialogHeader>
                    {history.isLoading ? <p role="status">{t('Loading')}</p> : null}
                    {history.isError ? (
                        <div role="alert">
                            {t('Failed')}{' '}
                            <Button variant="outline" onClick={() => void history.refetch()}>
                                {t('Retry')}
                            </Button>
                        </div>
                    ) : null}
                    {(history.data?.tasks ?? [])
                        .filter(task => task.status === 'failed' || task.status === 'review')
                        .map(task => (
                            <div key={task.id} className="rounded-md border p-3 text-sm">
                                <p>{t('NeedsAttention')}</p>
                                <p className="break-words text-muted-foreground">{t.has(`Reasons.${task.error}`) ? t(`Reasons.${task.error}`) : task.error}</p>
                                {task.status === 'failed' ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={action.isPending}
                                        onClick={() => action.mutate({ id: 'knowledge.retryPublication', input: { id: task.id } })}
                                    >
                                        {t('Retry')}
                                    </Button>
                                ) : null}
                            </div>
                        ))}
                    {history.data && !history.data.events?.length ? <p className="text-muted-foreground">{t('Empty')}</p> : null}
                    <ul className="divide-y">
                        {(history.data?.events ?? []).map(event => (
                            <li key={event.id} className="space-y-2 py-3">
                                <div className="flex flex-wrap justify-between gap-2">
                                    <strong className="break-words">{event.payload.name}</strong>
                                    <span className="text-xs text-muted-foreground">
                                        {t(`Kinds.${event.kind}`)} · {new Date(event.createdAt).toLocaleString(locale)}
                                    </span>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-sm">{event.payload.description}</p>
                                {event.kind === 'background' && event.reason ? <p className="text-sm text-muted-foreground">{event.reason}</p> : null}
                                <details className="text-sm">
                                    <summary className="cursor-pointer">{t('Evidence')}</summary>
                                    {event.evidence.map((e, i) => (
                                        <blockquote key={i} className="my-2 whitespace-pre-wrap break-words border-l-2 pl-3">
                                            <p>{e.quote}</p>
                                            {e.sourceUrl && /^https?:\/\//i.test(e.sourceUrl) ? (
                                                <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                                                    {knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl })}
                                                </a>
                                            ) : (
                                                <span>{knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl })}</span>
                                            )}
                                        </blockquote>
                                    ))}
                                </details>
                                {event.kind === 'background' && !(history.data?.events ?? []).some(e => e.kind === 'restored' && e.candidateId === event.candidateId) ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={action.isPending}
                                        onClick={() => action.mutate({ id: 'knowledge.restoreBackground', input: { id: event.id } })}
                                    >
                                        {t('Restore')}
                                    </Button>
                                ) : null}
                                {event.kind === 'automatic' && !(history.data?.events ?? []).some(e => ['withdrawn', 'edited'].includes(e.kind) && e.assetId === event.assetId) ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={action.isPending}
                                        onClick={() =>
                                            action.mutate({ id: 'knowledge.withdrawAutomaticPublication', input: { id: event.id, expectedRevision: event.assetRevision } })
                                        }
                                    >
                                        {t('Withdraw')}
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </DialogContent>
            </Dialog>
        </div>
    );
}
