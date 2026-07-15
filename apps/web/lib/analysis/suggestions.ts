import type { InsightAction, InsightDraft, InsightFact, InsightKeyColumns, InsightPattern, RecommendedInsightAction } from '@/lib/client/result-set-insights';
import type { AnalysisSuggestion, AnalysisSuggestionKind, ResultContext } from '@dory/analysis/types';

type AnalysisTranslate = (key: string, values?: Record<string, string | number>) => string;

const SERVICE_NAME_HINTS = ['service', 'source', 'component', 'app', 'application'];
const MESSAGE_NAME_HINTS = ['message', 'msg', 'description', 'event', 'title'];

function looksLike(name: string, hints: string[]) {
    const lower = name.trim().toLowerCase();
    return hints.some(hint => lower === hint || lower.includes(hint));
}

function clampPriority(value: number) {
    return Math.max(1, Math.min(100, value));
}

function suggestionFromInsightAction(action: Extract<RecommendedInsightAction, { kind: 'analysis-suggestion' }>, t: AnalysisTranslate): AnalysisSuggestion {
    const mapping: Record<
        string,
        {
            kind: AnalysisSuggestionKind;
            description: string;
            priority: number;
            goal: string;
            resultTitle: string;
            stepTemplates: AnalysisSuggestion['stepTemplates'];
        }
    > = {
        'view-time-trend': {
            kind: 'trend',
            description: t('Insights.Analysis.SuggestionDescriptions.ViewTimeTrend'),
            priority: 95,
            goal: 'Inspect change over time.',
            resultTitle: 'Time trend',
            stepTemplates: [
                { id: 'inspect-axis', title: t('Insights.Analysis.Steps.InspectAxis') },
                { id: 'bucket-series', title: t('Insights.Analysis.Steps.BucketSeries') },
                { id: 'summarize-trend', title: t('Insights.Analysis.Steps.SummarizeTrend') },
            ],
        },
        'group-by-service': {
            kind: 'drilldown',
            description: t('Insights.Analysis.SuggestionDescriptions.GroupByService'),
            priority: 92,
            goal: 'Locate the source of the anomaly.',
            resultTitle: 'Source breakdown',
            stepTemplates: [
                { id: 'pick-dimension', title: t('Insights.Analysis.Steps.PickSource') },
                { id: 'group-source', title: t('Insights.Analysis.Steps.GroupSource') },
                { id: 'summarize-source', title: t('Insights.Analysis.Steps.SummarizeSource') },
            ],
        },
        'analyze-source': {
            kind: 'drilldown',
            description: t('Insights.Analysis.SuggestionDescriptions.AnalyzeSource'),
            priority: 91,
            goal: 'Find the segment behind the issue.',
            resultTitle: 'Source analysis',
            stepTemplates: [
                { id: 'pick-dimension', title: t('Insights.Analysis.Steps.PickDimension') },
                { id: 'group-source', title: t('Insights.Analysis.Steps.GroupSource') },
                { id: 'summarize-source', title: t('Insights.Analysis.Steps.SummarizeSource') },
            ],
        },
        'top-messages': {
            kind: 'topk',
            description: t('Insights.Analysis.SuggestionDescriptions.TopMessages'),
            priority: 88,
            goal: t('Insights.Analysis.SuggestionGoals.TopMessages'),
            resultTitle: t('Insights.Analysis.ResultTitles.TopMessages'),
            stepTemplates: [
                { id: 'pick-field', title: t('Insights.Analysis.Steps.PickField') },
                { id: 'rank-values', title: t('Insights.Analysis.Steps.RankValues') },
                { id: 'summarize-values', title: t('Insights.Analysis.Steps.SummarizeValues') },
            ],
        },
        'inspect-outliers': {
            kind: 'topk',
            description: t('Insights.Analysis.SuggestionDescriptions.InspectOutliers'),
            priority: 94,
            goal: 'Locate anomalous rows.',
            resultTitle: 'Outlier samples',
            stepTemplates: [
                { id: 'find-peak', title: t('Insights.Analysis.Steps.FindPeak') },
                { id: 'extract-top', title: t('Insights.Analysis.Steps.ExtractTop') },
                { id: 'summarize-outliers', title: t('Insights.Analysis.Steps.SummarizeOutliers') },
            ],
        },
        'view-distribution': {
            kind: 'distribution',
            description: t('Insights.Analysis.SuggestionDescriptions.ViewDistribution'),
            priority: 90,
            goal: 'Understand the distribution shape.',
            resultTitle: 'Distribution',
            stepTemplates: [
                { id: 'scan-distribution', title: t('Insights.Analysis.Steps.ScanDistribution') },
                { id: 'measure-tail', title: t('Insights.Analysis.Steps.MeasureTail') },
                { id: 'summarize-distribution', title: t('Insights.Analysis.Steps.SummarizeDistribution') },
            ],
        },
        'filter-outliers': {
            kind: 'compare',
            description: t('Insights.Analysis.SuggestionDescriptions.FilterOutliers'),
            priority: 76,
            goal: 'Focus on abnormal rows only.',
            resultTitle: 'Filtered anomaly set',
            stepTemplates: [
                { id: 'find-threshold', title: t('Insights.Analysis.Steps.FindThreshold') },
                { id: 'filter-rows', title: t('Insights.Analysis.Steps.FilterRows') },
                { id: 'summarize-filtered', title: t('Insights.Analysis.Steps.SummarizeFiltered') },
            ],
        },
        'pattern-follow-up': {
            kind: 'compare',
            description: t('Insights.Analysis.SuggestionDescriptions.PatternFollowUp'),
            priority: 80,
            goal: 'Continue investigating the strongest pattern.',
            resultTitle: 'Pattern follow-up',
            stepTemplates: [
                { id: 'inspect-pattern', title: t('Insights.Analysis.Steps.InspectPattern') },
                { id: 'compare-segments', title: t('Insights.Analysis.Steps.CompareSegments') },
                { id: 'summarize-pattern', title: t('Insights.Analysis.Steps.SummarizePattern') },
            ],
        },
    };

    const fallback = mapping[action.id] ?? {
        kind: 'drilldown' as const,
        description: t('Insights.Analysis.SuggestionDescriptions.Default'),
        priority: 75,
        goal: t('Insights.Analysis.SuggestionGoals.Default'),
        resultTitle: t('Insights.Analysis.ResultTitles.Default'),
        stepTemplates: [
            { id: 'inspect-result', title: t('Insights.Analysis.Steps.InspectResult') },
            { id: 'run-analysis', title: t('Insights.Analysis.Steps.RunAnalysis') },
            { id: 'summarize-analysis', title: t('Insights.Analysis.Steps.SummarizeAnalysis') },
        ],
    };

    return {
        id: action.suggestionId,
        kind: fallback.kind,
        title: action.label,
        description: fallback.description,
        label: action.label,
        goal: fallback.goal,
        resultTitle: fallback.resultTitle,
        stepTemplates: fallback.stepTemplates,
        followupPolicy: 'chain',
        intent: {
            type: 'generate_sql',
            payload: {
                suggestionId: action.suggestionId,
                action: action.action,
            },
        },
        priority: action.priority === 'primary' ? 100 : fallback.priority,
        isPrimary: action.priority === 'primary',
        action: action.action,
        sqlPreview: action.sqlPreview,
    };
}

function suggestionExists(items: AnalysisSuggestion[], id: string) {
    return items.some(item => item.id === id);
}

function pushSuggestion(items: AnalysisSuggestion[], suggestion: AnalysisSuggestion | null | undefined) {
    if (!suggestion || suggestionExists(items, suggestion.id)) return;
    items.push(suggestion);
}

function topMeasure(keys: InsightKeyColumns) {
    return keys.measures[0] ?? null;
}

function quoted(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
}

function sourceQuery(sqlText?: string) {
    const sql = sqlText?.trim().replace(/;+\s*$/, '');
    return sql ? `(\n${sql}\n) AS analysis_source` : null;
}

function densityScore(value?: 'none' | 'low' | 'medium' | 'high') {
    if (value === 'high') return 4;
    if (value === 'medium') return 3;
    if (value === 'low') return 2;
    return 1;
}

function bestDimensionForNextStep(context: ResultContext) {
    return context.columns
        .filter(column => column.semanticType === 'dimension' || (!column.semanticType && column.dataType.toLowerCase().includes('text')))
        .filter(column => column.informationDensity !== 'none')
        .sort((left, right) => {
            const rightScore = densityScore(right.informationDensity) + (right.topValueShare != null ? 1 - right.topValueShare : 0);
            const leftScore = densityScore(left.informationDensity) + (left.topValueShare != null ? 1 - left.topValueShare : 0);
            return rightScore - leftScore;
        })[0]?.name;
}

function buildGroupBySql(sqlText: string | undefined, column: string) {
    const source = sourceQuery(sqlText);
    if (!source) return null;
    return `SELECT ${quoted(column)} AS ${quoted(column)}, COUNT(*) AS events
FROM ${source}
GROUP BY 1
ORDER BY events DESC, 1 ASC
LIMIT 20`;
}

function buildTimeSql(sqlText: string | undefined, column: string) {
    const source = sourceQuery(sqlText);
    if (!source) return null;
    return `SELECT ${quoted(column)} AS bucket, COUNT(*) AS events
FROM ${source}
GROUP BY 1
ORDER BY 1 ASC
LIMIT 50`;
}

function buildPrimaryAiDrivenSuggestion(params: { resultContext: ResultContext; keyColumns: InsightKeyColumns; t: AnalysisTranslate }): AnalysisSuggestion | null {
    const { resultContext, keyColumns, t } = params;
    const sourceSql = resultContext.sqlText;
    const lowDensityColumns = resultContext.columns.filter(column => column.informationDensity === 'none' || column.topValueShare === 1);
    const analysisState = resultContext.rowCount <= 0 ? 'invalid' : lowDensityColumns.length > 0 ? 'weak' : 'good';

    if (analysisState === 'invalid') {
        return {
            id: 'ai-decision-invalid',
            kind: 'compare',
            title: t('Insights.Analysis.AiDecision.InvalidTitle'),
            description: t('Insights.Analysis.AiDecision.InvalidDescription'),
            label: t('Insights.Analysis.AiDecision.AdjustQueryLabel'),
            goal: t('Insights.Analysis.AiDecision.InvalidGoal'),
            resultTitle: t('Insights.Analysis.AiDecision.InvalidResultTitle'),
            stepTemplates: [
                { id: 'inspect-profile', title: t('Insights.Analysis.Steps.InspectProfile') },
                { id: 'adjust-query', title: t('Insights.Analysis.Steps.AdjustQuery') },
                { id: 'summarize-limitation', title: t('Insights.Analysis.Steps.SummarizeLimitation') },
            ],
            followupPolicy: 'chain',
            intent: { type: 'generate_sql', payload: { suggestionId: 'ai-decision-invalid' } },
            priority: 100,
            isPrimary: true,
            requiresConfirmation: true,
            reason: t('Insights.Analysis.AiDecision.InvalidReason'),
            analysisState,
        };
    }

    const actorLike = resultContext.columns.find(column => /actor|user|login|author|owner/i.test(column.name) && column.informationDensity !== 'none')?.name;
    const repoLike = resultContext.columns.find(column => /repo|repository|project/i.test(column.name) && column.informationDensity !== 'none')?.name;
    const preferredDimension = actorLike ?? repoLike ?? bestDimensionForNextStep(resultContext);
    const preferredTime = keyColumns.time ?? resultContext.columns.find(column => column.semanticType === 'time')?.name;
    const nextColumn = preferredDimension ?? preferredTime;
    const sqlPreview = preferredDimension ? buildGroupBySql(sourceSql, preferredDimension) : preferredTime ? buildTimeSql(sourceSql, preferredTime) : null;

    if (!nextColumn || !sqlPreview) {
        return null;
    }

    const lowDensityColumn = lowDensityColumns[0];
    return {
        id: 'ai-primary-next-step',
        kind: preferredDimension ? 'drilldown' : 'trend',
        title: preferredDimension
            ? t('Insights.Analysis.AiDecision.GroupByTitle', { column: preferredDimension })
            : t('Insights.Analysis.AiDecision.TimeTrendTitle', { column: preferredTime ?? '' }),
        description:
            analysisState === 'weak' && lowDensityColumn
                ? t('Insights.Analysis.AiDecision.LowDensityDescription', { column: lowDensityColumn.name })
                : t('Insights.Analysis.AiDecision.NextAxisDescription', { column: nextColumn }),
        label: preferredDimension
            ? t('Insights.Analysis.AiDecision.GroupByLabel', { column: preferredDimension })
            : t('Insights.Analysis.AiDecision.TimeTrendLabel', { column: preferredTime ?? '' }),
        goal: preferredDimension
            ? t('Insights.Analysis.AiDecision.GroupByGoal', { column: preferredDimension })
            : t('Insights.Analysis.AiDecision.TimeTrendGoal', { column: preferredTime ?? '' }),
        resultTitle: preferredDimension
            ? t('Insights.Analysis.AiDecision.GroupByResultTitle', { column: preferredDimension })
            : t('Insights.Analysis.AiDecision.TimeTrendResultTitle', { column: preferredTime ?? '' }),
        stepTemplates: [
            { id: 'inspect-profile', title: t('Insights.Analysis.Steps.InspectProfile') },
            { id: 'run-next-sql', title: t('Insights.Analysis.Steps.RunNextSql') },
            { id: 'summarize-next-step', title: t('Insights.Analysis.Steps.SummarizeNextStep') },
        ],
        followupPolicy: 'chain',
        intent: {
            type: 'generate_sql',
            payload: {
                suggestionId: 'ai-primary-next-step',
                targetColumn: nextColumn,
                analysisState,
            },
        },
        priority: 100,
        isPrimary: true,
        requiresConfirmation: true,
        reason:
            analysisState === 'weak' && lowDensityColumn
                ? t('Insights.Analysis.AiDecision.LowDensityReason', {
                      column: lowDensityColumn.name,
                      density: lowDensityColumn.informationDensity ?? 'none',
                      share: lowDensityColumn.topValueShare ?? 1,
                  })
                : t('Insights.Analysis.AiDecision.NextAxisReason', { column: nextColumn }),
        sqlPreview,
        analysisState,
    };
}

export function buildAnalysisSuggestions(params: {
    resultContext: ResultContext;
    draft?: InsightDraft | null;
    recommendedActions?: RecommendedInsightAction[] | InsightAction[] | null;
    recommendedActionsOnly?: boolean;
    t: AnalysisTranslate;
}): AnalysisSuggestion[] {
    const suggestions: AnalysisSuggestion[] = [];
    const draft = params.draft ?? null;
    const recommendedActions = params.recommendedActions ?? [];
    const { t } = params;

    for (const action of recommendedActions) {
        if (action.kind !== 'analysis-suggestion') continue;
        const actionPriority = 'priority' in action && (action.priority === 'primary' || action.priority === 'secondary') ? action.priority : 'secondary';
        pushSuggestion(
            suggestions,
            suggestionFromInsightAction(
                {
                    ...action,
                    priority: actionPriority,
                } as Extract<RecommendedInsightAction, { kind: 'analysis-suggestion' }>,
                t,
            ),
        );
    }

    if (params.recommendedActionsOnly && suggestions.length > 0) {
        return suggestions
            .sort((left, right) => right.priority - left.priority)
            .slice(0, 5)
            .map((item, index) => ({
                ...item,
                priority: clampPriority(item.priority),
                isPrimary: index === 0 ? true : item.isPrimary,
            }));
    }

    const keyColumns = draft?.keyColumns;
    if (!keyColumns) {
        return suggestions.sort((left, right) => right.priority - left.priority).slice(0, 5);
    }

    const riskSignal = draft.facts.some(fact => fact.type === 'risk_signal');
    const serviceColumn = keyColumns.dimensions.find(name => looksLike(name, SERVICE_NAME_HINTS));
    const messageColumn = keyColumns.dimensions.find(name => looksLike(name, MESSAGE_NAME_HINTS));
    const primaryMeasure = topMeasure(keyColumns);
    pushSuggestion(
        suggestions,
        buildPrimaryAiDrivenSuggestion({
            resultContext: params.resultContext,
            keyColumns,
            t,
        }),
    );

    if (keyColumns.time && riskSignal && !suggestionExists(suggestions, 'time-error-trend')) {
        suggestions.push({
            id: 'view-time-trend',
            kind: 'trend',
            title: t('Insights.Analysis.SuggestionTitles.ViewTimeTrend', { column: keyColumns.time }),
            description: t('Insights.Analysis.SuggestionDescriptions.ViewTimeTrendWithColumn', { column: keyColumns.time }),
            label: t('Insights.Analysis.Actions.ViewTimeTrend'),
            goal: t('Insights.Analysis.SuggestionGoals.ViewTimeTrend'),
            resultTitle: t('Insights.Analysis.ResultTitles.TimeTrend'),
            stepTemplates: [
                { id: 'inspect-axis', title: t('Insights.Analysis.Steps.InspectAxis') },
                { id: 'bucket-series', title: t('Insights.Analysis.Steps.BucketSeries') },
                { id: 'summarize-trend', title: t('Insights.Analysis.Steps.SummarizeTrend') },
            ],
            followupPolicy: 'chain',
            intent: {
                type: 'generate_sql',
                payload: {
                    suggestionId: 'view-time-trend',
                    timeColumn: keyColumns.time,
                },
            },
            priority: 95,
        });
    }

    if (serviceColumn && !suggestionExists(suggestions, 'group-by-service')) {
        suggestions.push({
            id: 'group-by-service',
            kind: 'drilldown',
            title: t('Insights.Analysis.SuggestionTitles.GroupByColumn', { column: serviceColumn }),
            description: t('Insights.Analysis.SuggestionDescriptions.GroupByColumn', { column: serviceColumn }),
            label: t('Insights.Analysis.Actions.GroupByColumn', { column: serviceColumn }),
            goal: t('Insights.Analysis.SuggestionGoals.GroupByService'),
            resultTitle: t('Insights.Analysis.ResultTitles.SourceBreakdown'),
            stepTemplates: [
                { id: 'pick-dimension', title: t('Insights.Analysis.Steps.PickSource') },
                { id: 'group-source', title: t('Insights.Analysis.Steps.GroupSource') },
                { id: 'summarize-source', title: t('Insights.Analysis.Steps.SummarizeSource') },
            ],
            followupPolicy: 'chain',
            intent: {
                type: 'generate_sql',
                payload: {
                    suggestionId: 'group-by-service',
                    dimensionColumn: serviceColumn,
                },
            },
            priority: 92,
        });
    }

    if (riskSignal && !suggestionExists(suggestions, 'analyze-source')) {
        suggestions.push({
            id: 'analyze-source',
            kind: 'drilldown',
            title: t('Insights.Analysis.SuggestionTitles.AnalyzeSource'),
            description: t('Insights.Analysis.SuggestionDescriptions.AnalyzeSource'),
            label: t('Insights.Analysis.Actions.AnalyzeSource'),
            goal: t('Insights.Analysis.SuggestionGoals.AnalyzeSource'),
            resultTitle: t('Insights.Analysis.ResultTitles.SourceAnalysis'),
            stepTemplates: [
                { id: 'pick-dimension', title: t('Insights.Analysis.Steps.PickDimension') },
                { id: 'group-source', title: t('Insights.Analysis.Steps.GroupSource') },
                { id: 'summarize-source', title: t('Insights.Analysis.Steps.SummarizeSource') },
            ],
            followupPolicy: 'chain',
            intent: {
                type: 'generate_sql',
                payload: {
                    suggestionId: 'analyze-source',
                },
            },
            priority: 89,
        });
    }

    if (messageColumn && !suggestionExists(suggestions, 'top-messages')) {
        suggestions.push({
            id: 'top-messages',
            kind: 'topk',
            title: t('Insights.Analysis.SuggestionTitles.TopMessages', { column: messageColumn }),
            description: t('Insights.Analysis.SuggestionDescriptions.TopMessagesWithColumn', { column: messageColumn }),
            label: t('Insights.Analysis.Actions.TopMessages'),
            goal: t('Insights.Analysis.SuggestionGoals.TopMessages'),
            resultTitle: t('Insights.Analysis.ResultTitles.TopMessages'),
            stepTemplates: [
                { id: 'pick-field', title: t('Insights.Analysis.Steps.PickField') },
                { id: 'rank-values', title: t('Insights.Analysis.Steps.RankValues') },
                { id: 'summarize-values', title: t('Insights.Analysis.Steps.SummarizeValues') },
            ],
            followupPolicy: 'chain',
            intent: {
                type: 'generate_sql',
                payload: {
                    suggestionId: 'top-messages',
                    dimensionColumn: messageColumn,
                },
            },
            priority: 88,
        });
    }

    if (primaryMeasure && !suggestionExists(suggestions, 'measure-distribution')) {
        suggestions.push({
            id: 'view-distribution',
            kind: 'distribution',
            title: t('Insights.Analysis.SuggestionTitles.ViewDistribution', { column: primaryMeasure }),
            description: t('Insights.Analysis.SuggestionDescriptions.ViewDistributionWithColumn', { column: primaryMeasure }),
            label: t('Insights.Analysis.Actions.ViewDistribution'),
            goal: t('Insights.Analysis.SuggestionGoals.ViewDistribution'),
            resultTitle: t('Insights.Analysis.ResultTitles.Distribution'),
            stepTemplates: [
                { id: 'scan-distribution', title: t('Insights.Analysis.Steps.ScanDistribution') },
                { id: 'measure-tail', title: t('Insights.Analysis.Steps.MeasureTail') },
                { id: 'summarize-distribution', title: t('Insights.Analysis.Steps.SummarizeDistribution') },
            ],
            followupPolicy: 'chain',
            intent: {
                type: 'generate_sql',
                payload: {
                    suggestionId: 'view-distribution',
                    measureColumn: primaryMeasure,
                },
            },
            priority: 76,
        });
    }

    if (primaryMeasure && !suggestionExists(suggestions, 'inspect-outliers')) {
        suggestions.push({
            id: 'inspect-outliers',
            kind: 'topk',
            title: t('Insights.Analysis.SuggestionTitles.InspectOutliers', { column: primaryMeasure }),
            description: t('Insights.Analysis.SuggestionDescriptions.InspectOutliersWithColumn', { column: primaryMeasure }),
            label: t('Insights.Analysis.Actions.InspectOutliers'),
            goal: t('Insights.Analysis.SuggestionGoals.InspectOutliers'),
            resultTitle: t('Insights.Analysis.ResultTitles.OutlierSamples'),
            stepTemplates: [
                { id: 'find-peak', title: t('Insights.Analysis.Steps.FindPeak') },
                { id: 'extract-top', title: t('Insights.Analysis.Steps.ExtractTop') },
                { id: 'summarize-outliers', title: t('Insights.Analysis.Steps.SummarizeOutliers') },
            ],
            followupPolicy: 'chain',
            intent: {
                type: 'generate_sql',
                payload: {
                    suggestionId: 'inspect-outliers',
                    measureColumn: primaryMeasure,
                },
            },
            priority: 94,
        });
    }

    const dimensionColumn = keyColumns.dimensions.find(name => name !== serviceColumn && name !== messageColumn);
    if (dimensionColumn && primaryMeasure && !suggestionExists(suggestions, 'filter-outliers')) {
        suggestions.push({
            id: 'filter-outliers',
            kind: 'compare',
            title: t('Insights.Analysis.SuggestionTitles.FilterOutliers', { column: primaryMeasure }),
            description: t('Insights.Analysis.SuggestionDescriptions.FilterOutliersWithColumn', { column: dimensionColumn }),
            label: t('Insights.Analysis.Actions.FilterOutliers'),
            goal: t('Insights.Analysis.SuggestionGoals.FilterOutliers'),
            resultTitle: t('Insights.Analysis.ResultTitles.FilteredAnomalySet'),
            stepTemplates: [
                { id: 'find-threshold', title: t('Insights.Analysis.Steps.FindThreshold') },
                { id: 'filter-rows', title: t('Insights.Analysis.Steps.FilterRows') },
                { id: 'summarize-filtered', title: t('Insights.Analysis.Steps.SummarizeFiltered') },
            ],
            followupPolicy: 'chain',
            intent: {
                type: 'generate_sql',
                payload: {
                    suggestionId: 'filter-outliers',
                    dimensionColumn,
                    measureColumn: primaryMeasure,
                },
            },
            priority: 70,
        });
    }

    return suggestions
        .sort((left, right) => right.priority - left.priority)
        .slice(0, 5)
        .map((item, index) => ({
            ...item,
            priority: clampPriority(item.priority),
            isPrimary: index === 0 ? true : item.isPrimary,
        }));
}

export function buildAnalysisSummaryFromDraft(draft: InsightDraft, findings: string[]): string {
    return [draft.quickSummary.title, draft.quickSummary.subtitle, ...findings].filter(Boolean).join(' ');
}

export function topRiskFact(facts: InsightFact[]) {
    return facts.find(fact => fact.type === 'risk_signal') ?? null;
}

export function topPattern(patterns: InsightPattern[]) {
    return patterns[0] ?? null;
}
