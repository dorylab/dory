import { randomUUID } from 'node:crypto';
import type { BaseConnection } from '@dory/drivers/core';
import { translate } from '@dory/i18n/translate';
import { routing, type Locale } from '@dory/i18n/routing';
import type {
    AnalysisOutcome,
    AnalysisQueryPayload,
    AnalysisSession,
    AnalysisStep,
    AnalysisSuggestion,
    AnalysisStepTemplate,
    ResultContext,
    ResultContextColumn,
    RunAnalysisRequest,
    RunAnalysisResponse,
} from '@dory/analysis/types';
import { actionToSql, type ResultAction } from '@dory/analysis/core/result-actions';

type AnalysisSummaryCore = Omit<AnalysisOutcome, 'artifacts' | 'followups'>;

async function enhanceAnalysisSummary(params: {
    locale: Locale;
    organizationId?: string | null;
    userId?: string | null;
    sql: string;
    suggestion: {
        title: string;
        goal: string;
        description: string;
        resultTitle: string;
    };
    context: ResultContext;
    columns: Array<{ name: string; type: string | null }>;
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    fallback: AnalysisSummaryCore;
}): Promise<AnalysisSummaryCore> {
    try {
        const { enhanceAnalysisSummaryWithAi } = await import('./ai-summary');
        return enhanceAnalysisSummaryWithAi(params);
    } catch {
        return params.fallback;
    }
}

function nowIso() {
    return new Date().toISOString();
}

function parseSqlOp(sql: string): string {
    const first = sql.trim().split(/\s+/)[0]?.toUpperCase() || 'SQL';
    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(first)) return first;
    if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(first)) return 'DDL';
    if (['BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'].includes(first)) return 'TXN';
    return first;
}

function makeTitle(sql: string): string {
    const preview = sql.trim().slice(0, 48).replace(/\s+/g, ' ');
    return `${parseSqlOp(sql)}: ${preview}`;
}

function quoted(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
}

function sourceQuery(sqlText?: string) {
    if (!sqlText?.trim()) {
        throw new Error('Analysis requires a source SQL statement.');
    }

    return `(\n${sqlText.trim().replace(/;+\s*$/, '')}\n) AS analysis_source`;
}

function bySemantic(columns: ResultContextColumn[], semanticType: ResultContextColumn['semanticType']) {
    return columns.find(column => column.semanticType === semanticType)?.name ?? null;
}

function byName(columns: ResultContextColumn[], patterns: string[]) {
    return (
        columns.find(column => {
            const lower = column.name.toLowerCase();
            return patterns.some(pattern => lower === pattern || lower.includes(pattern));
        })?.name ?? null
    );
}

function detectDimensionColumn(context: ResultContext, kind: 'service' | 'message' | 'any') {
    if (kind === 'service') {
        return byName(context.columns, ['service', 'source', 'component', 'app', 'application']);
    }
    if (kind === 'message') {
        return byName(context.columns, ['message', 'msg', 'description', 'event', 'title']);
    }
    return context.columns.find(column => column.semanticType === 'dimension')?.name ?? null;
}

function detectMeasureColumn(context: ResultContext) {
    return bySemantic(context.columns, 'measure') ?? byName(context.columns, ['duration', 'latency', 'count', 'total', 'value', 'rows']);
}

function detectTimeColumn(context: ResultContext) {
    return bySemantic(context.columns, 'time') ?? byName(context.columns, ['time', 'timestamp', 'created_at', 'date', 'hour', 'day']);
}

function limitClause(limit = 20) {
    return `LIMIT ${limit}`;
}

function isReadOnlySelect(sql: string) {
    const trimmed = sql.trim();
    if (!/^select\b/i.test(trimmed)) return false;
    const withoutTrailingSemicolon = trimmed.replace(/;+\s*$/, '');
    if (withoutTrailingSemicolon.includes(';')) return false;
    return !/\b(insert|update|delete|merge|replace|create|alter|drop|truncate|grant|revoke|copy|call|execute)\b/i.test(withoutTrailingSemicolon);
}

function formatValue(value: unknown) {
    if (value == null) return '—';
    if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

function compactRowFacts(row: Record<string, unknown>, columns: Array<{ name: string }>, limit = 4) {
    return columns
        .slice(0, limit)
        .map(column => `${column.name}: ${formatValue(row[column.name])}`)
        .filter(item => !item.endsWith(': —'));
}

type AnalysisTranslator = (key: string, values?: Record<string, unknown>) => string;

function createAnalysisTranslator(locale: Locale): AnalysisTranslator {
    return (key, values) => translate(locale, `SqlConsole.Insights.Analysis.${key}`, values);
}

function summarizeActionResult(params: { action: ResultAction; title: string; rows: Array<Record<string, unknown>>; columns: Array<{ name: string }>; t: AnalysisTranslator }) {
    const { action, title, rows, columns } = params;
    const { t } = params;
    const first = rows[0] ?? {};
    const facts = compactRowFacts(first, columns);

    if (!rows.length) {
        return {
            analysisState: 'invalid' as const,
            limitations: [t('Server.ActionResultNoRowsLimitation')],
            summary: t('Server.ActionResultNoRowsSummary'),
            headline: title,
            keyFindings: [t('Server.NoUsableRowsFinding')],
            recordHighlights: [],
            sections: [],
        };
    }

    if (action.type === 'distribution') {
        const column = action.params.column;
        const minValue = formatValue(first.min_value);
        const avgValue = formatValue(first.avg_value);
        const maxValue = formatValue(first.max_value);
        const totalRows = formatValue(first.total_rows);

        return {
            analysisState: 'good' as const,
            limitations: [],
            summary: t('Server.ActionDistributionSummary', { column, minValue, maxValue, avgValue }),
            headline: t('Server.ActionDistributionHeadline', { column }),
            keyFindings: [
                t('Server.ActionDistributionAverageFinding', { column, avgValue }),
                t('Server.ActionDistributionRangeFinding', { column, minValue, maxValue }),
                t('Server.ActionDistributionRowsFinding', { totalRows }),
            ],
            recordHighlights: [
                { label: 'min', value: minValue },
                { label: 'avg', value: avgValue },
                { label: 'max', value: maxValue },
            ],
            sections: [
                {
                    id: 'distribution-statistics',
                    title: t('Server.DistributionStatisticsTitle'),
                    items: facts.length ? facts : [`min_value: ${minValue}`, `avg_value: ${avgValue}`, `max_value: ${maxValue}`],
                },
            ],
        };
    }

    const firstLabelColumn = columns.find(column => !/count|total|sum|avg|min|max|value/i.test(column.name))?.name ?? columns[0]?.name;
    const firstValueColumn = columns.find(column => column.name !== firstLabelColumn)?.name ?? firstLabelColumn;
    const leader = firstLabelColumn ? formatValue(first[firstLabelColumn]) : t('Server.FirstItem');
    const leaderValue = firstValueColumn ? formatValue(first[firstValueColumn]) : null;

    return {
        analysisState: 'good' as const,
        limitations: [],
        summary: leaderValue ? t('Server.ActionLeaderSummaryWithValue', { title, leader, value: leaderValue }) : t('Server.ActionLeaderSummary', { title, leader }),
        headline: t('Server.ActionCompletedHeadline', { title }),
        keyFindings: facts.length ? facts : [leaderValue ? `${leader}: ${leaderValue}` : leader],
        recordHighlights: rows.slice(0, 5).map((row, index) => ({
            label: firstLabelColumn ? formatValue(row[firstLabelColumn]) : `row_${index + 1}`,
            value: firstValueColumn ? formatValue(row[firstValueColumn]) : formatValue(row[columns[0]?.name ?? 'value']),
        })),
        sections: [
            {
                id: 'action-result-values',
                title: t('Server.ResultDetailsTitle'),
                items: rows
                    .slice(0, 5)
                    .map(row => compactRowFacts(row, columns).join(' · '))
                    .filter(Boolean),
            },
        ],
    };
}

function genericAiDrivenSpec(params: { suggestionId: string; sqlPreview: string; context: ResultContext; locale: Locale }): AnalysisSpec {
    const t = createAnalysisTranslator(params.locale);
    const title = params.suggestionId === 'ai-primary-next-step' ? t('Server.ContinueRecommendedAnalysis') : t('Server.RunRecommendedAnalysis');
    return {
        suggestionId: params.suggestionId,
        title,
        kind: 'drilldown',
        goal: t('Server.RecommendedAnalysisGoal'),
        description: t('Server.RecommendedAnalysisDescription'),
        resultTitle: title,
        stepTemplates: [
            { id: 'inspect-profile', title: t('Server.Steps.InspectProfile') },
            { id: 'run-next-sql', title: t('Server.Steps.RunNextSql') },
            { id: 'summarize-next-step', title: t('Server.Steps.SummarizeNextStep') },
        ],
        buildSql() {
            if (!isReadOnlySelect(params.sqlPreview)) {
                throw new Error(t('Server.ReadOnlySelectError'));
            }
            return params.sqlPreview.trim().replace(/;+\s*$/, '');
        },
        summarize({ rows, columns }) {
            const firstNumeric = columns.find(column => /count|total|events|rows|value/i.test(column.name))?.name ?? columns.find(column => column.name !== columns[0]?.name)?.name;
            const firstLabel = columns.find(column => column.name !== firstNumeric)?.name ?? columns[0]?.name;
            const first = rows[0] ?? {};
            const leader = firstLabel ? formatValue(first[firstLabel]) : t('Server.FirstGroup');
            const leaderValue = firstNumeric ? formatValue(first[firstNumeric]) : null;
            return {
                analysisState: rows.length ? 'good' : 'invalid',
                limitations: rows.length ? [] : [t('Server.NoRecommendedRowsLimitation')],
                summary: rows.length
                    ? leaderValue
                        ? t('Server.LeaderSummaryWithValue', { leader, value: leaderValue })
                        : t('Server.LeaderSummary', { leader })
                    : t('Server.NoRecommendedRowsSummary'),
                headline: rows.length ? t('Server.LeaderHeadline', { leader }) : t('Server.NoRecommendedRowsHeadline'),
                keyFindings: rows.length
                    ? [
                          leaderValue ? t('Server.LeaderFindingWithValue', { leader, value: leaderValue }) : t('Server.LeaderFinding', { leader }),
                          t('Server.CandidateGroupsFinding', { count: formatValue(rows.length) }),
                      ]
                    : [t('Server.NoUsableRowsFinding')],
                recordHighlights: rows.slice(0, 5).map((row, index) => ({
                    label: firstLabel ? formatValue(row[firstLabel]) : `row_${index + 1}`,
                    value: firstNumeric ? formatValue(row[firstNumeric]) : formatValue(row[columns[0]?.name ?? 'value']),
                })),
                sections: [
                    {
                        id: 'recommended-sql-result',
                        title: t('Server.RecommendedSqlResultTitle'),
                        items: rows.slice(0, 5).map((row, index) => {
                            const label = firstLabel ? formatValue(row[firstLabel]) : `row_${index + 1}`;
                            const value = firstNumeric ? formatValue(row[firstNumeric]) : '';
                            return value ? `${label} → ${value}` : label;
                        }),
                    },
                ],
            };
        },
        buildFollowups,
    };
}

type AnalysisSpec = {
    suggestionId: string;
    title: string;
    kind: AnalysisSuggestion['kind'];
    goal: string;
    description: string;
    resultTitle: string;
    stepTemplates: AnalysisStepTemplate[];
    buildSql: (context: ResultContext) => string;
    summarize: (params: {
        rows: Array<Record<string, unknown>>;
        columns: Array<{ name: string; type: string | null }>;
        context: ResultContext;
    }) => Omit<AnalysisOutcome, 'artifacts' | 'followups'>;
    buildFollowups: (params: {
        context: ResultContext;
        resultRef: { sessionId: string; setIndex: number };
        columns: Array<{ name: string; type: string | null }>;
        rowCount: number;
        sqlText: string;
        locale: Locale;
    }) => AnalysisSuggestion[];
};

function buildSuggestion(params: {
    id: string;
    kind: AnalysisSuggestion['kind'];
    title: string;
    description: string;
    label: string;
    goal: string;
    resultTitle: string;
    stepTemplates: AnalysisStepTemplate[];
    priority: number;
}) {
    return {
        id: params.id,
        kind: params.kind,
        title: params.title,
        description: params.description,
        label: params.label,
        goal: params.goal,
        resultTitle: params.resultTitle,
        stepTemplates: params.stepTemplates,
        followupPolicy: 'chain' as const,
        intent: { type: 'generate_sql' as const, payload: { suggestionId: params.id } },
        priority: params.priority,
    };
}

function buildFollowups(params: {
    context: ResultContext;
    resultRef: { sessionId: string; setIndex: number };
    columns: Array<{ name: string; type: string | null }>;
    rowCount: number;
    sqlText: string;
    locale: Locale;
}): AnalysisSuggestion[] {
    const t = createAnalysisTranslator(params.locale);
    const nextContext: ResultContext = {
        resultSetId: params.resultRef,
        sqlText: params.sqlText,
        databaseName: params.context.databaseName ?? null,
        tableRefs: [],
        rowCount: params.rowCount,
        columns: params.columns.map(column => ({
            name: column.name,
            dataType: column.type ?? 'unknown',
            semanticType: /time|date/i.test(column.name)
                ? 'time'
                : /service|source|message|dimension|group/i.test(column.name)
                  ? 'dimension'
                  : /duration|count|total|avg|max|min|value|rows/i.test(column.name)
                    ? 'measure'
                    : 'dimension',
        })),
    };

    const timeColumn = detectTimeColumn(nextContext);
    const measureColumn = detectMeasureColumn(nextContext);
    const serviceColumn = detectDimensionColumn(nextContext, 'service');
    const suggestions: AnalysisSuggestion[] = [];

    if (serviceColumn) {
        suggestions.push(
            buildSuggestion({
                id: 'group-by-service',
                kind: 'drilldown',
                title: `Break down by ${serviceColumn}`,
                description: `Identify which ${serviceColumn} contributes most.`,
                label: t('Actions.GroupByColumn', { column: serviceColumn }),
                goal: t('SuggestionGoals.GroupByService'),
                resultTitle: t('ResultTitles.SourceBreakdown'),
                stepTemplates: [
                    { id: 'pick-dimension', title: t('Steps.PickDimension') },
                    { id: 'group-source', title: t('Steps.GroupSource') },
                    { id: 'summarize-source', title: t('Steps.SummarizeSource') },
                ],
                priority: 92,
            }),
        );
    }

    if (timeColumn) {
        suggestions.push(
            buildSuggestion({
                id: 'view-time-trend',
                kind: 'trend',
                title: `Trend ${timeColumn} over time`,
                description: `Track whether the pattern changes over ${timeColumn}.`,
                label: t('Actions.ViewTimeTrend'),
                goal: t('SuggestionGoals.ViewTimeTrend'),
                resultTitle: t('ResultTitles.TimeTrend'),
                stepTemplates: [
                    { id: 'inspect-axis', title: t('Steps.InspectAxis') },
                    { id: 'bucket-series', title: t('Steps.BucketSeries') },
                    { id: 'summarize-trend', title: t('Steps.SummarizeTrend') },
                ],
                priority: 88,
            }),
        );
    }

    if (measureColumn) {
        suggestions.push(
            buildSuggestion({
                id: 'view-distribution',
                kind: 'distribution',
                title: `Profile ${measureColumn} distribution`,
                description: `Quantify the spread and tail of ${measureColumn}.`,
                label: t('Actions.ViewDistribution'),
                goal: t('SuggestionGoals.ViewDistribution'),
                resultTitle: t('ResultTitles.Distribution'),
                stepTemplates: [
                    { id: 'scan-distribution', title: t('Steps.ScanDistribution') },
                    { id: 'measure-tail', title: t('Steps.MeasureTail') },
                    { id: 'summarize-distribution', title: t('Steps.SummarizeDistribution') },
                ],
                priority: 85,
            }),
        );
    }

    if (measureColumn) {
        suggestions.push(
            buildSuggestion({
                id: 'filter-outliers',
                kind: 'compare',
                title: `Filter high ${measureColumn} rows`,
                description: t('SuggestionDescriptions.FilterOutliersWithColumn', { column: measureColumn }),
                label: t('Actions.FilterOutliers'),
                goal: t('SuggestionGoals.FilterOutliers'),
                resultTitle: t('ResultTitles.FilteredAnomalySet'),
                stepTemplates: [
                    { id: 'find-threshold', title: t('Steps.FindThreshold') },
                    { id: 'filter-rows', title: t('Steps.FilterRows') },
                    { id: 'summarize-filtered', title: t('Steps.SummarizeFiltered') },
                ],
                priority: 82,
            }),
        );
    }

    return suggestions.filter((item, index) => suggestions.findIndex(candidate => candidate.id === item.id) === index).slice(0, 4);
}

function distributionSummary(rows: Array<Record<string, unknown>>, columns: Array<{ name: string; type: string | null }>) {
    const labels = columns.map(column => column.name);
    const first = rows[0] ?? {};
    return labels.slice(0, 3).map(label => `${label}: ${formatValue(first[label])}`);
}

function specsForContext(context: ResultContext, locale: Locale): Record<string, AnalysisSpec> {
    const t = createAnalysisTranslator(locale);
    const source = sourceQuery(context.sqlText);
    const timeColumn = detectTimeColumn(context);
    const serviceColumn = detectDimensionColumn(context, 'service');
    const messageColumn = detectDimensionColumn(context, 'message');
    const dimensionColumn = detectDimensionColumn(context, 'any');
    const measureColumn = detectMeasureColumn(context);

    return {
        'inspect-outliers': {
            suggestionId: 'inspect-outliers',
            title: t('Actions.InspectOutliers'),
            kind: 'topk',
            goal: t('SuggestionGoals.InspectOutliers'),
            description: t('SuggestionDescriptions.InspectOutliers'),
            resultTitle: t('ResultTitles.OutlierSamples'),
            stepTemplates: [
                { id: 'find-peak', title: t('Steps.FindPeak') },
                { id: 'extract-top', title: t('Steps.ExtractTop') },
                { id: 'summarize-outliers', title: t('Steps.SummarizeOutliers') },
            ],
            buildSql() {
                if (!measureColumn) {
                    throw new Error('Cannot inspect outliers without a measure column.');
                }
                return `SELECT *
FROM ${source}
ORDER BY ${quoted(measureColumn)} DESC
${limitClause(20)}`;
            },
            summarize({ rows, columns }) {
                const measure = measureColumn ?? columns[0]?.name;
                const maxValue = measure ? rows[0]?.[measure] : null;
                return {
                    summary: rows.length
                        ? `Found ${formatValue(maxValue)} as the highest observed value and collected the top anomalous rows.`
                        : 'No anomalous rows were returned.',
                    headline: measure ? t('Server.OutlierHeadlineWithValue', { value: formatValue(maxValue) }) : t('Server.OutlierHeadline'),
                    keyFindings: [
                        measure ? t('Server.OutlierMaxFinding', { column: measure, value: formatValue(maxValue) }) : t('Server.OutlierRowsReturnedFinding'),
                        rows.length ? t('Server.OutlierRowsCountFinding', { count: formatValue(rows.length) }) : t('Server.NoOutlierRowsFinding'),
                    ],
                    recordHighlights: rows.slice(0, 5).map((row, index) => ({
                        label: String(row[serviceColumn ?? dimensionColumn ?? columns[0]?.name ?? `row_${index + 1}`] ?? `row_${index + 1}`),
                        value: measure ? formatValue(row[measure]) : formatValue(row[columns[0]?.name ?? 'value']),
                        note: columns
                            .slice(0, 2)
                            .map(column => `${column.name}: ${formatValue(row[column.name])}`)
                            .join(' · '),
                    })),
                    sections: [
                        {
                            id: 'top-records',
                            title: 'Top records',
                            items: rows.slice(0, 3).map((row, index) => {
                                const label = row[serviceColumn ?? dimensionColumn ?? columns[0]?.name ?? `row_${index + 1}`];
                                const value = measure ? row[measure] : row[columns[0]?.name ?? 'value'];
                                return `${formatValue(label)} → ${formatValue(value)}`;
                            }),
                        },
                    ],
                };
            },
            buildFollowups: buildFollowups,
        },
        'analyze-source': {
            suggestionId: 'analyze-source',
            title: t('Actions.AnalyzeSource'),
            kind: 'drilldown',
            goal: t('SuggestionGoals.AnalyzeSource'),
            description: t('SuggestionDescriptions.AnalyzeSource'),
            resultTitle: t('ResultTitles.SourceAnalysis'),
            stepTemplates: [
                { id: 'pick-dimension', title: t('Steps.PickDimension') },
                { id: 'group-source', title: t('Steps.GroupSource') },
                { id: 'summarize-source', title: t('Steps.SummarizeSource') },
            ],
            buildSql() {
                const column = serviceColumn ?? dimensionColumn;
                if (!column) {
                    throw new Error('Cannot analyze source without a dimension column.');
                }
                return `SELECT ${quoted(column)} AS dimension, COUNT(*) AS total_rows
FROM ${source}
GROUP BY 1
ORDER BY total_rows DESC, 1 ASC
${limitClause(20)}`;
            },
            summarize({ rows }) {
                const first = rows[0] ?? {};
                return {
                    summary: rows.length
                        ? `The leading segment is ${formatValue(first.dimension)} with ${formatValue(first.total_rows)} rows.`
                        : 'No source segments were returned.',
                    headline: rows.length ? t('Server.SourceHeadline', { value: formatValue(first.dimension) }) : t('Server.NoSourceHeadline'),
                    keyFindings: rows.length
                        ? [
                              t('Server.SourceTopFinding', { value: formatValue(first.dimension), count: formatValue(first.total_rows) }),
                              t('Server.SourceGroupsFinding', { count: formatValue(rows.length) }),
                          ]
                        : [t('Server.NoSourceGroupsFinding')],
                    recordHighlights: rows.slice(0, 5).map(row => ({
                        label: formatValue(row.dimension),
                        value: formatValue(row.total_rows),
                    })),
                    sections: [
                        {
                            id: 'source-ranking',
                            title: 'Source ranking',
                            items: rows.slice(0, 5).map(row => `${formatValue(row.dimension)} → ${formatValue(row.total_rows)}`),
                        },
                    ],
                };
            },
            buildFollowups: buildFollowups,
        },
        'group-by-service': {
            suggestionId: 'group-by-service',
            title: t('Actions.GroupByService', { column: 'service' }),
            kind: 'drilldown',
            goal: t('SuggestionGoals.GroupByService'),
            description: t('SuggestionDescriptions.GroupByService'),
            resultTitle: t('ResultTitles.SourceBreakdown'),
            stepTemplates: [
                { id: 'pick-dimension', title: t('Steps.PickDimension') },
                { id: 'group-source', title: t('Steps.GroupSource') },
                { id: 'summarize-source', title: t('Steps.SummarizeSource') },
            ],
            buildSql() {
                const column = serviceColumn ?? dimensionColumn;
                if (!column) {
                    throw new Error('Cannot group by service without a service or dimension column.');
                }
                return `SELECT ${quoted(column)} AS service, COUNT(*) AS total_rows
FROM ${source}
GROUP BY 1
ORDER BY total_rows DESC, 1 ASC
${limitClause(20)}`;
            },
            summarize({ rows }) {
                const first = rows[0] ?? {};
                return {
                    summary: rows.length
                        ? `${formatValue(first.service)} is the largest service bucket with ${formatValue(first.total_rows)} rows.`
                        : 'No service groups were returned.',
                    headline: rows.length ? t('Server.ServiceHeadline', { value: formatValue(first.service) }) : t('Server.NoServiceHeadline'),
                    keyFindings: rows.length
                        ? [t('Server.ServiceTopFinding', { value: formatValue(first.service) }), t('Server.ServiceSortedFinding', { count: formatValue(rows.length) })]
                        : [t('Server.NoServiceGroupsFinding')],
                    recordHighlights: rows.slice(0, 5).map(row => ({
                        label: formatValue(row.service),
                        value: formatValue(row.total_rows),
                    })),
                    sections: [
                        {
                            id: 'service-ranking',
                            title: 'Service ranking',
                            items: rows.slice(0, 5).map(row => `${formatValue(row.service)} → ${formatValue(row.total_rows)}`),
                        },
                    ],
                };
            },
            buildFollowups: buildFollowups,
        },
        'view-distribution': {
            suggestionId: 'view-distribution',
            title: t('Actions.ViewDistribution'),
            kind: 'distribution',
            goal: t('SuggestionGoals.ViewDistribution'),
            description: t('SuggestionDescriptions.ViewDistribution'),
            resultTitle: t('ResultTitles.Distribution'),
            stepTemplates: [
                { id: 'scan-distribution', title: t('Steps.ScanDistribution') },
                { id: 'measure-tail', title: t('Steps.MeasureTail') },
                { id: 'summarize-distribution', title: t('Steps.SummarizeDistribution') },
            ],
            buildSql() {
                if (!measureColumn) {
                    throw new Error('Cannot inspect a distribution without a measure column.');
                }
                return `SELECT
    MIN(${quoted(measureColumn)}) AS min_value,
    AVG(${quoted(measureColumn)}) AS avg_value,
    MAX(${quoted(measureColumn)}) AS max_value,
    COUNT(*) AS total_rows
FROM ${source}`;
            },
            summarize({ rows, columns }) {
                const row = rows[0] ?? {};
                return {
                    summary: rows.length
                        ? `The measure spans from ${formatValue(row.min_value)} to ${formatValue(row.max_value)} with an average of ${formatValue(row.avg_value)}.`
                        : 'No distribution summary was returned.',
                    headline: rows.length ? t('Server.DistributionHeadline', { value: formatValue(row.max_value) }) : t('Server.NoDistributionHeadline'),
                    keyFindings: rows.length
                        ? [
                              t('Server.DistributionRangeFinding', { maxValue: formatValue(row.max_value), minValue: formatValue(row.min_value) }),
                              t('Server.DistributionAverageFinding', { avgValue: formatValue(row.avg_value) }),
                          ]
                        : [t('Server.NoDistributionSummaryFinding')],
                    recordHighlights: rows.length
                        ? [
                              { label: 'Min', value: formatValue(row.min_value) },
                              { label: 'Avg', value: formatValue(row.avg_value) },
                              { label: 'Max', value: formatValue(row.max_value) },
                              { label: 'Rows', value: formatValue(row.total_rows) },
                          ]
                        : [],
                    sections: [
                        {
                            id: 'distribution-summary',
                            title: 'Distribution summary',
                            items: distributionSummary(rows, columns),
                        },
                    ],
                };
            },
            buildFollowups: buildFollowups,
        },
        'view-time-trend': {
            suggestionId: 'view-time-trend',
            title: t('Actions.ViewTimeTrend'),
            kind: 'trend',
            goal: t('SuggestionGoals.ViewTimeTrend'),
            description: t('SuggestionDescriptions.ViewTimeTrend'),
            resultTitle: t('ResultTitles.TimeTrend'),
            stepTemplates: [
                { id: 'inspect-axis', title: t('Steps.InspectAxis') },
                { id: 'bucket-series', title: t('Steps.BucketSeries') },
                { id: 'summarize-trend', title: t('Steps.SummarizeTrend') },
            ],
            buildSql() {
                const bucketColumn = timeColumn ?? dimensionColumn;
                if (!bucketColumn) {
                    throw new Error('Cannot build a time trend without a time or dimension column.');
                }
                return `SELECT ${quoted(bucketColumn)} AS bucket, COUNT(*) AS total_rows
FROM ${source}
GROUP BY 1
ORDER BY 1 ASC
${limitClause(50)}`;
            },
            summarize({ rows }) {
                const first = rows[0] ?? {};
                const last = rows[rows.length - 1] ?? {};
                return {
                    summary: rows.length
                        ? `The series spans ${rows.length} buckets, from ${formatValue(first.bucket)} to ${formatValue(last.bucket)}.`
                        : 'No time buckets were returned.',
                    headline: rows.length ? t('Server.TrendHeadline', { count: formatValue(rows.length) }) : t('Server.NoTrendHeadline'),
                    keyFindings: rows.length
                        ? [
                              t('Server.TrendBucketRangeFinding', { first: formatValue(first.bucket), last: formatValue(last.bucket) }),
                              t('Server.TrendPointCountFinding', { count: formatValue(rows.length) }),
                          ]
                        : [t('Server.NoTrendDataFinding')],
                    recordHighlights: rows.slice(0, 5).map(row => ({
                        label: formatValue(row.bucket),
                        value: formatValue(row.total_rows),
                    })),
                    sections: [
                        {
                            id: 'trend-points',
                            title: 'Trend points',
                            items: rows.slice(0, 5).map(row => `${formatValue(row.bucket)} → ${formatValue(row.total_rows)}`),
                        },
                    ],
                };
            },
            buildFollowups: buildFollowups,
        },
        'filter-outliers': {
            suggestionId: 'filter-outliers',
            title: t('Actions.FilterOutliers'),
            kind: 'compare',
            goal: t('SuggestionGoals.FilterOutliers'),
            description: t('SuggestionDescriptions.FilterOutliers'),
            resultTitle: t('ResultTitles.FilteredAnomalySet'),
            stepTemplates: [
                { id: 'find-threshold', title: t('Steps.FindThreshold') },
                { id: 'filter-rows', title: t('Steps.FilterRows') },
                { id: 'summarize-filtered', title: t('Steps.SummarizeFiltered') },
            ],
            buildSql() {
                if (!measureColumn) {
                    throw new Error('Cannot filter outliers without a measure column.');
                }
                return `SELECT *
FROM ${source}
WHERE ${quoted(measureColumn)} = (
    SELECT MAX(${quoted(measureColumn)}) FROM ${source}
)
${limitClause(50)}`;
            },
            summarize({ rows, columns }) {
                return {
                    summary: rows.length ? `Filtered ${rows.length} rows into the anomaly-focused subset.` : 'No rows matched the anomaly filter.',
                    headline: rows.length ? t('Server.FilteredHeadline', { count: formatValue(rows.length) }) : t('Server.NoFilteredHeadline'),
                    keyFindings: rows.length
                        ? [t('Server.FilteredReadyFinding'), t('Server.FilteredSizeFinding', { count: formatValue(rows.length) })]
                        : [t('Server.NoFilteredRowsFinding')],
                    recordHighlights: rows.slice(0, 5).map((row, index) => ({
                        label: formatValue(row[columns[0]?.name ?? `row_${index + 1}`]),
                        value: formatValue(row[measureColumn ?? columns[1]?.name ?? columns[0]?.name ?? 'value']),
                    })),
                    sections: [
                        {
                            id: 'filtered-preview',
                            title: 'Filtered preview',
                            items: rows.slice(0, 3).map(
                                (row, index) =>
                                    columns
                                        .slice(0, 3)
                                        .map(column => `${column.name}: ${formatValue(row[column.name])}`)
                                        .join(' · ') || `row_${index + 1}`,
                            ),
                        },
                    ],
                };
            },
            buildFollowups: buildFollowups,
        },
        'top-messages': {
            suggestionId: 'top-messages',
            title: t('Actions.TopMessages'),
            kind: 'topk',
            goal: t('SuggestionGoals.TopMessages'),
            description: t('SuggestionDescriptions.TopMessages'),
            resultTitle: t('ResultTitles.TopMessages'),
            stepTemplates: [
                { id: 'pick-field', title: t('Steps.PickField') },
                { id: 'rank-values', title: t('Steps.RankValues') },
                { id: 'summarize-values', title: t('Steps.SummarizeValues') },
            ],
            buildSql() {
                const column = messageColumn ?? dimensionColumn;
                if (!column) {
                    throw new Error('Cannot inspect top values without a text or dimension column.');
                }
                return `SELECT ${quoted(column)} AS value, COUNT(*) AS total_rows
FROM ${source}
GROUP BY 1
ORDER BY total_rows DESC, 1 ASC
${limitClause(20)}`;
            },
            summarize({ rows }) {
                const first = rows[0] ?? {};
                const totalRows = rows.reduce((sum, row) => {
                    const value = typeof row.total_rows === 'number' ? row.total_rows : Number(row.total_rows);
                    return Number.isFinite(value) ? sum + value : sum;
                }, 0);
                const firstCount = typeof first.total_rows === 'number' ? first.total_rows : Number(first.total_rows);
                const firstShare = totalRows > 0 && Number.isFinite(firstCount) ? firstCount / totalRows : null;
                const singleValue = rows.length === 1 || firstShare === 1;
                if (rows.length && singleValue) {
                    return {
                        analysisState: 'weak',
                        limitations: [t('Server.LowVarianceLimitation', { value: formatValue(first.value) })],
                        summary: t('Server.LowVarianceSummary', {
                            count: formatValue(first.total_rows),
                            total: formatValue(totalRows || first.total_rows),
                            value: formatValue(first.value),
                        }),
                        headline: t('Server.LowVarianceHeadline'),
                        keyFindings: [
                            t('Server.LowVarianceAllRowsFinding', { value: formatValue(first.value) }),
                            t('Server.LowVarianceNotUsefulFinding'),
                            t('Server.LowVarianceNextStepFinding'),
                        ],
                        recordHighlights: rows.slice(0, 5).map(row => ({
                            label: formatValue(row.value),
                            value: formatValue(row.total_rows),
                        })),
                        sections: [
                            {
                                id: 'low-variance-profile',
                                title: 'Profile fact',
                                items: [`${formatValue(first.value)} → ${formatValue(first.total_rows)}`, 'Top value share: 100%'],
                            },
                        ],
                    };
                }
                return {
                    analysisState: rows.length ? 'good' : 'invalid',
                    limitations: rows.length ? [] : [t('Server.NoTopValuesLimitation')],
                    summary: rows.length ? `${formatValue(first.value)} is the most common value with ${formatValue(first.total_rows)} rows.` : 'No top values were returned.',
                    headline: rows.length ? t('Server.TopValueHeadline', { value: formatValue(first.value) }) : t('Server.NoTopValuesHeadline'),
                    keyFindings: rows.length
                        ? [t('Server.TopValueFinding', { value: formatValue(first.value) }), t('Server.TopValueCountFinding', { count: formatValue(first.total_rows) })]
                        : [t('Server.NoTopValuesFinding')],
                    recordHighlights: rows.slice(0, 5).map(row => ({
                        label: formatValue(row.value),
                        value: formatValue(row.total_rows),
                    })),
                    sections: [
                        {
                            id: 'top-values',
                            title: 'Top values',
                            items: rows.slice(0, 5).map(row => `${formatValue(row.value)} → ${formatValue(row.total_rows)}`),
                        },
                    ],
                };
            },
            buildFollowups: buildFollowups,
        },
        'pattern-follow-up': {
            suggestionId: 'pattern-follow-up',
            title: t('Actions.PatternFollowUp'),
            kind: 'compare',
            goal: t('SuggestionGoals.Default'),
            description: t('SuggestionDescriptions.PatternFollowUp'),
            resultTitle: t('ResultTitles.Default'),
            stepTemplates: [
                { id: 'inspect-pattern', title: t('Steps.InspectPattern') },
                { id: 'compare-segments', title: t('Steps.CompareSegments') },
                { id: 'summarize-pattern', title: t('Steps.SummarizePattern') },
            ],
            buildSql() {
                const column = dimensionColumn;
                if (!column) {
                    throw new Error('Cannot continue the pattern analysis without a dimension column.');
                }
                if (measureColumn) {
                    return `SELECT ${quoted(column)} AS dimension, AVG(${quoted(measureColumn)}) AS avg_value, MAX(${quoted(measureColumn)}) AS max_value, COUNT(*) AS total_rows
FROM ${source}
GROUP BY 1
ORDER BY total_rows DESC, 1 ASC
${limitClause(20)}`;
                }
                return `SELECT ${quoted(column)} AS dimension, COUNT(*) AS total_rows
FROM ${source}
GROUP BY 1
ORDER BY total_rows DESC, 1 ASC
${limitClause(20)}`;
            },
            summarize({ rows }) {
                const first = rows[0] ?? {};
                return {
                    summary: rows.length ? `The strongest segment remains ${formatValue(first.dimension)}.` : 'No pattern comparison rows were returned.',
                    headline: rows.length ? t('Server.PatternHeadline', { value: formatValue(first.dimension) }) : t('Server.NoPatternHeadline'),
                    keyFindings: rows.length ? [t('Server.PatternComparedFinding')] : [t('Server.NoPatternRowsFinding')],
                    recordHighlights: rows.slice(0, 5).map(row => ({
                        label: formatValue(row.dimension),
                        value: formatValue(row.max_value ?? row.total_rows),
                        note: row.avg_value != null ? `avg ${formatValue(row.avg_value)}` : undefined,
                    })),
                    sections: [
                        {
                            id: 'pattern-ranking',
                            title: 'Pattern comparison',
                            items: rows.slice(0, 5).map(row => `${formatValue(row.dimension)} → ${formatValue(row.max_value ?? row.total_rows)}`),
                        },
                    ],
                };
            },
            buildFollowups: buildFollowups,
        },
    };
}

function buildSteps(stepTemplates: AnalysisStepTemplate[], startedAt: string): AnalysisStep[] {
    return stepTemplates.map((step, index) => ({
        id: step.id,
        type: index === stepTemplates.length - 1 ? 'summary' : index === stepTemplates.length - 2 ? 'execution' : 'reasoning',
        title: step.title,
        status: index === 0 ? 'running' : 'pending',
        startedAt: index === 0 ? startedAt : undefined,
    }));
}

function markStep(steps: AnalysisStep[], stepId: string, patch: Partial<AnalysisStep>) {
    return steps.map(step => (step.id === stepId ? { ...step, ...patch } : step));
}

export async function runAnalysis(params: {
    request: RunAnalysisRequest;
    connection: BaseConnection;
    connectionId: string;
    tabId?: string | null;
    locale?: Locale;
    organizationId?: string | null;
    userId?: string | null;
}): Promise<RunAnalysisResponse> {
    const locale = params.locale ?? routing.defaultLocale;
    const t = createAnalysisTranslator(locale);
    const analysisRunId = randomUUID();
    const resultSessionId = randomUUID();
    const createdAt = nowIso();
    const specs = specsForContext(params.request.context.resultContext, locale);
    const sqlPreview = params.request.trigger.sqlPreview?.trim();
    const spec = sqlPreview
        ? genericAiDrivenSpec({
              suggestionId: params.request.trigger.suggestionId,
              sqlPreview,
              context: params.request.context.resultContext,
              locale,
          })
        : params.request.trigger.action
          ? {
                ...(specs[params.request.trigger.suggestionId] ?? {
                    suggestionId: params.request.trigger.suggestionId,
                    title: params.request.trigger.action.title,
                    kind: 'drilldown' as const,
                    goal: params.request.trigger.action.title,
                    description: params.request.trigger.action.title,
                    resultTitle: params.request.trigger.action.title,
                    stepTemplates: [
                        { id: 'inspect-profile', title: t('Server.Steps.InspectProfile') },
                        { id: 'run-next-sql', title: t('Server.Steps.RunNextSql') },
                        { id: 'summarize-next-step', title: t('Server.Steps.SummarizeNextStep') },
                    ],
                    summarize({ rows, columns }) {
                        return summarizeActionResult({
                            action: params.request.trigger.action!,
                            title: params.request.trigger.action!.title,
                            rows,
                            columns,
                            t,
                        });
                    },
                    buildFollowups,
                }),
                suggestionId: params.request.trigger.suggestionId,
                title: params.request.trigger.action.title,
                resultTitle: params.request.trigger.action.title,
                buildSql(context: ResultContext) {
                    return actionToSql(params.request.trigger.action!, context.sqlText ?? '');
                },
            }
          : (specs[params.request.trigger.suggestionId] ?? null);

    if (!spec) {
        throw new Error(`Unsupported analysis suggestion: ${params.request.trigger.suggestionId}`);
    }

    const session: AnalysisSession = {
        id: analysisRunId,
        title: spec.title,
        trigger: params.request.trigger,
        contextRef: params.request.context.resultRef,
        status: 'running',
        steps: buildSteps(spec.stepTemplates, createdAt),
        createdAt,
        updatedAt: createdAt,
    };

    try {
        const sqlStartedAt = nowIso();
        const sql = spec.buildSql(params.request.context.resultContext);
        session.steps = markStep(session.steps, spec.stepTemplates[0]!.id, {
            status: 'done',
            endedAt: sqlStartedAt,
        });
        session.steps = markStep(session.steps, spec.stepTemplates[1]!.id, {
            status: 'running',
            startedAt: sqlStartedAt,
            data: { sql, suggestionId: spec.suggestionId },
        });

        const executionStartedAt = new Date();
        const perfStart = performance.now();
        const result = await params.connection.queryWithContext(sql, {
            database: params.request.context.databaseName ?? undefined,
            queryId: resultSessionId,
        });
        const executionFinishedAt = new Date();
        const durationMs = Math.round(performance.now() - perfStart);

        const rows = Array.isArray(result.rows) ? (result.rows as Array<Record<string, unknown>>) : [];
        const columns = (result.columns ?? []).map(column => ({
            name: column.name,
            type: column.type ?? null,
        }));

        session.steps = markStep(session.steps, spec.stepTemplates[1]!.id, {
            status: 'done',
            endedAt: executionStartedAt.toISOString(),
        });
        session.steps = markStep(session.steps, spec.stepTemplates[2]!.id, {
            status: 'done',
            startedAt: executionStartedAt.toISOString(),
            endedAt: executionFinishedAt.toISOString(),
            data: {
                rowCount: result.rowCount ?? rows.length,
                durationMs,
            },
        });

        const ruleOutcomeCore = spec.summarize({
            rows,
            columns,
            context: params.request.context.resultContext,
        });
        const rowCount = result.rowCount ?? rows.length;
        const outcomeCore = await enhanceAnalysisSummary({
            locale,
            organizationId: params.organizationId ?? null,
            userId: params.userId ?? null,
            sql,
            suggestion: {
                title: spec.title,
                goal: spec.goal,
                description: spec.description,
                resultTitle: spec.resultTitle,
            },
            context: params.request.context.resultContext,
            columns,
            rows,
            rowCount,
            fallback: ruleOutcomeCore,
        });
        const followups = spec.buildFollowups({
            context: params.request.context.resultContext,
            resultRef: { sessionId: resultSessionId, setIndex: 0 },
            columns,
            rowCount,
            sqlText: sql,
            locale,
        });

        const outcome: AnalysisOutcome = {
            ...outcomeCore,
            recommendedActions: followups,
            artifacts: [
                { type: 'sql', sql },
                { type: 'result_ref', resultRef: { sessionId: resultSessionId, setIndex: 0 } },
                { type: 'text', content: outcomeCore.summary },
            ],
            followups,
        };

        session.status = 'done';
        session.updatedAt = nowIso();
        session.outcome = outcome;

        const query: AnalysisQueryPayload = {
            session: {
                sessionId: resultSessionId,
                tabId: params.tabId ?? null,
                connectionId: params.connectionId,
                database: params.request.context.databaseName ?? null,
                sqlText: sql,
                status: 'success',
                errorMessage: null,
                startedAt: executionStartedAt.toISOString(),
                finishedAt: executionFinishedAt.toISOString(),
                durationMs,
                resultSetCount: 1,
                stopOnError: true,
                source: 'analysis',
            },
            queryResultSets: [
                {
                    sessionId: resultSessionId,
                    setIndex: 0,
                    sqlText: sql,
                    sqlOp: parseSqlOp(sql),
                    title: makeTitle(sql),
                    columns,
                    rowCount,
                    limited: result.limited ?? false,
                    limit: result.limit ?? null,
                    affectedRows: null,
                    status: 'success',
                    errorMessage: null,
                    errorCode: null,
                    errorSqlState: null,
                    errorMeta: null,
                    warnings: null,
                    startedAt: executionStartedAt.toISOString(),
                    finishedAt: executionFinishedAt.toISOString(),
                    durationMs,
                },
            ],
            results: [rows],
        };

        return {
            session,
            query,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : t('Errors.RunFailed');
        const updatedAt = nowIso();
        const runningStep = session.steps.find(step => step.status === 'running')?.id ?? session.steps[session.steps.length - 1]?.id;
        session.status = 'error';
        session.updatedAt = updatedAt;
        session.steps = session.steps.map(step => {
            if (step.id === runningStep) {
                return {
                    ...step,
                    status: 'error',
                    endedAt: updatedAt,
                    error: message,
                };
            }
            if (step.status === 'pending') {
                return {
                    ...step,
                    status: 'error',
                    endedAt: updatedAt,
                    error: message,
                };
            }
            return step;
        });
        session.outcome = {
            summary: message,
            headline: t('Errors.RunFailed'),
            keyFindings: [message],
            recordHighlights: [],
            sections: [
                {
                    id: 'error',
                    title: 'Error',
                    items: [message],
                },
            ],
            artifacts: [{ type: 'text', content: message }],
            followups: [],
        };

        return {
            session,
            query: {
                session: {
                    sessionId: resultSessionId,
                    tabId: params.tabId ?? null,
                    connectionId: params.connectionId,
                    database: params.request.context.databaseName ?? null,
                    sqlText: '',
                    status: 'error',
                    errorMessage: message,
                    startedAt: updatedAt,
                    finishedAt: updatedAt,
                    durationMs: 0,
                    resultSetCount: 1,
                    stopOnError: true,
                    source: 'analysis',
                },
                queryResultSets: [
                    {
                        sessionId: resultSessionId,
                        setIndex: 0,
                        sqlText: '',
                        sqlOp: 'SELECT',
                        title: 'Analysis Error',
                        columns: [{ name: 'error', type: 'text' }],
                        rowCount: 1,
                        limited: false,
                        limit: null,
                        affectedRows: null,
                        status: 'error',
                        errorMessage: message,
                        errorCode: null,
                        errorSqlState: null,
                        errorMeta: null,
                        warnings: null,
                        startedAt: updatedAt,
                        finishedAt: updatedAt,
                        durationMs: 0,
                    },
                ],
                results: [[{ error: message }]],
            },
        };
    }
}
