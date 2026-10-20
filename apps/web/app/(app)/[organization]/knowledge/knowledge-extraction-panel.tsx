'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { ExtractedKnowledge } from '@dory/database/postgres/schemas/knowledge-extraction';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/registry/new-york-v4/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/registry/new-york-v4/ui/tooltip';

type DataSource = { connectionId: string; name: string };
type Evidence = { id: string; quote: string; sourceUrl: string | null; sourceTitle: string; state: string };
type Candidate = {
    id: string;
    payload: ExtractedKnowledge;
    action: 'add' | 'update' | 'conflict' | 'source_changed' | 'remove';
    targetAssetId: string | null;
    targetRevision: string | null;
    evidence: Evidence[];
};
type Target = { id: string; name: string; kind: string; revision: string; content: Partial<ExtractedKnowledge> };
type Rule = { id: string; payload: ExtractedKnowledge; status: string; revision: number; sourceState: string; evidence: Evidence[] };
export type ExtractionStatus = {
    canManage: boolean;
    connectors: Array<{ id: string; autoExtract: boolean }>;
    pendingCount: number;
    jobs: Array<{
        id: string;
        connectorId: string;
        originalSourceId: string;
        status: string;
        completedChunks: number;
        totalChunks: number;
        error: string | null;
        pendingCount?: number;
    }>;
};
export const extractionStatusKey = (organization: string, modelId: string) => ['knowledge-model', modelId, 'extraction', organization] as const;
export function useExtractionStatus(organization: string, knowledgeModelId: string) {
    return useQuery({
        queryKey: extractionStatusKey(organization, knowledgeModelId),
        queryFn: () => executeActionClient<ExtractionStatus>('knowledge.getExtractionStatus', { knowledgeModelId }, { organizationId: organization }),
        refetchInterval: query => (query.state.data?.jobs.some(j => ['queued', 'running'].includes(j.status)) ? 2000 : 10_000),
    });
}
function useExtractionAction(organization: string, knowledgeModelId: string) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ actionId, input }: { actionId: `knowledge.${string}`; input: Record<string, unknown> }) =>
            executeActionClient<{ results?: Array<{ approved: boolean; error?: string }> }>(actionId, { knowledgeModelId, ...input }, { organizationId: organization }),
        onSuccess: async result => {
            for (const failed of result?.results?.filter(r => !r.approved) ?? []) toast.error(failed.error);
            await client.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId] });
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Error'),
    });
}
export function ExtractionConnectorStatus({ organization, knowledgeModelId, connectorId }: { organization: string; knowledgeModelId: string; connectorId: string }) {
    const t = useTranslations('Knowledge.Extraction');
    const status = useExtractionStatus(organization, knowledgeModelId);
    const action = useExtractionAction(organization, knowledgeModelId);
    const connector = status.data?.connectors.find(c => c.id === connectorId);
    if (!connector) return null;
    const jobs = status.data!.jobs.filter(j => j.connectorId === connectorId);
    const failed = jobs.filter(j => ['failed', 'blocked'].includes(j.status));
    return (
        <div className="mt-3 space-y-2 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                    {t('AutomaticExtraction')} · {t(connector.autoExtract ? 'Enabled' : 'Disabled')}
                </span>
                {status.data?.canManage && connector.autoExtract ? (
                    <Button
                        size="sm"
                        variant="ghost"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ actionId: 'knowledge.setAutoExtraction', input: { connectorId, enabled: true } })}
                    >
                        {t('Backfill')}
                    </Button>
                ) : null}
                {status.data?.canManage ? (
                    <Button
                        size="sm"
                        variant="ghost"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ actionId: 'knowledge.setAutoExtraction', input: { connectorId, enabled: !connector.autoExtract } })}
                    >
                        {t(connector.autoExtract ? 'Disable' : 'EnableAndBackfill')}
                    </Button>
                ) : null}
            </div>
            {connector.autoExtract && jobs.length ? (
                <div>{[...new Set(jobs.map(j => j.status))].map(s => `${t(`Job.${s}`)} ${jobs.filter(j => j.status === s).length}`).join(' · ')}</div>
            ) : null}
            {failed.length ? (
                <div className="flex items-center justify-between gap-2">
                    <span role="status" className="text-destructive">
                        {t(
                            failed[0].error?.startsWith('AI_QUOTA_EXCEEDED')
                                ? 'Error.quota'
                                : failed[0].error?.startsWith('AI_CONFIGURATION_REQUIRED')
                                  ? 'Error.config'
                                  : failed[0].status === 'blocked'
                                    ? 'Error.blocked'
                                    : 'Error.failed',
                        )}
                    </span>
                    {status.data?.canManage ? (
                        <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ actionId: 'knowledge.retryExtraction', input: {} })}>
                            <RefreshCw />
                            {t('Retry')}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
export function SourceExtractionStatus({ organization, knowledgeModelId, sourceId }: { organization: string; knowledgeModelId: string; sourceId: string }) {
    const t = useTranslations('Knowledge.Extraction');
    const status = useExtractionStatus(organization, knowledgeModelId);
    const action = useExtractionAction(organization, knowledgeModelId);
    const job = status.data?.jobs.find(j => j.originalSourceId === sourceId);
    if (!job) return null;
    return (
        <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <span>
                {t(`Job.${job.status}`)}
                {job.status === 'running' ? ` ${job.completedChunks}/${job.totalChunks}` : ''}
                {job.pendingCount ? ` · ${t('PendingCount', { count: job.pendingCount })}` : ''}
            </span>
            {status.data?.canManage && ['failed', 'blocked'].includes(job.status) ? (
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('Retry')}
                    disabled={action.isPending}
                    onClick={event => {
                        event.stopPropagation();
                        action.mutate({ actionId: 'knowledge.retryExtraction', input: { sourceId } });
                    }}
                >
                    <RefreshCw className="size-3" />
                </Button>
            ) : null}
        </span>
    );
}
function EvidenceList({ evidence }: { evidence: Evidence[] }) {
    const t = useTranslations('Knowledge.Extraction');
    return (
        <div className="space-y-2">
            {evidence.map(e => (
                <div key={e.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{e.sourceTitle.split(' · ')[0]}</span>
                        {e.state !== 'current' ? <Badge variant="outline">{t('SourceChanged')}</Badge> : null}
                        {e.sourceUrl ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={t('OpenOriginal')}>
                                        <ExternalLink className="size-3.5" />
                                    </a>
                                </TooltipTrigger>
                                <TooltipContent>{t('OpenOriginal')}</TooltipContent>
                            </Tooltip>
                        ) : null}
                    </div>
                    <blockquote className="whitespace-pre-wrap border-l-2 pl-3">{e.quote}</blockquote>
                </div>
            ))}
        </div>
    );
}
function PayloadEditor({
    value,
    onChange,
    dataSources,
    allowKindChange = false,
}: {
    value: ExtractedKnowledge;
    onChange: (value: ExtractedKnowledge) => void;
    dataSources: DataSource[];
    allowKindChange?: boolean;
}) {
    const t = useTranslations('Knowledge.Extraction');
    const text = (key: 'name' | 'description' | 'source' | 'expression' | 'timeDimension' | 'unit' | 'scope') => (
        <label className="block space-y-1 text-sm" key={key}>
            <span>{t(`Field.${key}`)}</span>
            {key === 'description' || key === 'expression' ? (
                <Textarea value={value[key] ?? ''} onChange={event => onChange({ ...value, [key]: event.target.value || undefined })} />
            ) : (
                <Input value={value[key] ?? ''} onChange={event => onChange({ ...value, [key]: event.target.value || undefined })} />
            )}
        </label>
    );
    return (
        <div className="space-y-3">
            {allowKindChange ? (
                <label className="block space-y-1 text-sm">
                    <span>{t('Field.kind')}</span>
                    <Select value={value.kind} onValueChange={kind => onChange({ ...value, kind: kind === 'metric' ? 'metric' : 'business_rule' })}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="metric">{t('Metric')}</SelectItem>
                            <SelectItem value="business_rule">{t('BusinessRule')}</SelectItem>
                        </SelectContent>
                    </Select>
                </label>
            ) : null}
            {text('name')}
            {text('description')}
            <label className="block space-y-1 text-sm">
                <span>{t('Field.dataSource')}</span>
                <Select value={value.sourceConnectionId ?? '__shared__'} onValueChange={id => onChange({ ...value, sourceConnectionId: id === '__shared__' ? null : id })}>
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__shared__">{t(value.kind === 'metric' ? 'NeedsMapping' : 'ModelWide')}</SelectItem>
                        {dataSources.map(s => (
                            <SelectItem key={s.connectionId} value={s.connectionId}>
                                {s.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </label>
            <label className="block space-y-1 text-sm">
                <span>{t('Field.aliases')}</span>
                <Input
                    defaultValue={value.aliases.join(', ')}
                    onChange={event =>
                        onChange({
                            ...value,
                            aliases: event.target.value
                                .split(',')
                                .map(s => s.trim())
                                .filter(Boolean),
                        })
                    }
                />
            </label>
            {text('unit')}
            {text('scope')}
            {value.kind === 'metric' ? (
                <>
                    {text('source')}
                    {text('expression')}
                    {text('timeDimension')}
                    <label className="block space-y-1 text-sm">
                        <span>{t('Field.filters')}</span>
                        <Textarea
                            defaultValue={value.filters?.join('\n') ?? ''}
                            onChange={event => onChange({ ...value, filters: event.target.value.split('\n').filter(Boolean) })}
                        />
                    </label>
                </>
            ) : null}
        </div>
    );
}
function CandidateReview({
    candidate,
    targets,
    dataSources,
    organization,
    knowledgeModelId,
    onClose,
}: {
    candidate: Candidate;
    targets: Target[];
    dataSources: DataSource[];
    organization: string;
    knowledgeModelId: string;
    onClose: () => void;
}) {
    const t = useTranslations('Knowledge.Extraction');
    const [payload, setPayload] = useState(candidate.payload);
    // Freeze the review's published revisions. Polling must not silently accept a newer target.
    const [reviewTargets] = useState(targets);
    const [targetId, setTargetId] = useState(candidate.action === 'conflict' ? '__choose__' : (candidate.targetAssetId ?? '__new__'));
    const action = useExtractionAction(organization, knowledgeModelId);
    const invalidation = candidate.action === 'remove' || candidate.action === 'source_changed';
    const target = reviewTargets.find(target => target.id === targetId);
    const submit = (decision: string) =>
        action.mutate(
            {
                actionId: 'knowledge.reviewCandidate',
                input: {
                    candidateId: candidate.id,
                    decision,
                    payload,
                    ...(target ? { targetAssetId: target.id, expectedTargetRevision: target.revision } : !invalidation ? { createNew: true } : {}),
                },
            },
            { onSuccess: onClose },
        );
    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {t('Review')} · {candidate.payload.name}
                    </DialogTitle>
                </DialogHeader>
                <Badge variant="outline" className="w-fit">
                    {t(`Action.${candidate.action}`)}
                </Badge>
                {invalidation ? (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">{t('SourceReviewNotice')}</p>
                        {target ? (
                            <section className="rounded-md border bg-muted/30 p-3 text-sm">
                                <h3 className="font-medium">{t('PublishedVersion')}</h3>
                                <p className="whitespace-pre-wrap">{target.content.description}</p>
                            </section>
                        ) : null}
                    </div>
                ) : (
                    <>
                        <label className="space-y-1 text-sm">
                            <span>{t('Target')}</span>
                            <Select value={targetId} onValueChange={setTargetId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__choose__" disabled>
                                        {t('ChooseTarget')}
                                    </SelectItem>
                                    <SelectItem value="__new__">{t('CreateNew')}</SelectItem>
                                    {reviewTargets
                                        .filter(target => target.kind === payload.kind)
                                        .map(target => (
                                            <SelectItem key={target.id} value={target.id}>
                                                {target.name}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </label>
                        <div className={target ? 'grid gap-4 md:grid-cols-2' : ''}>
                            {target ? (
                                <section className="self-start space-y-2 rounded-md border bg-muted/30 p-3">
                                    <h3 className="font-medium">{t('PublishedVersion')}</h3>
                                    <p className="text-sm whitespace-pre-wrap">{target.content.description}</p>
                                    {target.content.expression ? <pre className="text-xs whitespace-pre-wrap">{target.content.expression}</pre> : null}
                                    {(['source', 'timeDimension', 'unit', 'scope', 'filters', 'aliases'] as const).map(field =>
                                        target.content[field] ? (
                                            <p key={field} className="text-xs break-words">
                                                <span className="text-muted-foreground">{t(`Field.${field}`)}: </span>
                                                {Array.isArray(target.content[field]) ? target.content[field].join(', ') : target.content[field]}
                                            </p>
                                        ) : null,
                                    )}
                                </section>
                            ) : null}
                            <section className="space-y-2">
                                <h3 className="font-medium">{t('SuggestedVersion')}</h3>
                                <PayloadEditor value={payload} onChange={setPayload} dataSources={dataSources} allowKindChange={targetId === '__new__'} />
                            </section>
                        </div>
                    </>
                )}
                <h3 className="font-medium">{t('Evidence')}</h3>
                <EvidenceList evidence={candidate.evidence} />
                <DialogFooter className="flex-wrap">
                    <Button variant="outline" onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button variant="outline" disabled={action.isPending} onClick={() => submit('reject')}>
                        {t('Reject')}
                    </Button>
                    {invalidation ? (
                        <>
                            <Button variant="outline" disabled={action.isPending} onClick={() => submit('archive')}>
                                {t('Archive')}
                            </Button>
                            <Button disabled={action.isPending} onClick={() => submit('keep')}>
                                {t('KeepCurrent')}
                            </Button>
                        </>
                    ) : (
                        <Button
                            disabled={
                                action.isPending || !payload.name || !payload.description || targetId === '__choose__' || (payload.kind === 'metric' && !payload.sourceConnectionId)
                            }
                            onClick={() => submit('approve')}
                        >
                            {t('Approve')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
export function KnowledgeReviewPanel({ organization, knowledgeModelId, dataSources }: { organization: string; knowledgeModelId: string; dataSources: DataSource[] }) {
    const t = useTranslations('Knowledge.Extraction');
    const status = useExtractionStatus(organization, knowledgeModelId);
    const action = useExtractionAction(organization, knowledgeModelId);
    const [selected, setSelected] = useState<string[]>([]);
    const [reviewing, setReviewing] = useState<Candidate | null>(null);
    const query = useQuery({
        queryKey: ['knowledge-model', knowledgeModelId, 'candidates', organization],
        queryFn: () => executeActionClient<{ candidates: Candidate[]; targets: Target[] }>('knowledge.listCandidates', { knowledgeModelId }, { organizationId: organization }),
        enabled: status.data?.canManage === true,
        refetchInterval: 5000,
    });
    if (!status.data?.canManage) return <p className="text-sm text-muted-foreground">{t('AdminOnly')}</p>;
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('ReviewNotice')}</p>
            <Button
                variant="outline"
                disabled={!selected.length || action.isPending}
                onClick={() => action.mutate({ actionId: 'knowledge.approveCandidates', input: { candidateIds: selected } }, { onSuccess: () => setSelected([]) })}
            >
                {t('ApproveSelected', { count: selected.length })}
            </Button>
            {query.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {query.error.message}
                </p>
            ) : null}
            {query.isLoading ? (
                <p>{t('Loading')}</p>
            ) : !query.data?.candidates.length ? (
                <p className="text-sm text-muted-foreground">{t('NoCandidates')}</p>
            ) : (
                query.data.candidates.map(candidate => (
                    <div key={candidate.id} className="flex items-center justify-between gap-3 rounded-md border p-4">
                        <div className="flex items-center gap-3">
                            <Checkbox
                                aria-label={t('SelectNamed', { name: candidate.payload.name })}
                                checked={selected.includes(candidate.id)}
                                disabled={candidate.action !== 'add' || (candidate.payload.kind === 'metric' && !candidate.payload.sourceConnectionId)}
                                onCheckedChange={checked => setSelected(ids => (checked ? [...ids, candidate.id] : ids.filter(id => id !== candidate.id)))}
                            />
                            <div>
                                <div className="font-medium">{candidate.payload.name}</div>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    <Badge variant="outline">{t(candidate.payload.kind === 'metric' ? 'Metric' : 'BusinessRule')}</Badge>
                                    <Badge variant="outline">{t(`Action.${candidate.action}`)}</Badge>
                                </div>
                            </div>
                        </div>
                        <Button variant="outline" onClick={() => setReviewing(candidate)}>
                            {t('Review')}
                        </Button>
                    </div>
                ))
            )}
            {reviewing ? (
                <CandidateReview
                    key={reviewing.id}
                    candidate={reviewing}
                    targets={query.data?.targets ?? []}
                    dataSources={dataSources}
                    organization={organization}
                    knowledgeModelId={knowledgeModelId}
                    onClose={() => setReviewing(null)}
                />
            ) : null}
        </div>
    );
}
export function KnowledgeEvidenceWarning({ organization, knowledgeModelId, assetId }: { organization: string; knowledgeModelId: string; assetId: string }) {
    const t = useTranslations('Knowledge.Extraction');
    const query = useQuery({
        queryKey: ['knowledge-model', knowledgeModelId, 'asset-evidence', organization],
        queryFn: () =>
            executeActionClient<{ evidence: Array<{ assetId: string; state: string }> }>('knowledge.getAssetEvidence', { knowledgeModelId }, { organizationId: organization }),
        refetchInterval: 10000,
    });
    return query.data?.evidence.some(e => e.assetId === assetId && e.state !== 'current') ? <Badge variant="outline">{t('SourceChanged')}</Badge> : null;
}
export function BusinessRulesPanel({ organization, knowledgeModelId, dataSources }: { organization: string; knowledgeModelId: string; dataSources: DataSource[] }) {
    const t = useTranslations('Knowledge.Extraction');
    const status = useExtractionStatus(organization, knowledgeModelId);
    const action = useExtractionAction(organization, knowledgeModelId);
    const query = useQuery({
        queryKey: ['knowledge-model', knowledgeModelId, 'business-rules', organization],
        queryFn: () => executeActionClient<{ rules: Rule[] }>('knowledge.listBusinessRules', { knowledgeModelId }, { organizationId: organization }),
        refetchInterval: 10_000,
    });
    const [editing, setEditing] = useState<Rule | null>(null);
    const [payload, setPayload] = useState<ExtractedKnowledge | null>(null);
    return (
        <div className="space-y-3">
            {query.error ? (
                <p role="alert" className="text-destructive">
                    {query.error.message}
                </p>
            ) : null}
            {query.isLoading ? (
                <p>{t('Loading')}</p>
            ) : !query.data?.rules.length ? (
                <p className="text-sm text-muted-foreground">{t('NoRules')}</p>
            ) : (
                query.data.rules.map(rule => (
                    <section key={rule.id} className="space-y-3 rounded-md border p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="font-medium">{rule.payload.name}</h3>
                                <p className="text-xs text-muted-foreground">{dataSources.find(s => s.connectionId === rule.payload.sourceConnectionId)?.name ?? t('ModelWide')}</p>
                            </div>
                            {rule.sourceState !== 'current' ? <Badge variant="outline">{t('SourceChanged')}</Badge> : null}
                            {status.data?.canManage ? (
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setEditing(rule);
                                            setPayload(rule.payload);
                                        }}
                                    >
                                        {t('Edit')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={action.isPending}
                                        onClick={() =>
                                            action.mutate({ actionId: 'knowledge.updateBusinessRule', input: { id: rule.id, expectedRevision: rule.revision, archived: true } })
                                        }
                                    >
                                        {t('Archive')}
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{rule.payload.description}</p>
                        <EvidenceList evidence={rule.evidence} />
                    </section>
                ))
            )}
            <Dialog open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('Edit')}</DialogTitle>
                    </DialogHeader>
                    {payload ? <PayloadEditor value={payload} onChange={setPayload} dataSources={dataSources} /> : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>
                            {t('Cancel')}
                        </Button>
                        <Button
                            disabled={!payload?.name || !payload.description || action.isPending}
                            onClick={() =>
                                editing &&
                                action.mutate(
                                    { actionId: 'knowledge.updateBusinessRule', input: { id: editing.id, expectedRevision: editing.revision, payload } },
                                    { onSuccess: () => setEditing(null) },
                                )
                            }
                        >
                            {t('Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
