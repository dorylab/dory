'use client';

import { useEffect, useRef, useState } from 'react';
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
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { DataTablePagination } from '@/components/@dory/ui/data-table-pagination';

import { useKnowledgeListPagination } from './knowledge-list-pagination';

type Metric = { id: string; name: string; sourceConnectionId: string; revision?: string };
type DataSource = { connectionId: string; name: string };
type Evidence = { id: string; sourceId?: string | null; quote: string; sourceUrl: string | null; sourceTitle: string; state: string };
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
type ExtractionStatus = {
    organizationJob?: { status: string; error: string | null; lastCompletedAt?: string | null } | null;
    canManage: boolean;
    connectors: Array<{ id: string; autoExtract: boolean }>;
    jobs: Array<{
        id: string;
        connectorId: string;
        originalSourceId: string;
        status: string;
        completedChunks: number;
        totalChunks: number;
        error: string | null;
    }>;
};
function useExtractionStatus(organization: string, knowledgeModelId: string) {
    return useQuery({
        queryKey: ['knowledge-model', knowledgeModelId, 'extraction', organization],
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
            executeActionClient(actionId, { knowledgeModelId, ...input }, { organizationId: organization }),
        onSuccess: async () => {
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
function EvidenceList({ evidence }: { evidence: Evidence[] }) {
    const t = useTranslations('Knowledge.Extraction');
    return (
        <div className="space-y-2">
            {evidence.map(e => (
                <div key={e.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {e.sourceId ? (
                            <a className="underline" href={`?tab=sources&source=${encodeURIComponent(e.sourceId)}`}>
                                {knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl })}
                            </a>
                        ) : (
                            <span>{knowledgeSourceDisplayName({ fileName: e.sourceTitle, sourceUrl: e.sourceUrl })}</span>
                        )}
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
function BusinessRuleEditor({
    value,
    onChange,
    dataSources,
    metrics = [],
}: {
    value: ExtractedKnowledge;
    onChange: (value: ExtractedKnowledge) => void;
    dataSources: DataSource[];
    metrics?: Metric[];
}) {
    const t = useTranslations('Knowledge.Extraction');
    const text = (key: 'name' | 'description' | 'unit' | 'scope') => (
        <label className="block space-y-1 text-sm" key={key}>
            <span>{t(`Field.${key}`)}</span>
            {key === 'description' ? (
                <Textarea value={value.description} onChange={event => onChange({ ...value, description: event.target.value })} />
            ) : (
                <Input value={value[key] ?? ''} onChange={event => onChange({ ...value, [key]: key === 'name' ? event.target.value : event.target.value || undefined })} />
            )}
        </label>
    );
    return (
        <div className="space-y-3">
            {text('name')}
            {text('description')}
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
            <label className="block space-y-1 text-sm">
                <span>{t('Field.dataSource')}</span>
                <Select
                    value={value.sourceConnectionId ?? '__shared__'}
                    onValueChange={id =>
                        onChange({
                            ...value,
                            sourceConnectionId: id === '__shared__' ? null : id,
                            ...(value.applicationScope !== 'metrics' ? { applicationScope: id === '__shared__' ? 'model' : 'data_source' } : {}),
                        })
                    }
                >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__shared__">{t('ModelWide')}</SelectItem>
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
    const [focusedRuleId, setFocusedRuleId] = useQueryState('rule', parseAsString);
    const status = useExtractionStatus(organization, knowledgeModelId);
    const action = useExtractionAction(organization, knowledgeModelId);
    const query = useQuery({
        queryKey: ['knowledge-model', knowledgeModelId, 'business-rules', organization],
        queryFn: () =>
            executeActionClient<{ rules: Rule[]; metrics: Metric[] }>('knowledge.listBusinessRules', { knowledgeModelId, includeArchived: true }, { organizationId: organization }),
        refetchInterval: 10_000,
    });
    const pagination = useKnowledgeListPagination('rules', query.data?.rules.length, {
        id: focusedRuleId,
        index: query.data?.rules.findIndex(rule => rule.id === focusedRuleId) ?? -1,
    });
    const scrolledRule = useRef<string | null>(null);
    useEffect(() => {
        if (!focusedRuleId) {
            scrolledRule.current = null;
            return;
        }
        if (!query.data?.rules.length || scrolledRule.current === focusedRuleId) return;
        const index = query.data.rules.findIndex(rule => rule.id === focusedRuleId);
        if (index < pagination.pageIndex * pagination.pageSize || index >= (pagination.pageIndex + 1) * pagination.pageSize) return;
        scrolledRule.current = focusedRuleId;
        requestAnimationFrame(() => document.getElementById(`rule-${focusedRuleId}`)?.scrollIntoView({ block: 'start' }));
    }, [focusedRuleId, pagination.pageIndex, pagination.pageSize, query.data?.rules]);
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
                query.data.rules.slice(pagination.pageIndex * pagination.pageSize, (pagination.pageIndex + 1) * pagination.pageSize).map(rule => (
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
            {query.data?.rules.length ? (
                <DataTablePagination
                    total={query.data.rules.length}
                    {...pagination}
                    onPageChange={index => {
                        void setFocusedRuleId(null);
                        pagination.onPageChange(index);
                    }}
                    onPageSizeChange={size => {
                        void setFocusedRuleId(null);
                        pagination.onPageSizeChange(size);
                    }}
                />
            ) : null}
            <Dialog open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('Edit')}</DialogTitle>
                    </DialogHeader>
                    {payload ? <BusinessRuleEditor value={payload} onChange={setPayload} dataSources={dataSources} metrics={query.data?.metrics ?? []} /> : null}
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
