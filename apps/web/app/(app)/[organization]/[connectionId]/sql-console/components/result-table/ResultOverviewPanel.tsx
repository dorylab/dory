'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSetAtom } from 'jotai';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Flame, Info, RefreshCcw, Search, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Button } from '@/registry/new-york-v4/ui/button';
import type { ResultColumnMeta, ResultSetStatsV1 } from '@/lib/client/type';
import { cn } from '@dory/web-utils';
import {
    buildInsights,
    buildInsightRewriteRequest,
    buildStructuredInsightView,
    type InsightAction,
    type InsightItem,
    type InsightLevel,
    type InsightRewriteResponse,
} from '@/lib/client/result-set-insights';
import { fetchInsightRewrite, getCachedInsightRewrite, invalidateCachedInsightRewrite, makeInsightRewriteCacheKey } from '@/lib/client/result-insight-rewrite';
import { useAtomValue } from 'jotai';
import { activeSessionIdAtom, copilotAnalysisRequestAtom, copilotPanelOpenAtom, copilotPanelTabAtom } from '../../sql-console.store';
import { copilotPromptRequestAtom } from './stores/copilot-prompt.atoms';
import { makeActiveSetAtom } from './stores/active-set.atoms';
import { activeTabIdAtom } from '@/shared/stores/app.store';

function Section(props: { title: string; icon: React.ReactNode; children: React.ReactNode; description?: string; action?: React.ReactNode }) {
    const { title, icon, children, description, action } = props;

    return (
        <section className="flex flex-col gap-3">
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                        {icon}
                        <span className="truncate">{title}</span>
                    </div>
                    {action ? <div className="shrink-0">{action}</div> : null}
                </div>
                {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
            </div>
            {children}
        </section>
    );
}

function levelLabel(level: InsightLevel, t: ReturnType<typeof useTranslations>) {
    return t(`Insights.Levels.${level}` as any);
}

function levelClasses(level: InsightLevel) {
    if (level === 'primary') {
        return {
            card: 'border-primary/20 bg-background',
            index: 'bg-primary/10 text-primary',
            label: 'text-primary',
            title: 'text-foreground',
        };
    }

    if (level === 'secondary') {
        return {
            card: 'border-border bg-background hover:border-primary/20',
            index: 'bg-muted text-foreground',
            label: 'text-muted-foreground',
            title: 'text-foreground',
        };
    }

    return {
        card: 'border-border/70 bg-muted/20',
        index: 'bg-background text-muted-foreground',
        label: 'text-muted-foreground',
        title: 'text-muted-foreground',
    };
}

function SecondaryInsightRow(props: { item: InsightItem; onAction: (action: NonNullable<InsightItem['primaryAction']>) => void }) {
    const primaryAction = props.item.primaryAction;

    return (
        <div className="group flex items-start gap-3 py-2">
            <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug text-foreground">{props.item.title}</div>
                {props.item.summary !== props.item.title ? <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{props.item.summary}</div> : null}
            </div>
            {primaryAction ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-[-2px] h-7 shrink-0 px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => props.onAction(primaryAction)}
                >
                    {primaryAction.label}
                </Button>
            ) : null}
        </div>
    );
}

function InsightCard(props: { item: InsightItem; index: number; onAction: (action: NonNullable<InsightItem['primaryAction']>) => void; t: ReturnType<typeof useTranslations> }) {
    const classes = levelClasses(props.item.level);
    const primaryAction = props.item.primaryAction;

    return (
        <div className={`rounded-lg border px-4 py-3 transition-colors ${classes.card}`}>
            <div className="flex items-start gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${classes.index}`}>{props.index + 1}</div>
                <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold leading-snug ${classes.title}`}>{props.item.title}</div>
                    {props.item.summary !== props.item.title ? <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{props.item.summary}</div> : null}
                    {primaryAction ? (
                        <div className="mt-3">
                            <Button
                                variant={props.item.level === 'primary' ? 'default' : 'outline'}
                                size="sm"
                                className={
                                    props.item.level === 'primary'
                                        ? 'h-8 rounded-full px-3 text-xs font-medium shadow-none'
                                        : 'h-7 rounded-full border-border bg-background px-3 text-xs font-medium text-foreground shadow-none hover:border-primary/30 hover:bg-primary/5 hover:text-primary'
                                }
                                onClick={() => props.onAction(primaryAction)}
                            >
                                <span className="truncate">{primaryAction.label}</span>
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function primaryImpacts(summary: string) {
    const parts = summary
        .split(/[。.!?；;]/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 2);

    return parts.length ? parts : [summary];
}

type InsightLoadingScenario = 'generic' | 'logs' | 'metrics' | 'structure';

function hasAnyNeedle(value: string, needles: string[]) {
    return needles.some(needle => value.includes(needle));
}

function resolveInsightLoadingScenario(params: { columns?: ResultColumnMeta[] | null; stats?: ResultSetStatsV1 | null; sqlText?: string | null }): InsightLoadingScenario {
    const columnNames = (params.columns ?? []).map(column => column.name.toLowerCase());
    const joinedColumns = columnNames.join(' ');
    const sql = params.sqlText?.toLowerCase() ?? '';
    const text = `${sql} ${joinedColumns}`;
    const hasLogSignal =
        hasAnyNeedle(text, ['log', 'logs', 'event', 'trace', 'error', 'warn', 'warning', 'exception', 'timeout', 'service', 'severity', 'level', 'message']) ||
        columnNames.some(name => name.endsWith('_ms') || hasAnyNeedle(name, ['duration', 'latency', 'elapsed']));

    if (hasLogSignal) return 'logs';

    const hasMeasure =
        (params.columns ?? []).some(column => column.semanticRole === 'measure' || column.normalizedType === 'number' || column.normalizedType === 'integer') ||
        hasAnyNeedle(text, ['amount', 'price', 'total', 'sum', 'avg', 'count', 'revenue', 'cost', 'score', 'rate']);

    if (hasMeasure) return 'metrics';

    const summary = params.stats?.summary;
    if (summary?.kind === 'unknown' || summary?.kind === 'detail_table' || (params.columns?.length ?? 0) > 0) return 'structure';

    return 'generic';
}

function InsightLoadingState(props: { t: ReturnType<typeof useTranslations>; scenario: InsightLoadingScenario }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [phase, setPhase] = useState(0);
    const checks = ['First', 'Second', 'Third'];
    const activeCheck = checks[activeIndex % checks.length];
    const progress = activeIndex + 1;

    useEffect(() => {
        setActiveIndex(0);
        setPhase(0);
        const primaryTimer = window.setTimeout(() => setPhase(1), 800);
        const secondaryTimer = window.setTimeout(() => setPhase(2), 3800);
        const timer = window.setInterval(() => {
            setActiveIndex(current => Math.min(current + 1, checks.length - 1));
        }, 3300);

        return () => {
            window.clearTimeout(primaryTimer);
            window.clearTimeout(secondaryTimer);
            window.clearInterval(timer);
        };
    }, [props.scenario]);

    return (
        <div className="space-y-3" aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                    <Search className="h-3.5 w-3.5 animate-pulse" />
                </div>
                <span className="min-w-0 flex-1 truncate">{props.t(`Insights.Loading.Scenarios.${props.scenario}.Title` as any)}</span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">({progress}/3)</span>
            </div>

            <div className="rounded-lg border bg-background px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{props.t(`Insights.Loading.Scenarios.${props.scenario}.CheckingLabel` as any)}</span>
                    <span className="text-foreground">-&gt;</span>
                    <span className="font-medium text-foreground">{props.t(`Insights.Loading.Scenarios.${props.scenario}.Checks.${activeCheck}` as any)}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{props.t('Insights.Loading.DurationHint')}</div>

                <div className={cn('mt-4 rounded-lg border px-4 py-4 transition-colors duration-500', phase >= 1 ? 'border-primary/25 bg-primary/5' : 'border-border bg-muted/20')}>
                    <div className="flex items-start gap-3">
                        <Skeleton className={cn('mt-0.5 h-8 w-8 shrink-0 rounded-full', phase >= 1 ? 'bg-primary/20' : 'bg-muted')} />
                        <div className="min-w-0 flex-1">
                            <Skeleton className={cn('h-3 w-20', phase >= 1 ? 'bg-primary/20' : 'bg-muted')} />
                            <Skeleton className={cn('mt-3 h-5 w-4/5 max-w-[360px]', phase >= 1 ? 'bg-primary/25' : 'bg-muted')} />
                            <div className="mt-4 space-y-2">
                                <Skeleton className="h-3 w-11/12 max-w-[420px] bg-muted" />
                                <Skeleton className="h-3 w-3/4 max-w-[320px] bg-muted" />
                            </div>
                            <Skeleton className={cn('mt-4 h-8 w-40 rounded-full', phase >= 1 ? 'bg-primary/25' : 'bg-muted')} />
                        </div>
                    </div>
                </div>

                <div className={cn('mt-4 space-y-2 transition-opacity duration-500', phase >= 2 ? 'opacity-100' : 'opacity-40')}>
                    {[0, 1, 2].map(index => (
                        <div key={index} className="flex items-center gap-3 py-1.5">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/35" />
                            <Skeleton className={cn('h-3 flex-1 bg-muted', index === 1 ? 'max-w-[72%]' : 'max-w-[84%]')} />
                            <Skeleton className="h-6 w-16 shrink-0 rounded-full bg-muted" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function ResultOverviewPanel(props: {
    stats?: ResultSetStatsV1 | null;
    columns?: ResultColumnMeta[] | null;
    rowCount?: number;
    sqlText?: string | null;
    rows?: Array<Record<string, unknown>> | null;
}) {
    const { stats, columns, sqlText, rows } = props;
    const t = useTranslations('SqlConsole');
    const locale = useLocale();
    const setCopilotPanelOpen = useSetAtom(copilotPanelOpenAtom);
    const setCopilotPanelTab = useSetAtom(copilotPanelTabAtom);
    const setCopilotPromptRequest = useSetAtom(copilotPromptRequestAtom);
    const setCopilotAnalysisRequest = useSetAtom(copilotAnalysisRequestAtom);
    const activeTabId = useAtomValue(activeTabIdAtom);
    const activeSessionId = useAtomValue(activeSessionIdAtom);
    const activeSet = useAtomValue(useMemo(() => makeActiveSetAtom(activeTabId, activeSessionId), [activeSessionId, activeTabId]));
    const [rewritten, setRewritten] = useState<InsightRewriteResponse | null>(null);
    const [rewriteSettledKey, setRewriteSettledKey] = useState<string | null>(null);
    const [refreshVersion, setRefreshVersion] = useState(0);

    const rewriteRequest = useMemo(
        () =>
            buildInsightRewriteRequest({
                stats,
                columns,
                sqlText,
                rows,
                locale,
                t: (key, values) => t(key as any, values),
            }),
        [columns, locale, rows, sqlText, stats, t],
    );
    const rewriteCacheKey = useMemo(() => makeInsightRewriteCacheKey(rewriteRequest), [rewriteRequest]);
    const isInsightLoading = !!rewriteCacheKey && rewriteSettledKey !== rewriteCacheKey;
    const insightLoadingScenario = useMemo(() => resolveInsightLoadingScenario({ columns, stats, sqlText }), [columns, sqlText, stats]);

    const insightView = useMemo(
        () =>
            buildInsights(
                {
                    stats,
                    columns,
                    sqlText,
                    rows,
                    locale,
                    t: (key, values) => t(key as any, values),
                },
                rewritten,
            ),
        [columns, locale, rewritten, rows, sqlText, stats, t],
    );
    const structuredInsight = useMemo(
        () =>
            buildStructuredInsightView({
                context: {
                    stats,
                    columns,
                    sqlText,
                    rows,
                    locale,
                    t: (key, values) => t(key as any, values),
                },
                view: insightView,
            }),
        [columns, insightView, locale, rows, sqlText, stats, t],
    );
    const groupedItems = useMemo(() => {
        const mainItem = structuredInsight.decision.items.find(item => item.level === 'primary');

        return {
            primary: structuredInsight.decision.items.filter(item => item.level === 'primary' && item.id !== mainItem?.id),
            secondary: structuredInsight.decision.items.filter(item => item.level === 'secondary'),
            info: structuredInsight.decision.items.filter(item => item.level === 'info'),
        };
    }, [structuredInsight.decision.items]);

    const handleAction = (action: InsightAction) => {
        if (action.kind === 'analysis-suggestion') {
            setCopilotPanelOpen(true);
            setCopilotPanelTab('action');
            setCopilotAnalysisRequest({
                id: `${action.suggestionId}-${Date.now()}`,
                suggestionId: action.suggestionId,
                action: action.action,
                sqlPreview: action.sqlPreview,
                sourceResultRef:
                    activeSessionId && typeof activeSet === 'number' && activeSet >= 0
                        ? {
                              sessionId: activeSessionId,
                              setIndex: activeSet,
                          }
                        : undefined,
            });
            return;
        }

        if (action.kind !== 'copilot-prompt') {
            return;
        }

        setCopilotPanelOpen(true);
        setCopilotPanelTab('ask');
        setCopilotPromptRequest({
            id: `${action.id}-${Date.now()}`,
            prompt: action.prompt,
        });
    };

    const handleRefreshInsights = () => {
        if (!rewriteCacheKey || isInsightLoading) return;

        invalidateCachedInsightRewrite(rewriteCacheKey);
        setRewritten(null);
        setRewriteSettledKey(null);
        setRefreshVersion(current => current + 1);
    };

    useEffect(() => {
        if (!rewriteCacheKey) {
            setRewritten(null);
            setRewriteSettledKey(null);
            return;
        }

        const cached = getCachedInsightRewrite(rewriteCacheKey);
        if (cached !== undefined) {
            setRewritten(cached ?? null);
            setRewriteSettledKey(rewriteCacheKey);
            return;
        }

        setRewriteSettledKey(null);
        let cancelled = false;

        void (async () => {
            const payload = await fetchInsightRewrite(rewriteCacheKey);
            if (!cancelled) {
                setRewritten(payload);
                setRewriteSettledKey(rewriteCacheKey);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [refreshVersion, rewriteCacheKey]);

    return (
        <div className="flex h-full min-h-0 w-full">
            <ScrollArea className="h-full w-full">
                <div className="flex flex-col gap-4 p-4">
                    <Section
                        title={t('Insights.KeyInsights.SectionTitle')}
                        icon={<Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        action={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                                disabled={!rewriteCacheKey || isInsightLoading}
                                aria-label={t('Insights.KeyInsights.Refresh')}
                                title={t('Insights.KeyInsights.Refresh')}
                                onClick={handleRefreshInsights}
                            >
                                <RefreshCcw className={cn('h-3.5 w-3.5', isInsightLoading ? 'animate-spin' : null)} />
                            </Button>
                        }
                    >
                        <div className="space-y-4">
                            {isInsightLoading ? (
                                <InsightLoadingState t={t} scenario={insightLoadingScenario} />
                            ) : structuredInsight.decision.items.length > 0 ? (
                                <>
                                    {structuredInsight.decision.mainFinding ? (
                                        <div className="rounded-lg border bg-background px-4 py-4">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                                    <AlertTriangle className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                        <Flame className="h-3.5 w-3.5 text-primary" />
                                                        <span>{t('Insights.MainFinding.Label')}</span>
                                                    </div>
                                                    <div className="mt-1 text-base font-semibold leading-snug text-foreground">{structuredInsight.decision.mainFinding.title}</div>
                                                    {structuredInsight.decision.mainFinding.summary !== structuredInsight.decision.mainFinding.title ? (
                                                        <div className="mt-3">
                                                            <div className="text-xs font-medium text-muted-foreground">{t('Insights.MainFinding.MeansLabel')}</div>
                                                            <ul className="mt-2 space-y-1.5">
                                                                {primaryImpacts(structuredInsight.decision.mainFinding.summary).map(item => (
                                                                    <li key={item} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                                                                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/50" />
                                                                        <span>{item}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}
                                                    {structuredInsight.decision.mainFinding.action ? (
                                                        <div className="mt-4">
                                                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                                                {t('Insights.MainFinding.PriorityHint')}
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                className="h-8 rounded-full px-3 text-xs font-medium shadow-none"
                                                                onClick={() => handleAction(structuredInsight.decision.mainFinding!.action!)}
                                                            >
                                                                <Search className="mr-1.5 h-3.5 w-3.5" />
                                                                <span className="truncate">{structuredInsight.decision.mainFinding.action.label}</span>
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}

                                    {(['primary', 'secondary', 'info'] as const).map(level => {
                                        const items = groupedItems[level];
                                        if (!items.length) return null;

                                        return (
                                            <div key={level} className={level === 'info' ? 'space-y-1 opacity-70' : 'space-y-1'}>
                                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                    {level === 'secondary' ? <Search className="h-3.5 w-3.5" /> : null}
                                                    {level === 'info' ? <Info className="h-3.5 w-3.5" /> : null}
                                                    <span>{levelLabel(level, t)}</span>
                                                </div>
                                                {level === 'primary'
                                                    ? items.map((item, index) => <InsightCard key={item.id} item={item} index={index} onAction={handleAction} t={t} />)
                                                    : items.map(item => <SecondaryInsightRow key={item.id} item={item} onAction={handleAction} />)}
                                            </div>
                                        );
                                    })}
                                </>
                            ) : (
                                <div className="rounded-lg border bg-background px-4 py-3 text-xs text-muted-foreground">{structuredInsight.narrative}</div>
                            )}
                        </div>
                    </Section>
                </div>
            </ScrollArea>
        </div>
    );
}
