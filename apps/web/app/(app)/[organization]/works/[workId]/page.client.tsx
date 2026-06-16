'use client';

import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeft,
    ArrowUpRight,
    Bot,
    Check,
    ChevronDown,
    CircleAlert,
    Clock,
    Database,
    Loader2,
    Logs,
    MoreVertical,
    Pencil,
    Plus,
    RefreshCw,
    Send,
    ShieldCheck,
    Trash2,
    User,
    Wrench,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { fetchSqlTabs, SQL_TABS_PREFETCH_STALE_TIME_MS, sqlTabsQueryKey } from '@/lib/sql-console/tab-queries';
import { effectiveInvestigationStatus, investigationActivityDisplay } from '@/lib/work/investigation-card-state';
import {
    fallbackConclusionMetadata,
    formatWorkEvidenceSummary,
    formatUnconfirmedAnalysisSummary,
    getConclusionSourceBoundary,
    getWorkLifecycleDisplayStatus,
    type WorkLifecycleDisplayStatus,
} from '@/lib/work/review-state';
import { SqlResultBody, SqlStatementBlock } from '@/components/@dory/ui/ai/sql-result';
import type { SqlResultManualExecutionMode, SqlResultPart } from '@/components/@dory/ui/ai/sql-result/type';
import { MessageResponse } from '@/components/ai-elements/message';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { WorkspaceScope } from '@dory/shared/types/tabs';
import { useConnections } from '../../connections/hooks/use-connections';
import type {
    Work,
    WorkAnalysisAuditStatus,
    WorkConclusionConfidence,
    WorkConclusionMetadata,
    WorkDetail,
    WorkInvestigation,
    WorkInvestigationFinding,
    WorkRun,
    WorkRunEvent,
    WorkRunTimeline,
    WorkTimelineEvent,
    WorkWorkspaceSnapshot,
} from '../types';
import { eventTypeLabel, formatRelativeTime, runStatusClassName, runStatusLabel, statusClassName, statusLabel } from '../utils';

type WorkDetailPageClientProps = {
    organization: string;
    workId: string;
};

const WORKSPACE_PREFETCH_STALE_TIME_MS = 30_000;
const DEFAULT_UPDATE_CONCLUSION_INSTRUCTION = 'Update the conclusion from the current included analyses.';

function analysisInclusionClassName(status: WorkAnalysisAuditStatus) {
    if (status === 'rejected') return 'border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
    if (status === 'accepted' || status === 'reviewed')
        return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
}

function analysisDisplayLabel(investigation: WorkInvestigation) {
    if (investigation.auditStatus === 'rejected') return 'Excluded';
    if (investigation.auditStatus === 'accepted' || investigation.auditStatus === 'reviewed') return 'Verified';
    if (investigation.auditStatus === 'revised' || investigation.currentRevision?.createdBy === 'user' || investigation.findings.some(finding => finding.createdBy === 'user'))
        return 'Human edited';
    return 'Agent generated';
}

function analysisDisplayClassName(investigation: WorkInvestigation) {
    if (investigation.auditStatus === 'draft') return 'border-muted bg-muted/50 text-muted-foreground';
    return analysisInclusionClassName(investigation.auditStatus);
}

function hasSqlBackedFinding(investigation: WorkInvestigation) {
    return investigation.findings.some(finding => Boolean(finding.sourceRunEventId || finding.sourceTabId));
}

type AnalysisDisplayFinding = Pick<WorkInvestigationFinding, 'id' | 'content' | 'sourceTabId' | 'sourceRunEventId' | 'createdBy' | 'orderIndex' | 'createdAt' | 'updatedAt'> & {
    whyItMatters?: string | null;
};

function displayFindingsForInvestigation(investigation: WorkInvestigation, latestRun: WorkRun | null, latestRunEvents: WorkRunEvent[]): AnalysisDisplayFinding[] {
    const snapshotFindings = investigation.currentRevision?.findingsSnapshot ?? [];
    const baseFindings: AnalysisDisplayFinding[] = snapshotFindings.length ? snapshotFindings : investigation.findings;
    const revisionRunId = investigation.currentRevision?.runId ?? null;
    if (!revisionRunId) return baseFindings;

    const revisionRunEventIds = latestRun?.id === revisionRunId ? new Set(latestRunEvents.map(event => event.id)) : null;
    const revisionStartedAt = latestRun?.id === revisionRunId ? Date.parse(latestRun.startedAt) : Number.NaN;
    const runFindings = baseFindings.filter(finding => {
        if (finding.sourceRunEventId && revisionRunEventIds?.has(finding.sourceRunEventId)) return true;
        if (!Number.isFinite(revisionStartedAt)) return false;
        const findingCreatedAt = Date.parse(finding.createdAt);
        return Number.isFinite(findingCreatedAt) && findingCreatedAt >= revisionStartedAt;
    });

    return runFindings.length ? runFindings : baseFindings;
}

function workLifecycleDisplayStatusLabel(status: WorkLifecycleDisplayStatus) {
    if (status === 'running') return 'Running';
    if (status === 'failed') return 'Failed';
    if (status === 'in_progress') return 'In Progress';
    if (status === 'needs_attention') return 'Needs Attention';
    if (status === 'ready') return 'Ready';
    return 'Draft';
}

function workLifecycleDisplayStatusClassName(status: WorkLifecycleDisplayStatus) {
    if (status === 'running') return statusClassName('running');
    if (status === 'ready') return statusClassName('completed');
    if (status === 'in_progress') return statusClassName('running');
    if (status === 'needs_attention') return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
    if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
    return statusClassName('draft');
}

function conclusionConfidenceClassName(confidence: WorkConclusionConfidence) {
    if (confidence === 'high') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    if (confidence === 'medium') return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
    return 'border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
}

function normalizeConclusionMetadata(input: WorkConclusionMetadata | null, fallback: WorkConclusionMetadata): WorkConclusionMetadata {
    if (!input) return fallback;
    return {
        confidence: input.confidence,
        caveats: input.caveats.map(item => item.trim()).filter(Boolean),
        recommendedNextStep: input.recommendedNextStep?.trim() || fallback.recommendedNextStep,
    };
}

function parseCaveatsDraft(value: string) {
    return value
        .split('\n')
        .map(item => item.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
}

function pluralizeAnalysis(count: number) {
    return count === 1 ? 'analysis' : 'analyses';
}

function analysisAuditStatusToastLabel(status: WorkAnalysisAuditStatus) {
    if (status === 'accepted') return 'confirmed';
    if (status === 'rejected') return 'excluded';
    return 'included';
}

function buildIncludedAnalysesMarkdown(analyses: WorkInvestigation[], latestRun: WorkRun | null, latestRunEvents: WorkRunEvent[]) {
    const includedAnalyses = analyses.filter(investigation => investigation.auditStatus !== 'rejected');
    if (!includedAnalyses.length) return null;

    return includedAnalyses
        .flatMap(analysis => {
            const findings = displayFindingsForInvestigation(analysis, latestRun, latestRunEvents)
                .map(finding => finding.content.trim())
                .filter(Boolean);
            return [`### ${analysis.title}`, '', ...(findings.length ? findings : ['_No findings recorded._'])];
        })
        .join('\n\n');
}

function InfoTooltip({ label = 'More info', children }: { label?: string; children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={label}
                >
                    <CircleAlert className="size-4" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-80 text-left text-xs leading-5">
                {children}
            </TooltipContent>
        </Tooltip>
    );
}

function DropdownMenuItemWithTooltip({ tooltip, ...props }: ComponentProps<typeof DropdownMenuItem> & { tooltip: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <DropdownMenuItem {...props} />
            </TooltipTrigger>
            <TooltipContent side="left" align="center" className="max-w-72 text-left text-xs leading-5">
                {tooltip}
            </TooltipContent>
        </Tooltip>
    );
}

export function WorkDetailPageClient({ organization, workId }: WorkDetailPageClientProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const connectionsQuery = useConnections();
    const [goal, setGoal] = useState('');
    const [isEditingGoal, setIsEditingGoal] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [conclusion, setConclusion] = useState('');
    const [conclusionConfidence, setConclusionConfidence] = useState<WorkConclusionConfidence>('medium');
    const [conclusionCaveatsDraft, setConclusionCaveatsDraft] = useState('');
    const [recommendedNextStepDraft, setRecommendedNextStepDraft] = useState('');
    const [isEditingConclusion, setIsEditingConclusion] = useState(false);
    const [investigationTitle, setInvestigationTitle] = useState('');
    const [openingInvestigationId, setOpeningInvestigationId] = useState<string | null>(null);
    const [deletingInvestigation, setDeletingInvestigation] = useState<WorkInvestigation | null>(null);
    const [runsListOpen, setRunsListOpen] = useState(false);
    const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(() => new Set());
    const [continueOpen, setContinueOpen] = useState(false);
    const [continueInstruction, setContinueInstruction] = useState('');

    const workQuery = useQuery({
        queryKey: ['work', workId],
        queryFn: () => executeActionClient<WorkDetail>('work.get', { id: workId }),
        refetchInterval: query => {
            const latestRun = query.state.data?.latestRun;
            return latestRun?.status === 'running' ? 1500 : false;
        },
    });

    const connectionById = useMemo(() => new Map((connectionsQuery.data ?? []).map(item => [item.connection.id, item.connection])), [connectionsQuery.data]);
    const work = workQuery.data?.work ?? null;
    const investigations = useMemo(() => workQuery.data?.investigations ?? [], [workQuery.data?.investigations]);
    const latestRun = workQuery.data?.latestRun ?? null;
    const latestRunId = latestRun?.id ?? null;
    const latestRunStatus = latestRun?.status ?? null;
    const latestRunEvents = useMemo(() => workQuery.data?.latestRunEvents ?? [], [workQuery.data?.latestRunEvents]);
    const runTimelines = useMemo(() => workQuery.data?.runTimelines ?? [], [workQuery.data?.runTimelines]);
    const visibleRunTimelines = useMemo(() => runTimelines.filter(runTimeline => !isInternalUpdateConclusionRun(runTimeline)), [runTimelines]);
    const latestUserRunTimeline = useMemo(
        () => visibleRunTimelines.find(runTimeline => Boolean(runUserSubmission(runTimeline.events))) ?? visibleRunTimelines[0] ?? null,
        [visibleRunTimelines],
    );
    const displayedRunTimelines = runsListOpen ? visibleRunTimelines : latestUserRunTimeline ? [latestUserRunTimeline] : [];
    const connection = work ? connectionById.get(work.connectionId) : null;
    const isRunRunning = latestRunStatus === 'running' || work?.status === 'running';
    const latestEvent = latestRunEvents[latestRunEvents.length - 1] ?? null;
    const evidenceSummary = useMemo(() => formatWorkEvidenceSummary(investigations), [investigations]);
    const unconfirmedAnalysisSummary = useMemo(() => formatUnconfirmedAnalysisSummary(investigations), [investigations]);
    const conclusionSourceBoundary = useMemo(() => getConclusionSourceBoundary(investigations), [investigations]);
    const includedAnalysisConclusion = useMemo(() => buildIncludedAnalysesMarkdown(investigations, latestRun, latestRunEvents), [investigations, latestRun, latestRunEvents]);
    const displayConclusionMarkdown = work?.conclusion?.trim() || includedAnalysisConclusion;
    const fallbackMetadata = useMemo(
        () => fallbackConclusionMetadata({ analyses: investigations, conclusionStatus: work?.conclusionStatus }),
        [investigations, work?.conclusionStatus],
    );
    const displayConclusionMetadata = useMemo(() => normalizeConclusionMetadata(work?.conclusionMetadata ?? null, fallbackMetadata), [fallbackMetadata, work?.conclusionMetadata]);
    const workLifecycleStatus = work
        ? getWorkLifecycleDisplayStatus({
              workStatus: work.status,
              latestRun,
              analyses: investigations,
              conclusionStatus: work.conclusionStatus,
              conclusionMetadata: work.conclusionMetadata,
          })
        : 'draft';
    const includedAnalysisCount = conclusionSourceBoundary.includedAnalyses.length;
    const hasIncludedAnalysis = includedAnalysisCount > 0;
    const conclusionEvidenceLine =
        includedAnalysisCount > 0
            ? `Conclusion based on ${includedAnalysisCount} included ${pluralizeAnalysis(includedAnalysisCount)}`
            : 'Conclusion needs at least one included analysis';
    const excludedAnalysisCount = conclusionSourceBoundary.excludedAnalyses.length;
    const excludedAnalysisTitle =
        excludedAnalysisCount > 0
            ? `${excludedAnalysisCount} ${pluralizeAnalysis(excludedAnalysisCount)} ${excludedAnalysisCount === 1 ? 'is' : 'are'} excluded from this conclusion.`
            : undefined;

    useEffect(() => {
        if (!work) return;
        if (!isEditingTitle) {
            setTitleDraft(work.title);
        }
        if (!isEditingGoal) {
            setGoal(work.goal);
        }
        if (!isEditingConclusion) {
            setConclusion(work.conclusion ?? '');
            const metadata = normalizeConclusionMetadata(work.conclusionMetadata ?? null, fallbackMetadata);
            setConclusionConfidence(metadata.confidence);
            setConclusionCaveatsDraft(metadata.caveats.join('\n'));
            setRecommendedNextStepDraft(metadata.recommendedNextStep ?? '');
        }
    }, [work, fallbackMetadata, isEditingGoal, isEditingTitle, isEditingConclusion]);

    const invalidateWork = () => queryClient.invalidateQueries({ queryKey: ['work', workId] });

    const expandRunDetails = useCallback((runId: string) => {
        setExpandedRunIds(current => {
            const next = new Set(current);
            next.add(runId);
            return next;
        });
    }, []);

    const openLatestRunDetails = useCallback(() => {
        if (!latestRunId) return;
        setRunsListOpen(true);
        expandRunDetails(latestRunId);
    }, [expandRunDetails, latestRunId]);

    const toggleRunDetails = useCallback((runId: string) => {
        setExpandedRunIds(current => {
            const next = new Set(current);
            if (next.has(runId)) {
                next.delete(runId);
            } else {
                next.add(runId);
            }
            return next;
        });
    }, []);

    const updateTitleMutation = useMutation({
        mutationFn: (nextTitle: string) => executeActionClient<Work>('work.updateTitle', { id: workId, title: nextTitle }),
        onSuccess: updatedWork => {
            toast.success('Title updated');
            setTitleDraft(updatedWork.title);
            setIsEditingTitle(false);
            queryClient.setQueryData<WorkDetail>(['work', workId], current =>
                current
                    ? {
                          ...current,
                          work: {
                              ...current.work,
                              title: updatedWork.title,
                              updatedAt: updatedWork.updatedAt,
                          },
                      }
                    : current,
            );
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update title'),
    });

    const updateGoalMutation = useMutation({
        mutationFn: (nextGoal: string) => executeActionClient<Work>('work.updateGoal', { id: workId, goal: nextGoal }),
        onSuccess: updatedWork => {
            toast.success('Goal updated');
            setGoal(updatedWork.goal);
            setIsEditingGoal(false);
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update goal'),
    });

    const updateConclusionMutation = useMutation({
        mutationFn: (input: { conclusion: string; conclusionMetadata: WorkConclusionMetadata | null }) =>
            executeActionClient<Work>('work.updateConclusion', {
                id: workId,
                conclusion: input.conclusion.trim() ? input.conclusion.trim() : null,
                conclusionMetadata: input.conclusion.trim() ? input.conclusionMetadata : null,
            }),
        onSuccess: updatedWork => {
            toast.success('Conclusion updated');
            setConclusion(updatedWork.conclusion ?? '');
            const metadata = normalizeConclusionMetadata(updatedWork.conclusionMetadata, fallbackMetadata);
            setConclusionConfidence(metadata.confidence);
            setConclusionCaveatsDraft(metadata.caveats.join('\n'));
            setRecommendedNextStepDraft(metadata.recommendedNextStep ?? '');
            setIsEditingConclusion(false);
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update conclusion'),
    });

    const updateAnalysisAuditStatusMutation = useMutation({
        mutationFn: (input: { investigation: WorkInvestigation; auditStatus: WorkAnalysisAuditStatus }) =>
            executeActionClient<WorkInvestigation>('work.updateInvestigation', {
                workId,
                id: input.investigation.id,
                auditStatus: input.auditStatus,
            }),
        onSuccess: (_updatedInvestigation, input) => {
            toast.success(`Analysis ${analysisAuditStatusToastLabel(input.auditStatus)}`);
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update Analysis review status'),
    });

    const reviseInvestigationMutation = useMutation({
        mutationFn: async (input: { investigation: WorkInvestigation; instruction: string }) => {
            await executeActionClient<WorkInvestigation>('work.reviseInvestigation', {
                workId,
                investigationId: input.investigation.id,
                instruction: input.instruction,
            });
            await invalidateWork();
            await runWorkMutation.mutateAsync({
                mode: 'revise_analysis',
                focusInvestigationId: input.investigation.id,
                userInstruction: input.instruction,
            });
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to revise Analysis'),
    });

    const runWorkMutation = useMutation({
        mutationFn: async (input?: {
            mode?: 'run' | 'continue_work' | 'revise_analysis' | 'update_conclusion' | 'rerun_from_scratch';
            focusInvestigationId?: string | null;
            userInstruction?: string | null;
        }) => {
            if (work && goal.trim() && goal.trim() !== work.goal) {
                await executeActionClient<Work>('work.updateGoal', { id: workId, goal: goal.trim() });
                await invalidateWork();
            }

            const body =
                input?.mode || input?.focusInvestigationId || input?.userInstruction
                    ? {
                          mode: input.mode,
                          focusInvestigationId: input.focusInvestigationId ?? undefined,
                          userInstruction: input.userInstruction?.trim() || undefined,
                      }
                    : null;
            const response = await fetch(`/api/works/${encodeURIComponent(workId)}/run`, {
                method: 'POST',
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                let message = text;
                try {
                    const parsed = JSON.parse(text) as { error?: string };
                    message = parsed.error ?? text;
                } catch {
                    // keep text response
                }
                throw new Error(message || 'Failed to start Work run');
            }

            await invalidateWork();
            setContinueOpen(false);
            setContinueInstruction('');
            void response.text().finally(() => {
                void invalidateWork();
            });
        },
        onError: error => {
            void invalidateWork();
            toast.error(error instanceof Error ? error.message : 'Failed to start Work run');
        },
    });

    const startContinueWork = useCallback(() => {
        if (!continueOpen) {
            setContinueOpen(true);
            return;
        }
        const instruction = continueInstruction.trim();
        if (!instruction) {
            toast.error('Tell the Agent how to continue this Work');
            return;
        }
        runWorkMutation.mutate({ mode: 'continue_work', userInstruction: instruction });
    }, [continueInstruction, continueOpen, runWorkMutation]);

    const nextStep = useMemo(() => {
        if (isRunRunning) {
            return {
                title: 'Agent is working',
                description: latestEvent?.content || 'Review the latest run details while Dory continues the Work.',
                primaryLabel: 'View Run Details',
                primaryAction: openLatestRunDetails,
                secondaryLabel: null as string | null,
                secondaryAction: null as (() => void) | null,
                disabled: false,
            };
        }
        if (hasIncludedAnalysis && work?.conclusionStatus !== 'fresh') {
            return {
                title: 'Update Conclusion',
                description: 'The conclusion is missing or outdated for the current included evidence.',
                primaryLabel: 'Update Conclusion',
                primaryAction: () =>
                    runWorkMutation.mutate({
                        mode: 'update_conclusion',
                        userInstruction: 'Update the conclusion from the current included analyses.',
                    }),
                secondaryLabel: 'Continue Work',
                secondaryAction: startContinueWork,
                disabled: runWorkMutation.isPending,
            };
        }
        return {
            title: 'Continue Work',
            description: displayConclusionMetadata.recommendedNextStep || 'Ask a follow-up question, add another analysis, or refine the current conclusion.',
            primaryLabel: 'Continue Work',
            primaryAction: startContinueWork,
            secondaryLabel: latestRun ? 'View Run Details' : null,
            secondaryAction: latestRun ? openLatestRunDetails : null,
            disabled: runWorkMutation.isPending || !goal.trim(),
        };
    }, [
        displayConclusionMetadata.recommendedNextStep,
        goal,
        hasIncludedAnalysis,
        isRunRunning,
        latestEvent?.content,
        latestRun,
        runWorkMutation,
        startContinueWork,
        work?.conclusionStatus,
        openLatestRunDetails,
    ]);

    const startEditingConclusion = () => {
        const metadata = normalizeConclusionMetadata(work?.conclusionMetadata ?? null, fallbackMetadata);
        setConclusion(work?.conclusion?.trim() ? work.conclusion : (includedAnalysisConclusion ?? ''));
        setConclusionConfidence(metadata.confidence);
        setConclusionCaveatsDraft(metadata.caveats.join('\n'));
        setRecommendedNextStepDraft(metadata.recommendedNextStep ?? '');
        setIsEditingConclusion(true);
    };

    const createInvestigationMutation = useMutation({
        mutationFn: (title: string) => executeActionClient<WorkInvestigation>('work.createInvestigation', { workId, title }),
        onSuccess: investigation => {
            setInvestigationTitle('');
            invalidateWork();
            toast.success('Analysis added. Agent run started');
            runWorkMutation.mutate({ focusInvestigationId: investigation.id });
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to create Analysis'),
    });

    const deleteInvestigationMutation = useMutation({
        mutationFn: (investigation: WorkInvestigation) => executeActionClient<{ ok: boolean }>('work.deleteInvestigation', { workId, id: investigation.id }),
        onMutate: async investigation => {
            await queryClient.cancelQueries({ queryKey: ['work', workId] });
            const previousWorkDetail = queryClient.getQueryData<WorkDetail>(['work', workId]);
            setDeletingInvestigation(null);
            queryClient.setQueryData<WorkDetail>(['work', workId], current =>
                current
                    ? {
                          ...current,
                          investigations: current.investigations.filter(item => item.id !== investigation.id),
                      }
                    : current,
            );
            return { previousWorkDetail };
        },
        onSuccess: () => {
            toast.success('Analysis deleted');
        },
        onError: (error, _investigation, context) => {
            if (context?.previousWorkDetail) {
                queryClient.setQueryData(['work', workId], context.previousWorkDetail);
            }
            toast.error(error instanceof Error ? error.message : 'Failed to delete Analysis');
        },
        onSettled: () => {
            void invalidateWork();
        },
    });

    const copySql = async (sql: string) => {
        try {
            await navigator.clipboard.writeText(sql);
            toast.success('SQL copied');
        } catch (error) {
            console.error(error);
            toast.error('Failed to copy SQL');
        }
    };

    const openSqlInConsole = async (payload: { sql: string; database: string | null; mode?: SqlResultManualExecutionMode }) => {
        if (!work || !payload.sql.trim()) return;

        try {
            const tab = await executeActionClient<{ tabId: string }>(
                'tab.create',
                {
                    connectionId: work.connectionId,
                    tabType: 'sql',
                    tabName: 'Work SQL',
                    content: payload.sql,
                    databaseName: payload.database,
                },
                { currentConnectionId: work.connectionId },
            );

            try {
                localStorage.setItem(`sqlconsole:activeTabId:${work.connectionId}`, tab.tabId);
            } catch {
                // ignore
            }

            router.push(`/${organization}/${work.connectionId}/sql-console`);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Failed to open SQL');
        }
    };

    const investigationWorkspaceHref = useCallback((investigationId: string) => `/${organization}/works/${workId}/investigations/${investigationId}`, [organization, workId]);

    const investigationWorkspaceScope = useCallback(
        (investigationId: string): WorkspaceScope => ({
            type: 'work_investigation',
            workId,
            investigationId,
        }),
        [workId],
    );

    const ensureInvestigationWorkspaceQueryKey = useCallback((investigationId: string) => ['work', workId, 'investigation', investigationId, 'workspace'] as const, [workId]);

    const prepareInvestigationWorkspace = useCallback(
        async (investigation: WorkInvestigation, options?: { awaitTabs?: boolean }) => {
            if (!work) return null;

            const href = investigationWorkspaceHref(investigation.id);
            const workspaceScope = investigationWorkspaceScope(investigation.id);
            router.prefetch(href);

            const ensuredInvestigation = await queryClient.fetchQuery({
                queryKey: ensureInvestigationWorkspaceQueryKey(investigation.id),
                queryFn: () =>
                    executeActionClient<WorkInvestigation>(
                        'work.ensureInvestigationWorkspace',
                        {
                            workId,
                            investigationId: investigation.id,
                        },
                        {
                            currentConnectionId: work.connectionId,
                        },
                    ),
                staleTime: WORKSPACE_PREFETCH_STALE_TIME_MS,
            });

            const tabsPrefetch = queryClient.prefetchQuery({
                queryKey: sqlTabsQueryKey(work.connectionId, workspaceScope),
                queryFn: () => fetchSqlTabs(work.connectionId, workspaceScope),
                staleTime: SQL_TABS_PREFETCH_STALE_TIME_MS,
            });

            if (options?.awaitTabs) {
                await tabsPrefetch;
            }

            return ensuredInvestigation;
        },
        [ensureInvestigationWorkspaceQueryKey, investigationWorkspaceHref, investigationWorkspaceScope, queryClient, router, work, workId],
    );

    const prefetchInvestigationWorkspace = (investigation: WorkInvestigation) => {
        void prepareInvestigationWorkspace(investigation, { awaitTabs: true }).catch(error => {
            console.debug('[WorkDetailPageClient] workspace prefetch failed', error);
        });
    };

    const openInvestigation = async (investigation: WorkInvestigation) => {
        if (!work) return;
        setOpeningInvestigationId(investigation.id);
        try {
            await prepareInvestigationWorkspace(investigation);
            router.push(investigationWorkspaceHref(investigation.id));
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Failed to open Analysis');
        } finally {
            setOpeningInvestigationId(null);
        }
    };

    const startEditingTitle = () => {
        if (!work) return;
        setTitleDraft(work.title);
        setIsEditingTitle(true);
    };

    const cancelEditingTitle = () => {
        if (!work) return;
        setTitleDraft(work.title);
        setIsEditingTitle(false);
    };

    const startEditingGoal = () => {
        if (!work) return;
        setGoal(work.goal);
        setIsEditingGoal(true);
    };

    const cancelEditingGoal = () => {
        if (!work) return;
        setGoal(work.goal);
        setIsEditingGoal(false);
    };

    const submitGoal = () => {
        if (!work) return;
        const nextGoal = goal.trim();
        if (!nextGoal) {
            toast.error('Goal is required');
            return;
        }
        if (nextGoal === work.goal) {
            setGoal(work.goal);
            setIsEditingGoal(false);
            return;
        }
        updateGoalMutation.mutate(nextGoal);
    };

    const submitTitle = () => {
        if (!work) return;
        const nextTitle = titleDraft.trim();
        if (!nextTitle) {
            toast.error('Title is required');
            return;
        }
        if (nextTitle === work.title) {
            setTitleDraft(work.title);
            setIsEditingTitle(false);
            return;
        }
        updateTitleMutation.mutate(nextTitle);
    };

    if (workQuery.isLoading) {
        return (
            <div className="bg-n8 h-screen overflow-auto">
                <div className="container mx-auto mt-6 max-w-6xl px-4 py-6 sm:mt-8 sm:px-6 lg:px-8 2xl:px-4">
                    <Skeleton className="h-32 w-full" />
                    <div className="mt-6 grid gap-4">
                        <Skeleton className="h-28 w-full" />
                        <Skeleton className="h-36 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (!work) {
        return (
            <div className="bg-n8 h-screen overflow-auto">
                <div className="container mx-auto mt-6 max-w-6xl px-4 py-6 sm:mt-8 sm:px-6 lg:px-8 2xl:px-4">
                    <Button variant="ghost" onClick={() => router.push(`/${organization}/works`)}>
                        <ArrowLeft />
                        Work
                    </Button>
                    <div className="mt-8 rounded-lg border border-dashed bg-card p-10 text-center">
                        <h1 className="text-lg font-semibold">Work not found</h1>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-n8 h-screen overflow-x-hidden overflow-y-auto">
            <div className="container mx-auto mt-6 min-w-0 max-w-6xl px-4 py-6 sm:mt-8 sm:px-6 lg:px-8 2xl:px-4">
                <Button variant="ghost" className="mb-5 w-fit" onClick={() => router.push(`/${organization}/works`)}>
                    <ArrowLeft />
                    Work
                </Button>

                <header className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            {isEditingTitle ? (
                                <form
                                    className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xl"
                                    onSubmit={event => {
                                        event.preventDefault();
                                        submitTitle();
                                    }}
                                >
                                    <Input
                                        value={titleDraft}
                                        onChange={event => setTitleDraft(event.target.value)}
                                        onKeyDown={event => {
                                            if (event.key === 'Escape') {
                                                event.preventDefault();
                                                cancelEditingTitle();
                                            }
                                        }}
                                        className="h-9 min-w-0 text-lg font-semibold"
                                        autoFocus
                                        disabled={updateTitleMutation.isPending}
                                    />
                                    <Button
                                        type="submit"
                                        size="icon-sm"
                                        variant="secondary"
                                        disabled={updateTitleMutation.isPending || !titleDraft.trim()}
                                        aria-label="Save title"
                                        title="Save title"
                                    >
                                        {updateTitleMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon-sm"
                                        variant="ghost"
                                        onClick={cancelEditingTitle}
                                        disabled={updateTitleMutation.isPending}
                                        aria-label="Cancel title edit"
                                        title="Cancel title edit"
                                    >
                                        <X />
                                    </Button>
                                </form>
                            ) : (
                                <div className="flex min-w-0 items-center gap-2">
                                    <h1 className="truncate text-2xl font-semibold tracking-tight">{work.title}</h1>
                                    <Button type="button" variant="ghost" size="icon-sm" onClick={startEditingTitle} aria-label="Edit title" title="Edit title">
                                        <Pencil />
                                    </Button>
                                </div>
                            )}
                            <Badge variant="outline" className={workLifecycleDisplayStatusClassName(workLifecycleStatus)}>
                                {workLifecycleDisplayStatusLabel(workLifecycleStatus)}
                            </Badge>
                            <Badge variant="secondary">{work.createdBy === 'agent' ? 'Created by AI' : 'Created by You'}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <Database className="size-4" />
                                Data Source: {connection?.name ?? work.connectionId}
                            </span>
                            <span>Created {formatRelativeTime(work.createdAt)}</span>
                            <span>Last updated {formatRelativeTime(work.updatedAt)}</span>
                        </div>
                    </div>
                    <div className="w-full min-w-0 rounded-lg border bg-card p-4 text-card-foreground shadow-sm sm:w-[22rem]">
                        <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Next step</div>
                        <div className="mt-1 text-sm font-semibold">{nextStep.title}</div>
                        <p className="mt-2 text-sm leading-5 text-muted-foreground">{nextStep.description}</p>
                        <div
                            className={
                                nextStep.secondaryLabel && nextStep.secondaryAction
                                    ? 'mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2'
                                    : 'mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] gap-2'
                            }
                        >
                            <Button
                                size="sm"
                                className="min-w-0 px-3"
                                onClick={nextStep.primaryAction}
                                disabled={isRunRunning ? false : nextStep.disabled || runWorkMutation.isPending}
                            >
                                {runWorkMutation.isPending && !isRunRunning ? (
                                    <Loader2 className="animate-spin" />
                                ) : nextStep.primaryLabel === 'Continue Work' ? (
                                    <Send />
                                ) : (
                                    <Check />
                                )}
                                <span className="min-w-0 truncate">{nextStep.primaryLabel}</span>
                            </Button>
                            {nextStep.secondaryLabel && nextStep.secondaryAction ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="min-w-0 px-3"
                                    onClick={nextStep.secondaryAction}
                                    disabled={runWorkMutation.isPending || (nextStep.secondaryLabel === 'Continue Work' && !goal.trim())}
                                >
                                    {nextStep.secondaryLabel === 'Continue Work' ? <Send /> : <ChevronDown />}
                                    <span className="min-w-0 truncate">{nextStep.secondaryLabel}</span>
                                </Button>
                            ) : null}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon-sm"
                                        aria-label="Run options"
                                        title="Run options"
                                        disabled={isRunRunning || runWorkMutation.isPending}
                                    >
                                        <MoreVertical />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={openLatestRunDetails} disabled={!latestRun}>
                                        <ChevronDown />
                                        View run details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => runWorkMutation.mutate({ mode: 'rerun_from_scratch' })}>
                                        <RefreshCw />
                                        Rerun from scratch
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                            <div>{evidenceSummary}</div>
                            <div className="mt-1">{conclusionEvidenceLine}</div>
                        </div>
                    </div>
                </header>

                <main className="mt-6 grid min-w-0 max-w-full gap-6">
                    <section className="min-w-0 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold">Goal</h2>
                            {isEditingGoal ? (
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="ghost" onClick={cancelEditingGoal} disabled={updateGoalMutation.isPending}>
                                        Cancel
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={submitGoal} disabled={!goal.trim() || updateGoalMutation.isPending}>
                                        {updateGoalMutation.isPending && <Loader2 className="animate-spin" />}
                                        Save
                                    </Button>
                                </div>
                            ) : (
                                <Button size="sm" variant="secondary" onClick={startEditingGoal}>
                                    <Pencil />
                                    Edit
                                </Button>
                            )}
                        </div>
                        {isEditingGoal ? (
                            <Textarea
                                value={goal}
                                onChange={event => setGoal(event.target.value)}
                                onKeyDown={event => {
                                    if (event.key === 'Escape') {
                                        event.preventDefault();
                                        cancelEditingGoal();
                                    }
                                }}
                                placeholder="Describe what Dory should investigate."
                                className="min-h-28 resize-none text-sm"
                                autoFocus
                            />
                        ) : (
                            <p className="whitespace-pre-wrap break-words text-lg font-medium leading-7 text-foreground [overflow-wrap:anywhere]">
                                {goal || 'Describe what Dory should investigate.'}
                            </p>
                        )}
                        {continueOpen ? (
                            <div className="rounded-lg border bg-card p-3">
                                <div className="mb-3">
                                    <div className="text-sm font-medium">What should the agent do next?</div>
                                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                        <span>Exclude abnormal low prices and update the conclusion</span>
                                        <span>Add a histogram of price distribution</span>
                                        <span>Compare price distribution by model type</span>
                                        <span>Check whether zero prices are data entry errors</span>
                                    </div>
                                </div>
                                <Textarea
                                    value={continueInstruction}
                                    onChange={event => setContinueInstruction(event.target.value)}
                                    placeholder="Tell the agent how to continue this work..."
                                    className="min-h-24 resize-none text-sm"
                                    autoFocus
                                />
                                <div className="mt-3 flex justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setContinueOpen(false);
                                            setContinueInstruction('');
                                        }}
                                        disabled={runWorkMutation.isPending}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="button" size="sm" onClick={startContinueWork} disabled={!continueInstruction.trim() || runWorkMutation.isPending || isRunRunning}>
                                        {runWorkMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                                        Send
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </section>

                    <section className="min-w-0 space-y-3">
                        <div className="min-w-0 space-y-2">
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-semibold">Runs</h2>
                                    {visibleRunTimelines.length ? <Badge variant="secondary">{visibleRunTimelines.length}</Badge> : null}
                                </div>
                                {visibleRunTimelines.length ? (
                                    <Button size="sm" variant="secondary" onClick={() => setRunsListOpen(value => !value)}>
                                        <ChevronDown className={runsListOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                        {runsListOpen ? 'Hide details' : 'View details'}
                                    </Button>
                                ) : null}
                            </div>
                            {!latestRun ? <p className="mt-2 text-sm text-muted-foreground">Run the Work to let Dory investigate the goal and record its steps here.</p> : null}
                        </div>

                        {displayedRunTimelines.length ? (
                            <div className="grid min-w-0 gap-3">
                                {displayedRunTimelines.map(runTimeline => (
                                    <WorkRunHistoryCard
                                        key={runTimeline.run.id}
                                        runTimeline={runTimeline}
                                        open={expandedRunIds.has(runTimeline.run.id)}
                                        onOpenChange={() => toggleRunDetails(runTimeline.run.id)}
                                        onCopySql={copySql}
                                        onManualExecute={openSqlInConsole}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </section>

                    <section id="work-analyses" className="scroll-mt-6 min-w-0 space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    <h2 className="text-base font-semibold">Analyses</h2>
                                    <InfoTooltip label="Analysis evidence details">
                                        <div className="space-y-1.5">
                                            <p className="font-medium text-background">{evidenceSummary}</p>
                                            <p>Included analyses support the current conclusion; verified analyses have been human-reviewed.</p>
                                            {unconfirmedAnalysisSummary ? <p>{unconfirmedAnalysisSummary}</p> : null}
                                        </div>
                                    </InfoTooltip>
                                </div>
                            </div>
                            <div className="flex w-full min-w-0 gap-2 sm:w-auto">
                                <Input
                                    value={investigationTitle}
                                    onChange={event => setInvestigationTitle(event.target.value)}
                                    placeholder="Analysis title"
                                    className="min-w-0 sm:w-64"
                                />
                                <Button
                                    onClick={() => createInvestigationMutation.mutate(investigationTitle.trim())}
                                    disabled={!investigationTitle.trim() || createInvestigationMutation.isPending || runWorkMutation.isPending || isRunRunning}
                                >
                                    {createInvestigationMutation.isPending || runWorkMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                                    New
                                </Button>
                            </div>
                        </div>

                        {investigations.length ? (
                            <div className="grid min-w-0 max-w-full gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
                                {investigations.map(investigation => (
                                    <AnalysisCard
                                        key={investigation.id}
                                        investigation={investigation}
                                        latestRun={latestRun}
                                        latestRunEvents={latestRunEvents}
                                        openingInvestigationId={openingInvestigationId}
                                        onOpen={openInvestigation}
                                        onPrefetch={prefetchInvestigationWorkspace}
                                        onDelete={setDeletingInvestigation}
                                        onUpdateAuditStatus={(investigation, auditStatus) => updateAnalysisAuditStatusMutation.mutate({ investigation, auditStatus })}
                                        onRevise={(investigation, instruction) => reviseInvestigationMutation.mutate({ investigation, instruction })}
                                        auditStatusUpdatingId={
                                            updateAnalysisAuditStatusMutation.isPending ? (updateAnalysisAuditStatusMutation.variables?.investigation.id ?? null) : null
                                        }
                                        auditStatusUpdatingTo={
                                            updateAnalysisAuditStatusMutation.isPending ? (updateAnalysisAuditStatusMutation.variables?.auditStatus ?? null) : null
                                        }
                                        revisingInvestigationId={reviseInvestigationMutation.isPending ? (reviseInvestigationMutation.variables?.investigation.id ?? null) : null}
                                    />
                                ))}
                            </div>
                        ) : (
                            <Card className="rounded-lg border-dashed py-0">
                                <CardContent className="p-8 text-center">
                                    <h3 className="text-sm font-semibold">No analyses yet</h3>
                                    <p className="mt-2 text-sm text-muted-foreground">Run the Agent or create an Analysis to start producing findings.</p>
                                </CardContent>
                            </Card>
                        )}
                    </section>

                    <section className="min-w-0 space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-semibold">Conclusion</h2>
                                    {work.conclusionStatus === 'outdated' ? (
                                        <Badge
                                            variant="outline"
                                            className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
                                        >
                                            Outdated
                                        </Badge>
                                    ) : null}
                                </div>
                                {work.conclusionStatus === 'outdated' ? (
                                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">Conclusion may be outdated after Analysis changes.</p>
                                ) : null}
                            </div>
                            {isEditingConclusion ? (
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            const metadata = normalizeConclusionMetadata(work.conclusionMetadata, fallbackMetadata);
                                            setConclusion(work.conclusion ?? '');
                                            setConclusionConfidence(metadata.confidence);
                                            setConclusionCaveatsDraft(metadata.caveats.join('\n'));
                                            setRecommendedNextStepDraft(metadata.recommendedNextStep ?? '');
                                            setIsEditingConclusion(false);
                                        }}
                                        disabled={updateConclusionMutation.isPending}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                            updateConclusionMutation.mutate({
                                                conclusion,
                                                conclusionMetadata: {
                                                    confidence: conclusionConfidence,
                                                    caveats: parseCaveatsDraft(conclusionCaveatsDraft),
                                                    recommendedNextStep: recommendedNextStepDraft.trim() || null,
                                                },
                                            })
                                        }
                                        disabled={updateConclusionMutation.isPending || (Boolean(conclusion.trim()) && !hasIncludedAnalysis)}
                                        title={!hasIncludedAnalysis && conclusion.trim() ? 'Include at least one Analysis before saving a conclusion' : undefined}
                                    >
                                        {updateConclusionMutation.isPending && <Loader2 className="animate-spin" />}
                                        Save
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                            runWorkMutation.mutate({
                                                mode: 'update_conclusion',
                                                userInstruction: 'Update the conclusion from the current included analyses.',
                                            })
                                        }
                                        disabled={!hasIncludedAnalysis || runWorkMutation.isPending || isRunRunning}
                                        title={!hasIncludedAnalysis ? 'Include at least one Analysis before updating a Conclusion' : excludedAnalysisTitle}
                                    >
                                        {runWorkMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                                        Update Conclusion
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={startEditingConclusion}>
                                        Edit
                                    </Button>
                                </div>
                            )}
                        </div>
                        <Card className="min-w-0 overflow-hidden rounded-lg py-0">
                            <CardContent className="min-w-0 p-4">
                                {isEditingConclusion ? (
                                    <div className="grid gap-4">
                                        {!hasIncludedAnalysis ? (
                                            <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">Include at least one Analysis before saving a Conclusion.</p>
                                        ) : null}
                                        <label className="grid gap-2">
                                            <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Conclusion</span>
                                            <Textarea
                                                value={conclusion}
                                                onChange={event => setConclusion(event.target.value)}
                                                placeholder="Write the conclusion in Markdown."
                                                className="min-h-36 resize-none font-mono text-sm"
                                            />
                                        </label>
                                        <div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
                                            <div className="grid gap-2">
                                                <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Confidence</span>
                                                <div className="flex rounded-md border bg-background p-1">
                                                    {(['low', 'medium', 'high'] as WorkConclusionConfidence[]).map(confidence => (
                                                        <Button
                                                            key={confidence}
                                                            type="button"
                                                            size="sm"
                                                            variant={conclusionConfidence === confidence ? 'secondary' : 'ghost'}
                                                            className="h-8 flex-1 capitalize"
                                                            onClick={() => setConclusionConfidence(confidence)}
                                                        >
                                                            {confidence}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                            <label className="grid gap-2">
                                                <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Recommended next step</span>
                                                <Input
                                                    value={recommendedNextStepDraft}
                                                    onChange={event => setRecommendedNextStepDraft(event.target.value)}
                                                    placeholder="What should be verified or refined next?"
                                                />
                                            </label>
                                        </div>
                                        <label className="grid gap-2">
                                            <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Caveats</span>
                                            <Textarea
                                                value={conclusionCaveatsDraft}
                                                onChange={event => setConclusionCaveatsDraft(event.target.value)}
                                                placeholder="One caveat per line."
                                                className="min-h-24 resize-none text-sm"
                                            />
                                        </label>
                                    </div>
                                ) : displayConclusionMarkdown ? (
                                    <div className="grid min-w-0 gap-5 p-2 text-sm">
                                        <div className="min-w-0">
                                            <div className="mb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">Conclusion</div>
                                            <MessageResponse className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] [&_*]:max-w-full [&_code]:break-words [&_pre]:overflow-x-auto">
                                                {displayConclusionMarkdown}
                                            </MessageResponse>
                                        </div>
                                        <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
                                            <div>
                                                <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Based on</div>
                                                <div className="mt-2 text-sm font-medium">
                                                    {includedAnalysisCount} included {pluralizeAnalysis(includedAnalysisCount)}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Confidence</div>
                                                <Badge variant="outline" className={`mt-2 capitalize ${conclusionConfidenceClassName(displayConclusionMetadata.confidence)}`}>
                                                    {displayConclusionMetadata.confidence}
                                                </Badge>
                                            </div>
                                            <div>
                                                <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Recommended next step</div>
                                                <div className="mt-2 text-sm text-muted-foreground">
                                                    {displayConclusionMetadata.recommendedNextStep || 'No specific next step recorded.'}
                                                </div>
                                            </div>
                                        </div>
                                        {displayConclusionMetadata.caveats.length ? (
                                            <div className="border-t pt-4">
                                                <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Caveats</div>
                                                <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                                                    {displayConclusionMetadata.caveats.map((caveat, index) => (
                                                        <li key={`${index}-${caveat}`} className="flex min-w-0 gap-2">
                                                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/70" />
                                                            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{caveat}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="min-h-36 p-2 text-sm text-muted-foreground">
                                        {hasIncludedAnalysis ? 'No included findings yet.' : 'No included analysis yet.'}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </section>
                </main>
            </div>
            <AlertDialog open={Boolean(deletingInvestigation)} onOpenChange={open => !open && setDeletingInvestigation(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Analysis?</AlertDialogTitle>
                        <AlertDialogDescription>This will delete the Analysis, its findings, workspace snapshots, and linked Work SQL tabs.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteInvestigationMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteInvestigationMutation.isPending}
                            onClick={() => deletingInvestigation && deleteInvestigationMutation.mutate(deletingInvestigation)}
                        >
                            {deleteInvestigationMutation.isPending && <Loader2 className="animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function AnalysisCard({
    investigation,
    latestRun,
    latestRunEvents,
    openingInvestigationId,
    auditStatusUpdatingId,
    auditStatusUpdatingTo,
    onOpen,
    onPrefetch,
    onDelete,
    onUpdateAuditStatus,
    onRevise,
    revisingInvestigationId,
}: {
    investigation: WorkInvestigation;
    latestRun: WorkRun | null;
    latestRunEvents: WorkRunEvent[];
    openingInvestigationId: string | null;
    auditStatusUpdatingId: string | null;
    auditStatusUpdatingTo: WorkAnalysisAuditStatus | null;
    onOpen: (investigation: WorkInvestigation) => void;
    onPrefetch: (investigation: WorkInvestigation) => void;
    onDelete: (investigation: WorkInvestigation) => void;
    onUpdateAuditStatus: (investigation: WorkInvestigation, auditStatus: WorkAnalysisAuditStatus) => void;
    onRevise: (investigation: WorkInvestigation, instruction: string) => void;
    revisingInvestigationId: string | null;
}) {
    const effectiveStatus = effectiveInvestigationStatus({
        investigation,
        latestRun,
        latestRunEvents,
    });
    const activity = investigationActivityDisplay({
        investigation,
        latestRunEvents,
    });
    const isRunning = effectiveStatus === 'running';
    const showReviewControls = !isRunning;
    const isAuditStatusUpdating = auditStatusUpdatingId === investigation.id;
    const isRevising = revisingInvestigationId === investigation.id;
    const sqlBackedFinding = hasSqlBackedFinding(investigation);
    const isExcluded = investigation.auditStatus === 'rejected';
    const displayFindings = displayFindingsForInvestigation(investigation, latestRun, latestRunEvents);
    const displayLabel = analysisDisplayLabel(investigation);
    const revisionVersion = investigation.currentRevision?.version ?? 1;
    const revisionInstruction = investigation.currentRevision?.instruction?.trim() || null;
    const includeAuditStatus: WorkAnalysisAuditStatus = investigation.findings.some(finding => finding.createdBy === 'user') ? 'revised' : 'draft';
    const canConfirm = showReviewControls && !isExcluded && investigation.auditStatus !== 'accepted' && investigation.auditStatus !== 'reviewed';
    const canExclude = showReviewControls && !isExcluded;
    const canInclude = showReviewControls && isExcluded;
    const [reviseOpen, setReviseOpen] = useState(false);
    const [reviseInstruction, setReviseInstruction] = useState('');

    const updateAuditStatus = (auditStatus: WorkAnalysisAuditStatus) => {
        onUpdateAuditStatus(investigation, auditStatus);
    };

    const submitRevision = () => {
        const instruction = reviseInstruction.trim();
        if (!instruction) return;
        onRevise(investigation, instruction);
        setReviseInstruction('');
        setReviseOpen(false);
    };

    return (
        <div className="flex min-h-56 min-w-0 max-w-full flex-col overflow-hidden rounded-lg border bg-background p-4">
            <div className="min-w-0">
                <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold">{investigation.title}</h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline" className="border-muted bg-muted/40 text-muted-foreground">
                            v{revisionVersion}
                        </Badge>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${investigation.title}`} title="More actions">
                                    <MoreVertical />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                                {canConfirm ? (
                                    <DropdownMenuItemWithTooltip
                                        tooltip="Mark this Analysis as verified and keep its Findings available for the conclusion. Requires at least one SQL-backed Finding."
                                        disabled={isAuditStatusUpdating}
                                        aria-disabled={!sqlBackedFinding}
                                        className={!sqlBackedFinding ? 'opacity-50' : undefined}
                                        onSelect={event => {
                                            if (isAuditStatusUpdating || !sqlBackedFinding) {
                                                event.preventDefault();
                                                return;
                                            }
                                            updateAuditStatus('accepted');
                                        }}
                                    >
                                        {isAuditStatusUpdating && auditStatusUpdatingTo === 'accepted' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                                        Accept
                                    </DropdownMenuItemWithTooltip>
                                ) : null}
                                {canExclude ? (
                                    <DropdownMenuItemWithTooltip
                                        tooltip="Exclude this Analysis from the conclusion evidence without deleting its history, SQL, or Findings."
                                        disabled={isAuditStatusUpdating}
                                        onSelect={() => {
                                            if (isAuditStatusUpdating) return;
                                            updateAuditStatus('rejected');
                                        }}
                                    >
                                        {isAuditStatusUpdating && auditStatusUpdatingTo === 'rejected' ? <Loader2 className="animate-spin" /> : <X />}
                                        Exclude
                                    </DropdownMenuItemWithTooltip>
                                ) : null}
                                {canInclude ? (
                                    <DropdownMenuItem
                                        disabled={isAuditStatusUpdating}
                                        onSelect={() => {
                                            if (isAuditStatusUpdating) return;
                                            updateAuditStatus(includeAuditStatus);
                                        }}
                                    >
                                        {isAuditStatusUpdating && auditStatusUpdatingTo === includeAuditStatus ? <Loader2 className="animate-spin" /> : <Check />}
                                        Include
                                    </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(investigation)}>
                                    <Trash2 />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
                <div className="mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-2">
                    {showReviewControls ? (
                        <Badge variant="outline" className={analysisDisplayClassName(investigation)}>
                            {investigation.auditStatus === 'accepted' || investigation.auditStatus === 'reviewed' ? <ShieldCheck className="mr-1 size-3" /> : null}
                            {displayLabel}
                        </Badge>
                    ) : null}
                    {isRunning ? (
                        <Badge variant="outline" className={statusClassName(effectiveStatus)}>
                            <Loader2 className="mr-1 size-3 animate-spin" />
                            {statusLabel(effectiveStatus)}
                        </Badge>
                    ) : null}
                    {isRunning ? (
                        <span className="min-w-0 break-words text-xs font-medium text-amber-600 [overflow-wrap:anywhere] dark:text-amber-400">Agent is working</span>
                    ) : null}
                    <span className="inline-flex min-w-0 items-center gap-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        <Clock className="size-3" />
                        {activity.label} {formatRelativeTime(activity.value)}
                    </span>
                </div>
            </div>
            <div className="mt-5 min-w-0 flex-1">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">Findings</div>
                {displayFindings.length ? (
                    <ul className="space-y-2 text-sm leading-6">
                        {displayFindings.map(finding => (
                            <li key={finding.id} className="min-w-0">
                                <div className="flex min-w-0 items-start gap-2">
                                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/70" />
                                    <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{finding.content}</span>
                                    {finding.whyItMatters?.trim() ? (
                                        <span className="mt-0.5 shrink-0">
                                            <InfoTooltip label="Why this finding matters">
                                                <div className="space-y-1.5">
                                                    <p className="font-medium text-background">Why it matters</p>
                                                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{finding.whyItMatters}</p>
                                                </div>
                                            </InfoTooltip>
                                        </span>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">Waiting for findings.</p>
                )}
            </div>
            {reviseOpen ? (
                <div className="mt-4 rounded-lg border bg-card p-3">
                    <Textarea
                        value={reviseInstruction}
                        onChange={event => setReviseInstruction(event.target.value)}
                        placeholder="How should the agent revise this analysis?"
                        className="min-h-20 resize-none text-sm"
                        autoFocus
                    />
                    <div className="mt-3 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setReviseOpen(false);
                                setReviseInstruction('');
                            }}
                            disabled={isRevising}
                        >
                            Cancel
                        </Button>
                        <Button type="button" size="sm" onClick={submitRevision} disabled={!reviseInstruction.trim() || isRevising}>
                            {isRevising ? <Loader2 className="animate-spin" /> : <Send />}
                            Send
                        </Button>
                    </div>
                </div>
            ) : null}
            <div className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div className="min-w-0 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Assets</span>
                    <span className="ml-2">{investigation.sqlAssetCount} SQL</span>
                </div>
                <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
                    {revisionInstruction ? (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button type="button" size="sm" variant="secondary">
                                    <Logs />
                                    Logs
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>Analysis logs</DialogTitle>
                                    <DialogDescription>
                                        v{revisionVersion} update for {investigation.title}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                                    <div className="mb-2 flex items-center gap-2 font-medium">
                                        <Logs className="size-4 text-muted-foreground" />
                                        Changed by instruction
                                    </div>
                                    <p className="whitespace-pre-wrap break-words text-muted-foreground [overflow-wrap:anywhere]">{revisionInstruction}</p>
                                </div>
                            </DialogContent>
                        </Dialog>
                    ) : null}
                    <Button type="button" size="sm" variant="secondary" disabled={!showReviewControls || isExcluded || isRevising} onClick={() => setReviseOpen(value => !value)}>
                        {isRevising ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        Ask to revise
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onPointerEnter={() => onPrefetch(investigation)}
                        onFocus={() => onPrefetch(investigation)}
                        onClick={() => onOpen(investigation)}
                        disabled={openingInvestigationId === investigation.id}
                    >
                        {openingInvestigationId === investigation.id ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
                        Open Workspace
                    </Button>
                </div>
            </div>
        </div>
    );
}

function WorkTimelineEventRow({
    timelineEvent,
    onCopySql,
    onManualExecute,
}: {
    timelineEvent: WorkTimelineEvent;
    onCopySql: (sql: string) => void | Promise<void>;
    onManualExecute: (payload: { sql: string; database: string | null; mode?: SqlResultManualExecutionMode }) => void;
}) {
    const [open, setOpen] = useState(false);
    const event = timelineEvent.runEvent;
    const snapshot = timelineEvent.snapshot;
    const isError = event?.type === 'error';
    const isAgentMessage = event?.type === 'message' && event.role === 'agent';
    const sqlInput = (event ? getSqlInputFromEvent(event) : null) ?? getSqlInputFromSnapshot(snapshot);
    const sqlResult = event ? getSqlResultFromEvent(event) : null;
    const hasDetails = Boolean(sqlInput || sqlResult || snapshot || event?.payload);
    const content = timelineEventContent(timelineEvent);
    const label = timelineEventLabel(timelineEvent);

    return (
        <div className={isError ? 'min-w-0 bg-red-50/70 text-red-900 dark:bg-red-950/20 dark:text-red-200' : 'min-w-0'}>
            <Collapsible open={open} onOpenChange={setOpen}>
                <div className="relative border-b p-4 pl-12 last:border-b-0">
                    <span className={timelineEventDotClassName(timelineEvent)}>
                        <TimelineEventIcon timelineEvent={timelineEvent} className="size-3" />
                    </span>
                    <div className="absolute bottom-0 left-[27px] top-10 w-px bg-border" />
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={isError ? 'destructive' : 'secondary'} className={timelineEventBadgeClassName(timelineEvent)}>
                                    {label}
                                </Badge>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <TimelineEventIcon timelineEvent={timelineEvent} className="size-3" />
                                    {timelineEventActorLabel(timelineEvent)}
                                </span>
                                {hasDetails ? (
                                    <CollapsibleTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
                                            <ChevronDown className={open ? 'size-3 rotate-180 transition-transform' : 'size-3 transition-transform'} />
                                            {open ? 'Hide details' : 'View details'}
                                        </Button>
                                    </CollapsibleTrigger>
                                ) : null}
                            </div>
                            {content ? (
                                <p
                                    className={
                                        isAgentMessage
                                            ? 'mt-3 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]'
                                            : 'mt-3 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]'
                                    }
                                >
                                    {content}
                                </p>
                            ) : null}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground" title={formatAbsoluteTime(timelineEvent.createdAt)}>
                            {formatRelativeTime(timelineEvent.createdAt)}
                        </span>
                    </div>

                    {hasDetails ? (
                        <CollapsibleContent>
                            <div className="mt-4 min-w-0 max-w-full space-y-3 overflow-hidden rounded-lg border bg-background/70 p-3">
                                {sqlInput ? <SqlStatementBlock sql={sqlInput} onCopy={onCopySql} /> : null}
                                {sqlResult ? <SqlResultBody result={sqlResult} onManualExecute={onManualExecute} mode="global" embedded /> : null}
                                {snapshot ? <WorkspaceSnapshotDetails snapshot={snapshot} /> : null}
                                {event?.payload ? <EventPayloadPreview payload={event.payload} /> : null}
                            </div>
                        </CollapsibleContent>
                    ) : null}
                </div>
            </Collapsible>
        </div>
    );
}

function WorkRunHistoryCard({
    runTimeline,
    open,
    onOpenChange,
    onCopySql,
    onManualExecute,
}: {
    runTimeline: WorkRunTimeline;
    open: boolean;
    onOpenChange: () => void;
    onCopySql: (sql: string) => void | Promise<void>;
    onManualExecute: (payload: { sql: string; database: string | null; mode?: SqlResultManualExecutionMode }) => void;
}) {
    const { run, events, timelineEvents } = runTimeline;
    const userSubmission = runUserSubmission(events);
    const runMode = runModeLabel(events);

    return (
        <Card className="overflow-hidden rounded-lg py-0">
            <Collapsible open={open} onOpenChange={onOpenChange}>
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className="flex w-full min-w-0 flex-col gap-3 border-b p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:items-start sm:justify-between"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                                <Badge variant="outline" className={runStatusClassName(run.status)}>
                                    {runStatusLabel(run.status)}
                                </Badge>
                                <Badge variant="secondary">{runMode}</Badge>
                                <span className="text-sm text-muted-foreground">{runCompletionSummary(run)}</span>
                            </div>
                            {userSubmission ? (
                                <div className="mt-2 flex min-w-0 max-w-full items-start gap-2 text-sm text-muted-foreground">
                                    <User className="mt-0.5 size-4 shrink-0" />
                                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{userSubmission}</span>
                                </div>
                            ) : null}
                        </div>
                        <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground">
                            <ChevronDown className={open ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} />
                            {open ? 'Hide details' : 'View details'}
                        </span>
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="p-0">
                        {timelineEvents.length ? (
                            <div className="max-h-[520px] overflow-y-auto">
                                {timelineEvents.map(event => (
                                    <WorkTimelineEventRow key={event.id} timelineEvent={event} onCopySql={onCopySql} onManualExecute={onManualExecute} />
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                                {run.status === 'running' ? 'Waiting for the first Agent event...' : 'No events recorded for this run.'}
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}

function isInternalUpdateConclusionRun(runTimeline: WorkRunTimeline) {
    const payload = runUserPayload(runTimeline.events);
    return payload?.mode === 'update_conclusion' && runUserSubmission(runTimeline.events) === DEFAULT_UPDATE_CONCLUSION_INSTRUCTION;
}

function runCompletionSummary(run: WorkRun) {
    if (run.completedAt) return `Completed ${formatRelativeTime(run.completedAt)}`;
    if (run.status === 'running') return `Started ${formatRelativeTime(run.startedAt)}`;
    return `${runStatusLabel(run.status)} ${formatRelativeTime(run.startedAt)}`;
}

function runModeLabel(events: WorkRunEvent[]) {
    const mode = runUserPayload(events)?.mode;
    if (mode === 'continue_work') return 'Continue Work';
    if (mode === 'revise_analysis') return 'Revise Analysis';
    if (mode === 'update_conclusion') return 'Update Conclusion';
    if (mode === 'rerun_from_scratch') return 'Rerun From Scratch';
    return 'Run';
}

function runUserSubmission(events: WorkRunEvent[]) {
    const payload = runUserPayload(events);
    const instruction = payload?.userInstruction;
    if (typeof instruction === 'string' && instruction.trim()) return instruction.trim();

    const content = events.find(event => event.role === 'user')?.content;
    return typeof content === 'string' && content.trim() ? content.trim() : null;
}

function runUserPayload(events: WorkRunEvent[]) {
    const payload = events.find(event => event.role === 'user')?.payload;
    return isRecord(payload) ? payload : null;
}

function formatAbsoluteTime(value?: string | Date | null) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleString();
}

function timelineEventLabel(timelineEvent: WorkTimelineEvent) {
    if (timelineEvent.snapshot) return 'Human handoff';
    if (timelineEvent.runEvent) return eventTypeLabel(timelineEvent.runEvent.type);
    return 'Timeline event';
}

function timelineEventActorLabel(timelineEvent: WorkTimelineEvent) {
    if (timelineEvent.snapshot) return 'user';
    return timelineEvent.runEvent?.role ?? 'system';
}

function TimelineEventIcon({ timelineEvent, className }: { timelineEvent: WorkTimelineEvent; className?: string }) {
    if (timelineEvent.snapshot) return <User className={className} />;
    if (timelineEvent.runEvent?.type === 'sql_executed') return <Database className={className} />;
    if (timelineEvent.runEvent?.role === 'tool') return <Wrench className={className} />;
    if (timelineEvent.runEvent?.role === 'agent') return <Bot className={className} />;
    if (timelineEvent.runEvent?.role === 'user') return <User className={className} />;
    return <Clock className={className} />;
}

function timelineEventDotClassName(timelineEvent: WorkTimelineEvent) {
    const base = 'absolute left-4 top-4 z-10 flex size-6 items-center justify-center rounded-full border bg-background';
    if (timelineEvent.runEvent?.type === 'error') return `${base} border-red-300 text-red-600 dark:border-red-900/70 dark:text-red-300`;
    if (timelineEvent.snapshot) return `${base} border-sky-300 text-sky-700 dark:border-sky-900/70 dark:text-sky-300`;
    if (timelineEvent.runEvent?.type === 'sql_executed') return `${base} border-emerald-300 text-emerald-700 dark:border-emerald-900/70 dark:text-emerald-300`;
    if (timelineEvent.runEvent?.role === 'agent') return `${base} border-violet-300 text-violet-700 dark:border-violet-900/70 dark:text-violet-300`;
    if (timelineEvent.runEvent?.role === 'tool') return `${base} border-amber-300 text-amber-700 dark:border-amber-900/70 dark:text-amber-300`;
    return `${base} border-border text-muted-foreground`;
}

function timelineEventBadgeClassName(timelineEvent: WorkTimelineEvent) {
    if (timelineEvent.runEvent?.type === 'error') return '';
    if (timelineEvent.snapshot) return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300';
    if (timelineEvent.runEvent?.type === 'sql_executed')
        return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    if (timelineEvent.runEvent?.role === 'agent') return 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300';
    return '';
}

function timelineEventContent(timelineEvent: WorkTimelineEvent) {
    const snapshot = timelineEvent.snapshot;
    if (snapshot) {
        const note = snapshot.humanEdits.userNote?.trim();
        return note ? `Human continued Analysis after workspace changes: ${note}` : 'Human continued Analysis after reviewing or modifying the SQL workspace.';
    }

    const event = timelineEvent.runEvent;
    if (!event) return null;
    return event.content || eventTypeLabel(event.type);
}

function getSqlInputFromSnapshot(snapshot: WorkWorkspaceSnapshot | null) {
    const sql = snapshot?.humanEdits.sql;
    return typeof sql === 'string' && sql.trim() ? sql : null;
}

function WorkspaceSnapshotDetails({ snapshot }: { snapshot: WorkWorkspaceSnapshot }) {
    const summary = snapshot.humanEdits.changeSummary;
    const changedItems = [
        summary?.sqlEdited ? 'SQL edited' : null,
        summary?.resultRefreshed ? 'Result refreshed' : null,
        summary?.chartConfigChanged ? 'Chart changed' : null,
        summary?.selectedRowsChanged ? 'Rows selected' : null,
    ].filter((item): item is string => Boolean(item));

    return (
        <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-md border bg-muted/20 p-3 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline" className="max-w-full truncate">
                    Analysis {snapshot.investigationId}
                </Badge>
                <Badge variant="outline" className="max-w-full truncate">
                    Workspace {snapshot.workspaceId}
                </Badge>
                {changedItems.length ? (
                    changedItems.map(item => (
                        <Badge key={item} variant="secondary">
                            {item}
                        </Badge>
                    ))
                ) : (
                    <span className="text-muted-foreground">No explicit workspace changes recorded.</span>
                )}
            </div>
            {snapshot.humanEdits.resultPreview ? (
                <div>
                    <p className="mb-2 font-medium text-foreground">Result preview</p>
                    <EventPayloadPreview payload={snapshot.humanEdits.resultPreview} />
                </div>
            ) : null}
            {snapshot.humanEdits.chartConfig ? (
                <div>
                    <p className="mb-2 font-medium text-foreground">Chart config</p>
                    <EventPayloadPreview payload={snapshot.humanEdits.chartConfig} />
                </div>
            ) : null}
            {snapshot.humanEdits.selectedRows ? (
                <div>
                    <p className="mb-2 font-medium text-foreground">Selected rows</p>
                    <EventPayloadPreview payload={snapshot.humanEdits.selectedRows} />
                </div>
            ) : null}
        </div>
    );
}

function EventPayloadPreview({ payload }: { payload: Record<string, unknown> }) {
    return (
        <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {JSON.stringify(payload, null, 2)}
        </pre>
    );
}

function getSqlInputFromEvent(event: WorkRunEvent) {
    const payload = event.payload;
    if (!payload || typeof payload !== 'object') return null;
    if (event.type === 'sql_executed') {
        const sql = payload.sql;
        return typeof sql === 'string' && sql.trim() ? sql : null;
    }
    if (payload.toolName !== 'sqlRunner') return null;
    const input = payload.input;
    if (!input || typeof input !== 'object') return null;
    const sql = (input as Record<string, unknown>).sql;
    return typeof sql === 'string' && sql.trim() ? sql : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseSqlResultColumns(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value.map(column => {
        const record = isRecord(column) ? column : {};
        return {
            name: String(record.name ?? ''),
            type: record.type != null ? String(record.type) : null,
        };
    });
}

function parseSqlResultRows(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.filter(isRecord);
}

function getSqlResultFromEvent(event: WorkRunEvent): SqlResultPart | null {
    const payload = event.payload;
    if (!payload || typeof payload !== 'object') return null;
    if (event.type === 'sql_executed') {
        return getSqlResultFromQueryPayload(payload.query);
    }
    if (payload.toolName !== 'sqlRunner') return null;

    const output = payload.output;
    if (!output || typeof output !== 'object') return null;
    const candidate = output as Record<string, unknown>;
    if (candidate.type !== 'sql-result') return null;
    const manualExecution = isRecord(candidate.manualExecution) ? candidate.manualExecution : null;
    const error = isRecord(candidate.error) ? candidate.error : null;

    return {
        type: 'sql-result',
        ok: Boolean(candidate.ok),
        sql: String(candidate.sql ?? ''),
        database: typeof candidate.database === 'string' ? candidate.database : null,
        manualExecution:
            candidate.ok === false && manualExecution?.required
                ? {
                      required: true,
                      reason: 'non-readonly-query',
                  }
                : undefined,
        previewRows: parseSqlResultRows(candidate.previewRows),
        columns: parseSqlResultColumns(candidate.columns),
        rowCount: typeof candidate.rowCount === 'number' ? candidate.rowCount : undefined,
        truncated: Boolean(candidate.truncated),
        durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : undefined,
        error:
            candidate.ok === false && error
                ? {
                      message: String(error.message ?? 'SQL execution failed'),
                  }
                : undefined,
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : undefined,
    };
}

function getSqlResultFromQueryPayload(query: unknown): SqlResultPart | null {
    if (!query || typeof query !== 'object') return null;
    const record = query as Record<string, unknown>;
    const firstSet = Array.isArray(record.queryResultSets) && isRecord(record.queryResultSets[0]) ? record.queryResultSets[0] : undefined;
    if (!firstSet) return null;
    const results = Array.isArray(record.results) ? record.results : [];
    const rows = parseSqlResultRows(results[0]);
    const session = isRecord(record.session) ? record.session : {};

    return {
        type: 'sql-result',
        ok: firstSet.status !== 'error',
        sql: String(firstSet.sqlText ?? session.sqlText ?? ''),
        database: typeof session.database === 'string' ? session.database : null,
        previewRows: rows,
        columns: parseSqlResultColumns(firstSet.columns),
        rowCount: typeof firstSet.rowCount === 'number' ? firstSet.rowCount : undefined,
        truncated: Boolean(firstSet.limited),
        durationMs: typeof firstSet.durationMs === 'number' ? firstSet.durationMs : typeof session.durationMs === 'number' ? session.durationMs : undefined,
        error:
            firstSet.status === 'error'
                ? {
                      message: String(firstSet.errorMessage ?? 'SQL execution failed'),
                  }
                : undefined,
        timestamp: typeof firstSet.finishedAt === 'string' ? firstSet.finishedAt : undefined,
    };
}
