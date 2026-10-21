'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { ExtractedKnowledge } from '@dory/database/postgres/schemas/knowledge-extraction';
import { knowledgeSourceDisplayName } from '@dory/shared/utils/knowledge-source-name';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';

import { KnowledgePublicationControls } from './knowledge-publication-controls';

type Metric = { id: string; name: string; sourceConnectionId: string; revision?: string };
type DataSource = { connectionId: string; name: string };
type Evidence = { id: string; quote: string; sourceUrl: string | null; sourceTitle: string; state: string };
type Candidate = {
    publicationReason?: string | null;
    classificationReason?: string | null;
    id: string;
    payload: ExtractedKnowledge;
    action: 'add' | 'update' | 'conflict' | 'source_changed' | 'remove';
    targetAssetId: string | null;
    targetRevision: string | null;
    evidence: Evidence[];
};
type Target = { id: string; name: string; kind: string; revision: string; content: Partial<ExtractedKnowledge> };
type Rule = {
    publicationMethod?: 'human' | 'automatic';
    id: string;
    payload: ExtractedKnowledge;
    status: string;
    revision: number;
    sourceState: string;
    evidence: Evidence[];
    applicationScope?: string;
    metricIds?: string[];
    metrics?: Metric[];
};
export type ExtractionStatus = {
    organizationJob?: { status: string; error: string | null; lastCompletedAt?: string | null } | null;
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
        refetchInterval: query =>
            query.state.data?.jobs.some(j => ['queued', 'running'].includes(j.status)) || ['queued', 'running'].includes(query.state.data?.organizationJob?.status ?? '')
                ? 2000
                : 10_000,
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
            {connector.autoExtract && status.data?.organizationJob && status.data.organizationJob.status !== 'completed' ? (
                <div className="flex items-center justify-between gap-2" role="status">
                    <span>
                        {t('OrganizationStatus')}: {t(`Job.${status.data.organizationJob.status}`)}
                    </span>
                    {status.data.canManage && ['failed', 'blocked'].includes(status.data.organizationJob.status) ? (
                        <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ actionId: 'knowledge.organizeCandidates', input: {} })}>
                            {t('Retry')}
                        </Button>
                    ) : null}
                </div>
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
                        <span>{knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl })}</span>
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
    metrics = [],
}: {
    value: ExtractedKnowledge;
    onChange: (value: ExtractedKnowledge) => void;
    dataSources: DataSource[];
    allowKindChange?: boolean;
    metrics?: Metric[];
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
            {value.kind === 'business_rule' ? (
                <div className="space-y-2">
                    <label className="block space-y-1 text-sm">
                        <span>{t('ApplicationScope')}</span>
                        <Select
                            value={value.applicationScope ?? (value.sourceConnectionId ? 'data_source' : 'model')}
                            onValueChange={scope =>
                                onChange({
                                    ...value,
                                    applicationScope: scope as ExtractedKnowledge['applicationScope'],
                                    ...(scope === 'model' ? { sourceConnectionId: null, metricIds: [] } : {}),
                                })
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(['model', 'data_source', 'metrics'] as const).map(scope => (
                                    <SelectItem key={scope} value={scope}>
                                        {t(`Scope.${scope}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    {value.applicationScope === 'metrics' ? (
                        <fieldset className="space-y-2 rounded-md border p-3">
                            <legend className="text-sm">{t('ApplicableMetrics')}</legend>
                            {metrics
                                .filter(m => !value.sourceConnectionId || m.sourceConnectionId === value.sourceConnectionId)
                                .map(metric => (
                                    <label key={metric.id} className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={value.metricIds?.includes(metric.id) ?? false}
                                            onCheckedChange={checked =>
                                                onChange({
                                                    ...value,
                                                    metricIds: checked ? [...(value.metricIds ?? []), metric.id] : value.metricIds?.filter(id => id !== metric.id),
                                                })
                                            }
                                        />
                                        {metric.name}
                                    </label>
                                ))}
                            {value.applicableMetricNames?.length ? (
                                <p className="text-xs text-muted-foreground">
                                    {t('SuggestedMetrics')}: {value.applicableMetricNames.join(', ')}
                                </p>
                            ) : null}
                        </fieldset>
                    ) : null}
                    {value.sharingEvidence ? (
                        <p className="text-xs text-muted-foreground">
                            {t('SharingEvidence')}: {value.sharingEvidence}
                        </p>
                    ) : null}
                </div>
            ) : (
                <label className="block space-y-1 text-sm">
                    <span>{t('SpecificConditions')}</span>
                    <Textarea
                        value={value.specificConditions?.join('\n') ?? ''}
                        onChange={event => onChange({ ...value, specificConditions: event.target.value.split('\n').filter(Boolean) })}
                    />
                </label>
            )}
            <label className="block space-y-1 text-sm">
                <span>{t('Field.dataSource')}</span>
                <Select
                    value={value.sourceConnectionId ?? '__shared__'}
                    onValueChange={id =>
                        onChange({
                            ...value,
                            sourceConnectionId: id === '__shared__' ? null : id,
                            ...(value.kind === 'business_rule' && value.applicationScope !== 'metrics' ? { applicationScope: id === '__shared__' ? 'model' : 'data_source' } : {}),
                        })
                    }
                >
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
    candidates,
    metrics,
    rules,
    targets,
    dataSources,
    organization,
    knowledgeModelId,
    onClose,
}: {
    candidate: Candidate;
    candidates: Candidate[];
    metrics: Metric[];
    rules: Rule[];
    targets: Target[];
    dataSources: DataSource[];
    organization: string;
    knowledgeModelId: string;
    onClose: () => void;
}) {
    const t = useTranslations('Knowledge.Extraction');
    const [payload, setPayload] = useState({
        ...candidate.payload,
        ...(candidate.payload.kind === 'metric' && candidate.payload.ruleIds === undefined && candidate.targetAssetId
            ? { ruleIds: rules.filter(r => r.metricIds?.includes(candidate.targetAssetId!)).map(r => r.id) }
            : {}),
    });
    const [dependencies, setDependencies] = useState<Array<{ candidate: Candidate; payload: ExtractedKnowledge; targetId: string }>>(() =>
        candidates
            .filter(c => candidate.payload.ruleCandidateIds?.includes(c.id))
            .map(c => ({
                candidate: c,
                payload: { ...c.payload, applicableMetricNames: [...new Set([...(c.payload.applicableMetricNames ?? []), candidate.payload.name])] },
                targetId: c.action === 'conflict' ? '__choose__' : (c.targetAssetId ?? '__new__'),
            })),
    );
    const pendingDependencies = dependencies.filter(d => payload.ruleCandidateIds?.includes(d.candidate.id));
    // Freeze the review's published revisions. Polling must not silently accept a newer target.
    const [reviewTargets] = useState(targets);
    const [reviewRules] = useState(rules);
    const [reviewMetrics] = useState(metrics);
    const [targetId, setTargetId] = useState(candidate.action === 'conflict' ? '__choose__' : (candidate.targetAssetId ?? '__new__'));
    const action = useExtractionAction(organization, knowledgeModelId);
    const invalidation = candidate.action === 'remove' || candidate.action === 'source_changed';
    const target = reviewTargets.find(target => target.id === targetId);
    const submit = (decision: string) => {
        if (decision === 'approve' && pendingDependencies.length) {
            const item = {
                expectedRuleRevisions: Object.fromEntries(reviewRules.map(r => [r.id, r.revision])),
                candidateId: candidate.id,
                payload,
                ...(target ? { targetAssetId: target.id, expectedTargetRevision: target.revision } : { createNew: true }),
            };
            action.mutate(
                {
                    actionId: 'knowledge.reviewCandidateBundle',
                    input: {
                        items: [
                            item,
                            ...pendingDependencies.map(d => {
                                const selected = reviewTargets.find(t => t.id === d.targetId);
                                return {
                                    candidateId: d.candidate.id,
                                    expectedMetricRevisions: Object.fromEntries(reviewMetrics.map(m => [m.id, m.revision])),
                                    payload: d.payload,
                                    ...(selected ? { targetAssetId: selected.id, expectedTargetRevision: selected.revision } : { createNew: true }),
                                };
                            }),
                        ],
                    },
                },
                { onSuccess: onClose },
            );
            return;
        }
        action.mutate(
            {
                actionId: 'knowledge.reviewCandidate',
                input: {
                    candidateId: candidate.id,
                    decision,
                    expectedMetricRevisions: Object.fromEntries(reviewMetrics.map(m => [m.id, m.revision])),
                    expectedRuleRevisions: Object.fromEntries(reviewRules.map(r => [r.id, r.revision])),
                    payload,
                    ...(target ? { targetAssetId: target.id, expectedTargetRevision: target.revision } : !invalidation ? { createNew: true } : {}),
                },
            },
            { onSuccess: onClose },
        );
    };
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
                                <PayloadEditor value={payload} onChange={setPayload} dataSources={dataSources} metrics={metrics} allowKindChange={targetId === '__new__'} />
                            </section>
                        </div>
                    </>
                )}
                {!invalidation && payload.kind === 'metric' ? (
                    <fieldset className="space-y-2 rounded-md border p-3">
                        <legend>{t('ReferencedRules')}</legend>
                        {rules
                            .filter(r => r.status === 'active' && (!r.payload.sourceConnectionId || r.payload.sourceConnectionId === payload.sourceConnectionId))
                            .map(rule => (
                                <label key={rule.id} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={payload.ruleIds?.includes(rule.id) ?? false}
                                        onCheckedChange={checked =>
                                            setPayload({ ...payload, ruleIds: checked ? [...(payload.ruleIds ?? []), rule.id] : payload.ruleIds?.filter(id => id !== rule.id) })
                                        }
                                    />
                                    {rule.payload.name}
                                </label>
                            ))}
                    </fieldset>
                ) : null}
                {pendingDependencies.length ? (
                    <section className="space-y-4 rounded-md border p-4">
                        <h3 className="font-medium">{t('ReviewTogether')}</h3>
                        <p className="text-sm text-muted-foreground">{t('RuleSemantics')}</p>
                        {pendingDependencies.map(dependency => (
                            <div key={dependency.candidate.id} className="space-y-3 border-t pt-3">
                                <Select value={dependency.targetId} onValueChange={id => setDependencies(ds => ds.map(d => (d === dependency ? { ...d, targetId: id } : d)))}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__choose__" disabled>
                                            {t('ChooseTarget')}
                                        </SelectItem>
                                        <SelectItem value="__new__">{t('CreateNew')}</SelectItem>
                                        {reviewTargets
                                            .filter(t => t.kind === 'business_rule')
                                            .map(t => (
                                                <SelectItem key={t.id} value={t.id}>
                                                    {t.name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                                <PayloadEditor
                                    value={dependency.payload}
                                    onChange={value => setDependencies(ds => ds.map(d => (d === dependency ? { ...d, payload: value } : d)))}
                                    dataSources={dataSources}
                                    metrics={metrics}
                                />
                                <EvidenceList evidence={dependency.candidate.evidence} />
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        setPayload({
                                            ...payload,
                                            description: `${payload.description}\n${dependency.payload.description}`,
                                            specificConditions: [...(payload.specificConditions ?? []), dependency.payload.description],
                                            ruleCandidateIds: payload.ruleCandidateIds?.filter(id => id !== dependency.candidate.id),
                                        })
                                    }
                                >
                                    {t('KeepConditionLocal')}
                                </Button>
                            </div>
                        ))}
                    </section>
                ) : null}
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
                                pendingDependencies.some(d => d.targetId === '__choose__') ||
                                action.isPending ||
                                !payload.name ||
                                !payload.description ||
                                targetId === '__choose__' ||
                                (payload.kind === 'metric' && !payload.sourceConnectionId)
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
function bulkReviewRestriction(candidate: Candidate, dataSources: DataSource[]) {
    if (candidate.action !== 'add' || candidate.targetAssetId || candidate.classificationReason) return 'IndividualReviewRequired';
    if (candidate.payload.ruleCandidateIds?.length) return 'JointReviewRequired';
    if (candidate.payload.kind === 'metric' && !dataSources.some(source => source.connectionId === candidate.payload.sourceConnectionId)) return 'NeedsMapping';
    return null;
}

export function KnowledgeReviewPanel({ organization, knowledgeModelId, dataSources }: { organization: string; knowledgeModelId: string; dataSources: DataSource[] }) {
    const t = useTranslations('Knowledge.Extraction');
    const pub = useTranslations('Knowledge.Publication');
    const locale = useLocale();
    const client = useQueryClient();
    const status = useExtractionStatus(organization, knowledgeModelId);
    const action = useExtractionAction(organization, knowledgeModelId);
    const [selected, setSelected] = useState<string[]>([]);
    const [approvalErrors, setApprovalErrors] = useState<string[]>([]);
    const [reviewing, setReviewing] = useState<Candidate | null>(null);
    const query = useQuery({
        queryKey: ['knowledge-model', knowledgeModelId, 'candidates', organization],
        queryFn: () =>
            executeActionClient<{ candidates: Candidate[]; targets: Target[]; metrics: Metric[]; rules: Rule[] }>(
                'knowledge.listCandidates',
                { knowledgeModelId },
                { organizationId: organization },
            ),
        enabled: status.data?.canManage === true,
        refetchInterval: 5000,
    });
    const candidates = query.data?.candidates ?? [];
    const eligibleIds = candidates.filter(candidate => !bulkReviewRestriction(candidate, dataSources)).map(candidate => candidate.id);
    const selectedIds = eligibleIds.filter(id => selected.includes(id));
    const batch = useMutation({
        retry: false,
        mutationFn: async (ids: string[]) => {
            const expectedRuleRevisions = Object.fromEntries((query.data?.rules ?? []).map(rule => [rule.id, rule.revision]));
            const expectedMetricRevisions = Object.fromEntries((query.data?.metrics ?? []).map(metric => [metric.id, metric.revision]));
            let approvedCount = 0;
            for (let offset = 0; offset < ids.length; offset += 50) {
                const candidateIds = ids.slice(offset, offset + 50);
                const result = await executeActionClient<{ results: Array<{ id: string; approved: boolean; error?: string }> }>(
                    'knowledge.approveCandidates',
                    { knowledgeModelId, candidateIds, expectedRuleRevisions, expectedMetricRevisions },
                    { organizationId: organization },
                );
                const approved = new Set(result.results.filter(item => item.approved).map(item => item.id));
                approvedCount += approved.size;
                setSelected(current => current.filter(id => !approved.has(id)));
                const failures = candidateIds
                    .filter(id => !approved.has(id))
                    .map(id => {
                        const name = candidates.find(candidate => candidate.id === id)?.payload.name ?? id;
                        return `${name}: ${result.results.find(item => item.id === id)?.error ?? t('ApprovalFailed')}`;
                    });
                if (failures.length) setApprovalErrors(current => [...current, ...failures]);
            }
            return approvedCount;
        },
        onMutate: () => setApprovalErrors([]),
        onSuccess: count => {
            if (count) toast.success(t('ApprovedCount', { count }));
        },
        onError: error => {
            const message = error instanceof Error ? error.message : t('ApprovalFailed');
            setApprovalErrors(current => [...current, message]);
            toast.error(t('BatchInterrupted'));
        },
        onSettled: () => client.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId] }),
    });
    const organizing = ['queued', 'running'].includes(status.data?.organizationJob?.status ?? '');
    const busy = organizing || action.isPending || batch.isPending;
    const organizationJob = status.data?.organizationJob;
    if (status.isPending)
        return (
            <p role="status" className="text-sm text-muted-foreground">
                {t('Loading')}
            </p>
        );
    if (status.error)
        return (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                <span className="min-w-0 break-words">{status.error.message}</span>
                <Button variant="outline" size="sm" onClick={() => void status.refetch()}>
                    {t('RetryLoading')}
                </Button>
            </div>
        );
    if (!status.data?.canManage) return <p className="text-sm text-muted-foreground">{t('AdminOnly')}</p>;
    return (
        <div className="min-w-0 space-y-4 text-foreground">
            <p className="text-sm text-muted-foreground">{t('ReviewNotice')}</p>
            <KnowledgePublicationControls organization={organization} modelId={knowledgeModelId} />
            <div role="toolbar" aria-label={t('ReviewToolbar')} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                        <Checkbox
                            aria-label={t('SelectAll')}
                            checked={selectedIds.length > 0 && selectedIds.length === eligibleIds.length ? true : selectedIds.length ? 'indeterminate' : false}
                            disabled={!eligibleIds.length || busy || query.isPending || query.isError}
                            onCheckedChange={checked => setSelected(checked === true ? eligibleIds : [])}
                        />
                        {t('SelectAll')}
                    </label>
                    <span role="status" className="text-muted-foreground">
                        {t('SelectedCount', { count: selectedIds.length })}
                    </span>
                </div>
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex" tabIndex={busy || query.isPending || query.isError ? 0 : undefined}>
                                <Button
                                    variant="outline"
                                    className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                                    aria-description={t('OrganizeHelp')}
                                    disabled={busy || query.isPending || query.isError}
                                    onClick={() => action.mutate({ actionId: 'knowledge.organizeCandidates', input: {} })}
                                >
                                    {organizing || action.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                                    {t('Organize')}
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[min(22rem,calc(100vw-2rem))] space-y-2 leading-relaxed">
                            <p>{t('OrganizeHelp')}</p>
                            <div className="space-y-1 border-t border-current/20 pt-2">
                                {organizationJob ? (
                                    <p>
                                        {t('OrganizationStatus')}: {t(`OrganizationJob.${organizationJob.status}`)}
                                    </p>
                                ) : null}
                                <p>
                                    {t('LastCompleted')}{' '}
                                    {organizationJob?.lastCompletedAt ? (
                                        <time dateTime={organizationJob.lastCompletedAt}>{new Date(organizationJob.lastCompletedAt).toLocaleString(locale)}</time>
                                    ) : (
                                        <span>{t('NoOrganizationCompleted')}</span>
                                    )}
                                </p>
                                {organizationJob?.error ? (
                                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{organizationJob.error}</p>
                                ) : null}
                            </div>
                        </TooltipContent>
                    </Tooltip>
                    <Button disabled={!selectedIds.length || busy || query.isError} onClick={() => batch.mutate(selectedIds)}>
                        {batch.isPending ? <Loader2 className="animate-spin" /> : null}
                        {batch.isPending ? t('Approving') : t('ApproveSelected', { count: selectedIds.length })}
                    </Button>
                </div>
            </div>
            {approvalErrors.length ? (
                <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p className="text-destructive">{t('BatchFailureNotice')}</p>
                    <ul className="mt-1 list-inside list-disc space-y-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {approvalErrors.map((error, index) => (
                            <li key={index}>{error}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {query.error ? (
                <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                    <span className="min-w-0 break-words">{query.error.message}</span>
                    <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                        {t('RetryLoading')}
                    </Button>
                </div>
            ) : null}
            {query.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                    {t('Loading')}
                </p>
            ) : !candidates.length ? (
                !query.error ? (
                    <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{t('NoCandidates')}</p>
                ) : null
            ) : (
                <ul aria-label={t('PendingReview')} className="divide-y overflow-hidden rounded-md border">
                    {candidates.map(candidate => {
                        const restriction = bulkReviewRestriction(candidate, dataSources);
                        const checked = selectedIds.includes(candidate.id);
                        return (
                            <li key={candidate.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${checked ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                                <Checkbox
                                    aria-label={t('SelectNamed', { name: candidate.payload.name })}
                                    aria-describedby={restriction ? `review-restriction-${candidate.id}` : undefined}
                                    checked={checked}
                                    disabled={Boolean(restriction) || busy || query.isError}
                                    onCheckedChange={value => setSelected(ids => (value === true ? [...new Set([...ids, candidate.id])] : ids.filter(id => id !== candidate.id)))}
                                />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="break-words font-medium [overflow-wrap:anywhere]">{candidate.payload.name}</div>
                                    {candidate.classificationReason ? <p className="text-xs text-muted-foreground">{pub('NeedsAttention')}</p> : null}
                                    {candidate.publicationReason ? (
                                        <p className="text-xs text-muted-foreground">
                                            {pub.has(`Reasons.${candidate.publicationReason}`) ? pub(`Reasons.${candidate.publicationReason}`) : pub('NeedsAttention')}
                                        </p>
                                    ) : null}
                                    {candidate.payload.description ? (
                                        <p className="line-clamp-2 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{candidate.payload.description}</p>
                                    ) : null}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">{t(candidate.payload.kind === 'metric' ? 'Metric' : 'BusinessRule')}</Badge>
                                        <Badge variant="outline">{t(`Action.${candidate.action}`)}</Badge>
                                        {restriction ? (
                                            <span id={`review-restriction-${candidate.id}`} className="text-xs text-muted-foreground">
                                                {t(restriction)}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => setReviewing(candidate)}>
                                    {t('Review')}
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {reviewing ? (
                <CandidateReview
                    key={reviewing.id}
                    candidate={reviewing}
                    candidates={candidates}
                    metrics={query.data?.metrics ?? []}
                    rules={query.data?.rules ?? []}
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
        queryFn: () =>
            executeActionClient<{ rules: Rule[]; metrics: Metric[] }>('knowledge.listBusinessRules', { knowledgeModelId, includeArchived: true }, { organizationId: organization }),
        refetchInterval: 10_000,
    });
    const [editing, setEditing] = useState<Rule | null>(null);
    const [metricRevisions, setMetricRevisions] = useState<Record<string, string>>({});
    const [payload, setPayload] = useState<ExtractedKnowledge | null>(null);
    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('RulesNotice')}</p>
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
                    <section key={rule.id} id={`rule-${rule.id}`} className="space-y-3 rounded-md border p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="font-medium">{rule.payload.name}</h3>
                                <p className="text-xs text-muted-foreground">
                                    {t(`Scope.${rule.applicationScope ?? rule.payload.applicationScope ?? (rule.payload.sourceConnectionId ? 'data_source' : 'model')}`)} ·{' '}
                                    {rule.publicationMethod === 'automatic' ? `${t('AutomaticPublished')} · ` : ''}
                                    {t('LinkedMetricCount', { count: rule.metricIds?.length ?? 0 })} · v{rule.revision}
                                    {rule.status === 'archived' ? ` · ${t('Inactive')}` : ''}
                                </p>
                            </div>
                            {rule.sourceState !== 'current' ? <Badge variant="outline">{t('SourceChanged')}</Badge> : null}
                            {status.data?.canManage ? (
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setEditing(rule);
                                            setMetricRevisions(Object.fromEntries((query.data?.metrics ?? []).map(m => [m.id, m.revision!])));
                                            setPayload({ ...rule.payload, metricIds: rule.metricIds });
                                        }}
                                    >
                                        {t('Edit')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={action.isPending}
                                        onClick={() =>
                                            action.mutate({
                                                actionId: 'knowledge.updateBusinessRule',
                                                input: { id: rule.id, expectedRevision: rule.revision, archived: rule.status !== 'archived' },
                                            })
                                        }
                                    >
                                        {t(rule.status === 'archived' ? 'Restore' : 'Archive')}
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{rule.payload.description}</p>
                        {rule.metrics?.length ? (
                            <div className="flex flex-wrap gap-2">
                                {rule.metrics.map(metric => (
                                    <Link key={metric.id} className="text-sm underline" href={`?tab=definitions&definition=${encodeURIComponent(metric.id)}`}>
                                        {metric.name}
                                    </Link>
                                ))}
                            </div>
                        ) : null}
                        <EvidenceList evidence={rule.evidence} />
                    </section>
                ))
            )}
            <Dialog open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('Edit')}</DialogTitle>
                    </DialogHeader>
                    {payload ? <PayloadEditor value={payload} onChange={setPayload} dataSources={dataSources} metrics={query.data?.metrics ?? []} /> : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>
                            {t('Cancel')}
                        </Button>
                        <Button
                            disabled={!payload?.name || !payload.description || action.isPending}
                            onClick={() =>
                                editing &&
                                action.mutate(
                                    {
                                        actionId: 'knowledge.updateBusinessRule',
                                        input: { id: editing.id, expectedRevision: editing.revision, payload, expectedMetricRevisions: metricRevisions },
                                    },
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

export function MetricRulesPanel({ organization, knowledgeModelId, metricId }: { organization: string; knowledgeModelId: string; metricId: string }) {
    const t = useTranslations('Knowledge.Extraction');
    const status = useExtractionStatus(organization, knowledgeModelId);
    const action = useExtractionAction(organization, knowledgeModelId);
    const query = useQuery({
        queryKey: ['knowledge-model', knowledgeModelId, 'business-rules', organization],
        queryFn: () =>
            executeActionClient<{ rules: Rule[]; metrics: Metric[] }>('knowledge.listBusinessRules', { knowledgeModelId, includeArchived: true }, { organizationId: organization }),
    });
    const metric = query.data?.metrics?.find(m => m.id === metricId);
    const [editing, setEditing] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [snapshot, setSnapshot] = useState<{ revision: string; rules: Rule[]; referenceIds: string[] } | null>(null);
    if (!metric) return null;
    const applicable = query.data!.rules.filter(
        r => r.metricIds?.includes(metricId) || (r.applicationScope !== 'metrics' && (!r.payload.sourceConnectionId || r.payload.sourceConnectionId === metric.sourceConnectionId)),
    );
    return (
        <section className="mt-5 space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
                <h3 className="font-medium">{t('ReferencedRules')}</h3>
                {status.data?.canManage ? (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            setSelected(query.data!.rules.filter(r => r.metricIds?.includes(metricId)).map(r => r.id));
                            setSnapshot({
                                revision: metric.revision!,
                                rules: query.data!.rules,
                                referenceIds: query.data!.rules.filter(r => r.metricIds?.includes(metricId)).map(r => r.id),
                            });
                            setEditing(true);
                        }}
                    >
                        {t('Edit')}
                    </Button>
                ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t('RuleSemantics')}</p>
            {applicable.map(rule => (
                <div key={rule.id} className="text-sm">
                    <Link className="underline" href={`?tab=rules&rule=${encodeURIComponent(rule.id)}#rule-${rule.id}`}>
                        {rule.payload.name}
                    </Link>{' '}
                    · v{rule.revision} {rule.status === 'archived' ? <Badge variant="outline">{t('Inactive')}</Badge> : null}
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{rule.payload.description}</p>
                </div>
            ))}
            {!applicable.length ? <p className="text-sm text-muted-foreground">{t('NoReferencedRules')}</p> : null}
            <Dialog open={editing} onOpenChange={setEditing}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('ReferencedRules')}</DialogTitle>
                    </DialogHeader>
                    {snapshot?.rules
                        .filter(r => !r.payload.sourceConnectionId || r.payload.sourceConnectionId === metric.sourceConnectionId)
                        .map(rule => (
                            <label key={rule.id} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    disabled={rule.status === 'archived' && !selected.includes(rule.id)}
                                    checked={selected.includes(rule.id)}
                                    onCheckedChange={checked => setSelected(ids => (checked ? [...ids, rule.id] : ids.filter(id => id !== rule.id)))}
                                />
                                {rule.payload.name} · {t(`Scope.${rule.applicationScope ?? 'model'}`)}
                            </label>
                        ))}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(false)}>
                            {t('Cancel')}
                        </Button>
                        <Button
                            disabled={action.isPending || !snapshot}
                            onClick={() =>
                                action.mutate(
                                    {
                                        actionId: 'knowledge.updateMetricRules',
                                        input: {
                                            metricId,
                                            expectedRevision: snapshot!.revision,
                                            ruleIds: selected,
                                            expectedReferenceIds: snapshot!.referenceIds,
                                            expectedRuleRevisions: Object.fromEntries(snapshot!.rules.map(r => [r.id, r.revision])),
                                        },
                                    },
                                    { onSuccess: () => setEditing(false) },
                                )
                            }
                        >
                            {t('Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
