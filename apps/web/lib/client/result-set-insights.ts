import type { ActionIntent } from '@/lib/copilot/action/types';
import type { ResultAction } from '@dory/analysis/core/result-actions';
import type { ResultColumnMeta, ResultSetStatsV1 } from './result-set-ai';

type InsightTranslate = (key: string, values?: Record<string, string | number>) => string;

export type InsightFactType =
    | 'dataset_shape'
    | 'distribution'
    | 'dominant_category'
    | 'low_information_dimension'
    | 'risk_signal'
    | 'top_dimension'
    | 'top_message'
    | 'measure_spread'
    | 'trend_candidate'
    | 'outlier_candidate'
    | 'correlation_candidate';

export type InsightFact = {
    id: string;
    type: InsightFactType;
    title?: string;
    severity?: 'info' | 'warning' | 'risk';
    confidence: number;
    columns?: string[];
    metrics?: Record<string, number | string>;
    narrativeHint?: string;
};

export type InsightPattern = {
    id: string;
    kind: 'spike' | 'drop' | 'outlier' | 'correlation' | 'segment_shift';
    confidence: number;
    columns: string[];
    summary: string;
    metrics: Record<string, number | string>;
};

export type InsightAction =
    | {
          id: string;
          label: string;
          kind: 'analysis-suggestion';
          suggestionId: string;
          action?: ResultAction;
          sqlPreview?: string;
      }
    | {
          id: 'explain-result';
          label: string;
          kind: 'copilot-prompt';
          prompt: string;
      }
    | {
          id: 'fix-sql-error' | 'optimize-performance' | 'rewrite-sql' | 'to-aggregation';
          label: string;
          kind: 'quick-action';
          intent: ActionIntent;
      };

export type RecommendedActionPriority = 'primary' | 'secondary';

export type RecommendedInsightAction = InsightAction & {
    priority: RecommendedActionPriority;
};

export type InsightLevel = 'primary' | 'secondary' | 'info';

export type InsightMainFinding = {
    title: string;
    summary: string;
    recommendation: string;
    action?: RecommendedInsightAction;
};

export type InsightItem = {
    id: string;
    title: string;
    summary: string;
    level: InsightLevel;
    severity: 'info' | 'warning' | 'critical';
    confidence: 'high' | 'medium' | 'low';
    primaryAction?: RecommendedInsightAction;
    actions: RecommendedInsightAction[];
};

export type InsightDecisionCard = {
    title: string;
    impact: string;
    mainFinding?: InsightMainFinding;
    items: InsightItem[];
};

export type InsightKeyColumns = {
    time?: string;
    measures: string[];
    dimensions: string[];
    identifiers: string[];
};

export type InsightDraft = {
    quickSummary: {
        title: string;
        subtitle?: string;
    };
    facts: InsightFact[];
    patterns: InsightPattern[];
    keyColumns: InsightKeyColumns;
    recommendedActions: RecommendedInsightAction[];
};

export type InsightViewModel = {
    quickSummary: {
        title: string;
        subtitle?: string;
    };
    insights: string[];
    keyColumns: InsightKeyColumns;
    recommendedActions: RecommendedInsightAction[];
    source: 'rules' | 'llm';
    advancedPatterns?: InsightPattern[];
    rewriteItems?: InsightRewriteItem[];
};

export type InsightStructuredSignal = InsightFact | InsightPattern;

export type InsightStructuredFinding = {
    id: string;
    title: string;
    summary: string;
    level: InsightLevel;
    severity: 'info' | 'warning' | 'critical';
    confidence: 'high' | 'medium' | 'low';
    primaryAction?: RecommendedInsightAction;
    actions: RecommendedInsightAction[];
};

type InsightText = {
    title: string;
    summary: string;
};

export type StructuredInsightView = {
    decision: InsightDecisionCard;
    signals: InsightStructuredSignal[];
    findings: InsightStructuredFinding[];
    narrative: string;
};

export type InsightRewriteRequest = {
    locale: string;
    sqlText?: string | null;
    summary: ResultSetStatsV1['summary'];
    keyColumns: InsightKeyColumns;
    facts: InsightFact[];
    patterns: InsightPattern[];
    profileColumns?: Array<{
        name: string;
        semanticRole: string;
        distinctCount?: number | null;
        topValueShare?: number | null;
        topK?: Array<{ value: string; count: number }>;
    }>;
    sampleRows?: Array<Record<string, unknown>>;
};

export type InsightRewriteResponse = {
    quickSummary: {
        title: string;
        subtitle?: string;
    };
    items: InsightRewriteItem[];
    analysisState?: 'invalid' | 'weak' | 'good' | 'actionable';
    primaryInsight?: string;
    limitations?: string[];
    autoRunPolicy?: 'confirm_required';
    reasoning?: {
        priorities: string[];
    };
};

export type InsightRewriteItem = {
    id: string;
    title: string;
    summary: string;
    level?: InsightLevel;
    primaryAction?: ResultAction & { priority?: RecommendedActionPriority };
    actions: Array<ResultAction & { priority?: RecommendedActionPriority }>;
};

export type InsightRuleContext = {
    stats?: ResultSetStatsV1 | null;
    columns?: ResultColumnMeta[] | null;
    sqlText?: string | null;
    rows?: Array<Record<string, unknown>> | null;
    locale: string;
    t: InsightTranslate;
};

const RISK_TERMS = new Set(['error', 'errors', 'failed', 'failure', 'warning', 'warn', 'timeout', 'fatal']);
const MESSAGE_NAME_HINTS = ['message', 'msg', 'description', 'event', 'title'];
const SERVICE_NAME_HINTS = ['service', 'source', 'component', 'app', 'application'];
const LEVEL_NAME_HINTS = ['level', 'status', 'severity', 'state'];
const MAX_PATTERN_ROWS = 2000;

function formatNumber(locale: string, value?: number | null) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '—';
    }

    return value.toLocaleString(locale);
}

function formatPercent(locale: string, ratio?: number | null, digits = 0) {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
        return '—';
    }

    return new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: digits,
    }).format(ratio);
}

function labelForKind(kind: ResultSetStatsV1['summary']['kind'], t: InsightTranslate) {
    switch (kind) {
        case 'single_value':
            return t('Insights.Kinds.SingleValue');
        case 'time_series':
            return t('Insights.Kinds.TimeSeries');
        case 'aggregated_table':
            return t('Insights.Kinds.AggregatedTable');
        case 'detail_table':
            return t('Insights.Kinds.DetailTable');
        default:
            return t('Insights.Kinds.Unknown');
    }
}

function labelForChart(chart: ResultSetStatsV1['summary']['recommendedChart'] | NonNullable<ResultSetStatsV1['autoChartProfile']>['chartState']['chartType'], t: InsightTranslate) {
    switch (chart) {
        case 'table':
            return t('Insights.Charts.Table');
        case 'bar':
            return t('Insights.Charts.Bar');
        case 'line':
            return t('Insights.Charts.Line');
        case 'pie':
            return t('Insights.Charts.Pie');
        case 'metric':
            return t('Insights.Charts.Metric');
        case 'scatter':
            return t('Insights.Charts.Scatter');
        default:
            return t('Insights.Charts.Unknown');
    }
}

function looksLike(name: string, hints: string[]) {
    const lower = name.trim().toLowerCase();
    return hints.some(hint => lower === hint || lower.includes(hint));
}

function toNumericValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function toTimestamp(value: unknown) {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.getTime();
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
    }

    return null;
}

function median(values: number[]) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1]! + sorted[middle]!) / 2;
    }
    return sorted[middle]!;
}

function quantile(values: number[], q: number) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const position = (sorted.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;
    const current = sorted[base]!;
    const next = sorted[base + 1] ?? current;
    return current + rest * (next - current);
}

function pearsonCorrelation(points: Array<{ x: number; y: number }>) {
    if (points.length < 5) return null;

    const n = points.length;
    const sumX = points.reduce((total, point) => total + point.x, 0);
    const sumY = points.reduce((total, point) => total + point.y, 0);
    const sumXY = points.reduce((total, point) => total + point.x * point.y, 0);
    const sumX2 = points.reduce((total, point) => total + point.x * point.x, 0);
    const sumY2 = points.reduce((total, point) => total + point.y * point.y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (!Number.isFinite(denominator) || denominator === 0) {
        return null;
    }

    return numerator / denominator;
}

function sampleRows(rows?: Array<Record<string, unknown>> | null) {
    return (rows ?? []).slice(0, MAX_PATTERN_ROWS);
}

function rankInsightFacts(facts: InsightFact[]) {
    const priority = new Map<InsightFactType, number>([
        ['risk_signal', 0],
        ['top_message', 1],
        ['trend_candidate', 2],
        ['measure_spread', 3],
        ['outlier_candidate', 4],
        ['dominant_category', 5],
        ['top_dimension', 6],
    ]);

    return [...facts]
        .filter(fact => fact.severity !== 'info' || priority.has(fact.type))
        .sort((left, right) => (priority.get(left.type) ?? 20) - (priority.get(right.type) ?? 20) || right.confidence - left.confidence)
        .slice(0, 5);
}

function rankInsightPatterns(patterns: InsightPattern[]) {
    const priority = new Map<InsightPattern['kind'], number>([
        ['spike', 0],
        ['outlier', 1],
        ['drop', 2],
        ['segment_shift', 3],
        ['correlation', 4],
    ]);

    return [...patterns].sort((left, right) => (priority.get(left.kind) ?? 20) - (priority.get(right.kind) ?? 20) || right.confidence - left.confidence).slice(0, 3);
}

function compactProfileColumns(stats: ResultSetStatsV1, keyColumns: InsightKeyColumns, facts: InsightFact[], patterns: InsightPattern[]) {
    const priorityColumns = new Set(
        [
            keyColumns.time,
            ...keyColumns.measures.slice(0, 4),
            ...keyColumns.dimensions.slice(0, 4),
            ...facts.flatMap(fact => fact.columns ?? []),
            ...patterns.flatMap(pattern => pattern.columns ?? []),
        ].filter((column): column is string => !!column),
    );
    const profiles = Object.values(stats.columns);
    const rankedProfiles = [
        ...profiles.filter(profile => priorityColumns.has(profile.name)),
        ...profiles.filter(profile => !priorityColumns.has(profile.name) && profile.semanticRole !== 'identifier'),
        ...profiles.filter(profile => !priorityColumns.has(profile.name) && profile.semanticRole === 'identifier'),
    ];

    return rankedProfiles.slice(0, 16).map(profile => ({
        name: profile.name,
        semanticRole: profile.semanticRole,
        distinctCount: profile.distinctCount ?? null,
        topValueShare: profile.topValueShare ?? null,
        topK:
            profile.semanticRole === 'dimension' || profile.semanticRole === 'text'
                ? (profile.topK?.slice(0, 2).map(item => ({
                      value: truncateInsightSampleValue(item.value),
                      count: item.count,
                  })) ?? [])
                : [],
    }));
}

function truncateInsightSampleValue(value: unknown) {
    const text = String(value ?? '');
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function compactRepresentativeRow(row: Record<string, unknown>, columns: string[]) {
    const entries = columns
        .filter(column => Object.prototype.hasOwnProperty.call(row, column))
        .slice(0, 8)
        .map(column => [column, typeof row[column] === 'string' ? truncateInsightSampleValue(row[column]) : row[column]]);

    return Object.fromEntries(entries);
}

function rowSignature(row: Record<string, unknown>) {
    return JSON.stringify(row);
}

function pickUniqueRow(rows: Array<Record<string, unknown>>, seen: Set<string>, predicate: (row: Record<string, unknown>) => boolean) {
    const row = rows.find(candidate => {
        if (!predicate(candidate)) return false;
        return !seen.has(rowSignature(candidate));
    });

    if (!row) return null;
    seen.add(rowSignature(row));
    return row;
}

function selectRepresentativeSampleRows(rows: Array<Record<string, unknown>> | null | undefined, keyColumns: InsightKeyColumns, patterns: InsightPattern[]) {
    const candidates = rows ?? [];
    const selected: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const addRow = (row: Record<string, unknown> | null) => {
        if (!row || selected.length >= 5) return;
        selected.push(row);
    };
    const durationColumn =
        keyColumns.measures.find(column => column.trim().toLowerCase() === 'duration_ms') ?? keyColumns.measures.find(column => column.trim().toLowerCase().includes('duration'));

    if (durationColumn) {
        const highDurationRows = candidates
            .map(row => ({ row, value: toNumericValue(row[durationColumn]) }))
            .filter((item): item is { row: Record<string, unknown>; value: number } => typeof item.value === 'number')
            .sort((left, right) => right.value - left.value)
            .slice(0, 2);

        for (const item of highDurationRows) {
            const signature = rowSignature(item.row);
            if (seen.has(signature)) continue;
            seen.add(signature);
            addRow(item.row);
        }
    }

    const outlierPattern = patterns.find(pattern => pattern.kind === 'outlier');
    const outlierColumn = outlierPattern?.columns[0];
    const outlierValue = outlierPattern?.metrics.value;
    if (outlierColumn && outlierValue != null) {
        addRow(
            pickUniqueRow(candidates, seen, row => {
                const value = row[outlierColumn];
                if (typeof outlierValue === 'number') return toNumericValue(value) === outlierValue;
                return String(value) === String(outlierValue);
            }),
        );
    }

    const durationValues = durationColumn ? candidates.map(candidate => toNumericValue(candidate[durationColumn])).filter((item): item is number => typeof item === 'number') : [];
    const highDurationCutoff = durationValues.length ? quantile(durationValues, 0.95) : null;
    const ordinaryRows = candidates.filter(row => {
        if (durationColumn && selected.length < 4) {
            const value = toNumericValue(row[durationColumn]);
            if (typeof value === 'number' && highDurationCutoff != null && value >= highDurationCutoff) return false;
        }
        return true;
    });

    let ordinaryCount = 0;
    for (const row of ordinaryRows) {
        if (ordinaryCount >= 2 || selected.length >= 5) break;
        const before = selected.length;
        addRow(pickUniqueRow([row], seen, () => true));
        if (selected.length > before) ordinaryCount += 1;
    }

    for (const row of candidates) {
        if (selected.length >= Math.min(3, candidates.length)) break;
        addRow(pickUniqueRow([row], seen, () => true));
    }

    return selected;
}

export function buildKeyColumns(columns: ResultColumnMeta[] | null | undefined, stats: ResultSetStatsV1 | null | undefined): InsightKeyColumns {
    const profiledColumns = columns ?? [];
    const timeColumn = stats?.summary.primaryTimeColumn ?? profiledColumns.find(column => column.semanticRole === 'time')?.name;

    return {
        time: timeColumn ?? undefined,
        measures: profiledColumns.filter(column => column.semanticRole === 'measure').map(column => column.name),
        dimensions: profiledColumns.filter(column => column.semanticRole === 'dimension' || column.semanticRole === 'text').map(column => column.name),
        identifiers: profiledColumns.filter(column => column.semanticRole === 'identifier').map(column => column.name),
    };
}

function buildQuickSummary(context: InsightRuleContext, keyColumns: InsightKeyColumns) {
    const { stats, columns, locale, t } = context;
    const summary = stats?.summary;
    const rowCount = summary?.rowCount ?? null;
    const columnCount = summary?.columnCount ?? columns?.length ?? 0;
    const kindLabel = labelForKind(summary?.kind ?? 'unknown', t);
    const autoChart = stats?.autoChartProfile?.emptyReason ? null : stats?.autoChartProfile?.chartState.chartType;
    const chartStatus = summary?.isGoodForChart || autoChart ? t('Insights.QuickSummary.ChartReady') : t('Insights.QuickSummary.ExplorationReady');

    const title = t('Insights.QuickSummary.Title', {
        kind: kindLabel,
        rows: formatNumber(locale, rowCount),
        columns: formatNumber(locale, columnCount),
        chartStatus,
    });

    const timeColumn = summary?.primaryTimeColumn ?? keyColumns.time;
    const timeProfile = timeColumn ? stats?.columns?.[timeColumn] : null;
    const subtitle = timeColumn
        ? t('Insights.QuickSummary.TimeDetail', {
              column: timeColumn,
              grain: timeProfile?.inferredTimeGrain
                  ? t('Insights.TimeGrain.Detail', {
                        grain: t(`Insights.TimeGrain.${timeProfile.inferredTimeGrain}`),
                    })
                  : t('Insights.TimeGrain.EventLevel'),
          })
        : t('Insights.QuickSummary.ChartHint', {
              chart: labelForChart(autoChart ?? summary?.recommendedChart ?? null, t),
          });

    return {
        title,
        subtitle,
    };
}

function findInterestingDimension(stats: ResultSetStatsV1 | null | undefined, columns: ResultColumnMeta[] | null | undefined) {
    const candidates = (columns ?? []).filter(column => column.semanticRole === 'dimension' || column.semanticRole === 'text');

    return candidates
        .map(column => {
            const profile = stats?.columns?.[column.name];
            const top = profile?.topK?.[0];
            const distinctCount = profile?.distinctCount ?? Number.MAX_SAFE_INTEGER;
            const name = column.name.toLowerCase();
            const priorityBoost = (looksLike(name, LEVEL_NAME_HINTS) ? 20 : 0) + (looksLike(name, SERVICE_NAME_HINTS) ? 12 : 0) + (looksLike(name, MESSAGE_NAME_HINTS) ? 8 : 0);

            return {
                column,
                profile,
                score: priorityBoost + (top?.count ?? 0) - Math.min(distinctCount, 100),
            };
        })
        .sort((left, right) => right.score - left.score)[0];
}

export function buildInsightFacts(context: InsightRuleContext): InsightFact[] {
    const { stats, columns, rows } = context;
    const facts: InsightFact[] = [];
    const summary = stats?.summary;
    const rowCount = summary?.rowCount ?? rows?.length ?? 0;
    const profiles = stats?.columns ?? {};

    if (summary) {
        facts.push({
            id: 'dataset-shape',
            type: 'dataset_shape',
            severity: 'info',
            confidence: 1,
            metrics: {
                kind: summary.kind,
                rowCount: summary.rowCount ?? 0,
                columnCount: summary.columnCount,
                recommendedChart: stats?.autoChartProfile?.emptyReason
                    ? (summary.recommendedChart ?? 'table')
                    : (stats?.autoChartProfile?.chartState.chartType ?? summary.recommendedChart ?? 'table'),
            },
        });
    }

    const interestingDimension = findInterestingDimension(stats, columns);
    const dimensionTop = interestingDimension?.profile?.topK?.[0];
    const lowInformationDimension = (columns ?? [])
        .map(column => ({ column, profile: profiles[column.name] }))
        .find(entry => {
            const profile = entry.profile;
            if (!profile || profile.semanticRole !== 'dimension') return false;
            return profile.informationDensity === 'none' || profile.topValueShare === 1 || profile.entropy === 0;
        });
    if (lowInformationDimension?.profile && rowCount > 0) {
        const top = lowInformationDimension.profile.topK?.[0];
        facts.push({
            id: `low-info:${lowInformationDimension.column.name}`,
            type: 'low_information_dimension',
            severity: 'warning',
            confidence: 0.95,
            columns: [lowInformationDimension.column.name],
            metrics: {
                value: top?.value ?? '',
                count: top?.count ?? lowInformationDimension.profile.nonNullCount,
                share: lowInformationDimension.profile.topValueShare ?? 1,
                entropy: lowInformationDimension.profile.entropy ?? 0,
                distinctRatio: lowInformationDimension.profile.distinctRatio ?? 0,
            },
            narrativeHint: 'This column has too little variance to support a useful distribution analysis.',
        });
    }

    if (interestingDimension && dimensionTop && rowCount > 0) {
        const informationDensity = interestingDimension.profile?.informationDensity;
        if (informationDensity === 'none' || interestingDimension.profile?.topValueShare === 1) {
            // Keep this as a Profile fact only; do not turn a constant field into a user-facing "top value" insight.
        } else {
            facts.push({
                id: `dominant:${interestingDimension.column.name}:${dimensionTop.value}`,
                type: 'dominant_category',
                severity: 'info',
                confidence: 0.9,
                columns: [interestingDimension.column.name],
                metrics: {
                    value: dimensionTop.value,
                    count: dimensionTop.count,
                    share: dimensionTop.count / rowCount,
                },
                narrativeHint: 'Most rows cluster around a single dominant category.',
            });
        }
    }

    const riskProfile = Object.values(profiles).find(profile => {
        if (!profile.topK?.length || (profile.distinctCount ?? Number.MAX_SAFE_INTEGER) > 12) {
            return false;
        }
        return profile.topK.some(item => RISK_TERMS.has(String(item.value).trim().toLowerCase()));
    });

    if (riskProfile?.topK && rowCount > 0) {
        const risky = riskProfile.topK.find(item => RISK_TERMS.has(String(item.value).trim().toLowerCase()));
        const share = risky ? risky.count / rowCount : 0;
        if (risky && share >= 0.1) {
            facts.push({
                id: `risk:${riskProfile.name}:${risky.value}`,
                type: 'risk_signal',
                severity: 'risk',
                confidence: Math.min(0.95, 0.5 + share),
                columns: [riskProfile.name],
                metrics: {
                    value: risky.value,
                    count: risky.count,
                    share,
                },
                narrativeHint: 'A risk-heavy category stands out and likely deserves investigation first.',
            });
        }
    }

    const topDimension = (columns ?? [])
        .filter(column => column.semanticRole === 'dimension')
        .map(column => ({ column, profile: profiles[column.name] }))
        .find(entry => entry.profile?.topK?.[0] && (entry.profile.distinctCount ?? Number.MAX_SAFE_INTEGER) <= 50);
    if (topDimension?.profile?.topK?.[0]) {
        const top = topDimension.profile.topK[0];
        facts.push({
            id: `top-dimension:${topDimension.column.name}:${top.value}`,
            type: 'top_dimension',
            severity: 'info',
            confidence: 0.82,
            columns: [topDimension.column.name],
            metrics: {
                value: top.value,
                count: top.count,
            },
            narrativeHint: 'One dimension value is noticeably more active than the rest.',
        });
    }

    const messageColumn = (columns ?? []).find(column => looksLike(column.name, MESSAGE_NAME_HINTS));
    const messageTop = messageColumn ? profiles[messageColumn.name]?.topK?.[0] : null;
    if (messageColumn && messageTop) {
        facts.push({
            id: `top-message:${messageColumn.name}:${messageTop.value}`,
            type: 'top_message',
            severity: 'info',
            confidence: 0.8,
            columns: [messageColumn.name],
            metrics: {
                value: messageTop.value,
                count: messageTop.count,
            },
            narrativeHint: 'A repeated text pattern can summarize a large share of the result.',
        });
    }

    const keyColumns = buildKeyColumns(columns, stats);
    if (keyColumns.time) {
        facts.push({
            id: `trend:${keyColumns.time}`,
            type: 'trend_candidate',
            severity: 'info',
            confidence: 0.85,
            columns: [keyColumns.time],
            metrics: {
                timeColumn: keyColumns.time,
            },
            narrativeHint: 'The result is suitable for time trend analysis.',
        });
    }

    const spreadMeasure = keyColumns.measures
        .map(name => profiles[name])
        .find(profile => profile && typeof profile.p50 === 'number' && typeof profile.p95 === 'number' && profile.p95 > profile.p50);
    if (spreadMeasure && typeof spreadMeasure.p50 === 'number' && typeof spreadMeasure.p95 === 'number') {
        facts.push({
            id: `measure-spread:${spreadMeasure.name}`,
            type: 'measure_spread',
            severity: 'warning',
            confidence: 0.78,
            columns: [spreadMeasure.name],
            metrics: {
                p50: spreadMeasure.p50,
                p95: spreadMeasure.p95,
            },
            narrativeHint: 'The measure has visible spread and likely includes tail behavior.',
        });
    }

    return facts;
}

export function detectAdvancedPatterns(context: InsightRuleContext): InsightPattern[] {
    const { rows, stats, columns } = context;
    const sampled = sampleRows(rows);
    const patterns: InsightPattern[] = [];
    const keyColumns = buildKeyColumns(columns, stats);

    if (sampled.length < 5) {
        return patterns;
    }

    if (keyColumns.time) {
        const measure = keyColumns.measures[0];
        if (measure) {
            const buckets = new Map<string, number>();
            for (const row of sampled) {
                const timeValue = toTimestamp(row[keyColumns.time]);
                const measureValue = toNumericValue(row[measure]);
                if (timeValue == null || measureValue == null) continue;
                const bucket = new Date(timeValue).toISOString().slice(0, 13);
                buckets.set(bucket, (buckets.get(bucket) ?? 0) + measureValue);
            }

            const series = [...buckets.entries()].map(([bucket, value]) => ({ bucket, value })).sort((left, right) => left.bucket.localeCompare(right.bucket));
            const values = series.map(item => item.value);
            const center = median(values);
            const q1 = quantile(values, 0.25);
            const q3 = quantile(values, 0.75);
            const iqr = q1 != null && q3 != null ? q3 - q1 : null;

            if (series.length >= 5 && center != null && iqr != null && iqr > 0) {
                const spike = series.find(item => item.value > (q3 ?? center) + 1.5 * iqr);
                if (spike) {
                    patterns.push({
                        id: `spike:${measure}:${spike.bucket}`,
                        kind: 'spike',
                        confidence: 0.84,
                        columns: [keyColumns.time, measure],
                        summary: 'A time bucket spikes above the recent baseline.',
                        metrics: {
                            bucket: spike.bucket,
                            value: spike.value,
                            baseline: center,
                        },
                    });
                }

                const drop = series.find(item => item.value < (q1 ?? center) - 1.5 * iqr);
                if (drop) {
                    patterns.push({
                        id: `drop:${measure}:${drop.bucket}`,
                        kind: 'drop',
                        confidence: 0.73,
                        columns: [keyColumns.time, measure],
                        summary: 'A time bucket drops below the recent baseline.',
                        metrics: {
                            bucket: drop.bucket,
                            value: drop.value,
                            baseline: center,
                        },
                    });
                }
            }
        }
    }

    for (const measure of keyColumns.measures.slice(0, 2)) {
        const numericValues = sampled.map(row => toNumericValue(row[measure])).filter((value): value is number => value != null);
        const q1 = quantile(numericValues, 0.25);
        const q3 = quantile(numericValues, 0.75);
        const iqr = q1 != null && q3 != null ? q3 - q1 : null;
        if (numericValues.length >= 8 && q3 != null && iqr != null && iqr > 0) {
            const outlier = numericValues.find(value => value > q3 + 1.5 * iqr);
            if (outlier != null) {
                patterns.push({
                    id: `outlier:${measure}`,
                    kind: 'outlier',
                    confidence: 0.77,
                    columns: [measure],
                    summary: 'A measure contains extreme high values compared with the rest of the sample.',
                    metrics: {
                        value: outlier,
                        q3,
                        iqr,
                    },
                });
            }
        }
    }

    if (keyColumns.measures.length >= 2) {
        const [leftMeasure, rightMeasure] = keyColumns.measures;
        if (leftMeasure && rightMeasure) {
            const points = sampled
                .map(row => ({
                    x: toNumericValue(row[leftMeasure]),
                    y: toNumericValue(row[rightMeasure]),
                }))
                .filter((point): point is { x: number; y: number } => point.x != null && point.y != null);

            const correlation = pearsonCorrelation(points);
            if (correlation != null && Math.abs(correlation) >= 0.6) {
                patterns.push({
                    id: `correlation:${leftMeasure}:${rightMeasure}`,
                    kind: 'correlation',
                    confidence: Math.min(0.9, Math.abs(correlation)),
                    columns: [leftMeasure, rightMeasure],
                    summary: 'Two measures tend to move together across the sampled rows.',
                    metrics: {
                        correlation,
                    },
                });
            }
        }
    }

    return patterns.slice(0, 4);
}

function actionFromPattern(context: InsightRuleContext, pattern: InsightPattern, keyColumns: InsightKeyColumns): InsightAction | null {
    const { t } = context;
    const dimension = keyColumns.dimensions[0];
    const measure = keyColumns.measures[0];
    if (!dimension) return null;
    return {
        id: 'pattern-follow-up',
        label: t('Insights.Actions.PatternFollowUp'),
        kind: 'analysis-suggestion',
        suggestionId: 'pattern-follow-up',
        action: {
            type: 'group',
            title: t('Insights.Actions.PatternFollowUp'),
            params: {
                dimensions: [dimension],
                measure: measure
                    ? {
                          column: measure,
                          aggregation: 'AVG',
                      }
                    : undefined,
                limit: 20,
            },
        },
    };
}

function normalizeRecommendedActions(actions: Array<InsightAction & { priority?: RecommendedActionPriority }>, limit = 4): RecommendedInsightAction[] {
    const executableActions = actions.filter(action => action.kind !== 'analysis-suggestion' || !!action.action || !!action.sqlPreview);
    const limited = executableActions.slice(0, limit);
    const primaryIndex = Math.max(
        0,
        limited.findIndex(action => action.priority === 'primary'),
    );

    return limited.map((action, index) => ({
        ...action,
        priority: index === primaryIndex ? 'primary' : 'secondary',
    }));
}

function normalizeInsightActions(actions: Array<InsightAction & { priority?: RecommendedActionPriority }>): RecommendedInsightAction[] {
    return normalizeRecommendedActions(actions).slice(0, 3);
}

function buildRecommendedActions(context: InsightRuleContext, keyColumns: InsightKeyColumns, facts: InsightFact[], patterns: InsightPattern[]): RecommendedInsightAction[] {
    const { t } = context;
    const actions: InsightAction[] = [];
    const serviceColumn = keyColumns.dimensions.find(name => looksLike(name, SERVICE_NAME_HINTS));
    const messageColumn = keyColumns.dimensions.find(name => looksLike(name, MESSAGE_NAME_HINTS));
    const primaryMeasure = keyColumns.measures[0];
    const hasRiskSignal = facts.some(fact => fact.type === 'risk_signal');
    const hasOutlier = patterns.some(pattern => pattern.kind === 'outlier');
    const hasTimePattern = patterns.some(pattern => pattern.kind === 'spike' || pattern.kind === 'drop');
    const primaryMeasureThreshold = (() => {
        const spreadThreshold = facts.find(fact => fact.type === 'measure_spread' && fact.columns?.[0] === primaryMeasure)?.metrics?.p95;
        if (typeof spreadThreshold === 'number' && Number.isFinite(spreadThreshold)) return spreadThreshold;
        const outlierThreshold = patterns.find(pattern => pattern.kind === 'outlier' && pattern.columns[0] === primaryMeasure)?.metrics.value;
        if (typeof outlierThreshold === 'number' && Number.isFinite(outlierThreshold)) return outlierThreshold;
        return null;
    })();
    const inspectHighValueLabel = primaryMeasure
        ? looksLike(primaryMeasure, ['duration', 'latency', 'elapsed', '耗时', '时长']) || primaryMeasure.toLowerCase().endsWith('_ms')
            ? t('Insights.Actions.LocateSlowRequests')
            : t('Insights.Actions.FindHighestRows', { column: primaryMeasure })
        : t('Insights.Actions.InspectOutliers');

    if (patterns[0]) {
        const action = actionFromPattern(context, patterns[0], keyColumns);
        if (action) actions.push(action);
    }

    if (primaryMeasure && primaryMeasureThreshold != null && (hasOutlier || facts.some(fact => fact.type === 'measure_spread'))) {
        actions.push({
            id: 'inspect-outliers',
            label: inspectHighValueLabel,
            kind: 'analysis-suggestion',
            suggestionId: 'inspect-outliers',
            action: {
                type: 'filter',
                title: inspectHighValueLabel,
                params: {
                    column: primaryMeasure,
                    operator: '>',
                    value: primaryMeasureThreshold,
                },
            },
        });
    }

    if (serviceColumn) {
        actions.push({
            id: 'group-by-service',
            label: t('Insights.Actions.GroupByService', {
                column: serviceColumn,
            }),
            kind: 'analysis-suggestion',
            suggestionId: 'group-by-service',
            action: {
                type: 'group',
                title: t('Insights.Actions.GroupByService', { column: serviceColumn }),
                params: {
                    dimensions: [serviceColumn],
                    limit: 20,
                },
            },
        });
    }

    if (serviceColumn || hasRiskSignal) {
        const dimension = serviceColumn ?? keyColumns.dimensions[0];
        if (dimension) {
            actions.push({
                id: 'analyze-source',
                label: t('Insights.Actions.AnalyzeByColumn', { column: dimension }),
                kind: 'analysis-suggestion',
                suggestionId: 'analyze-source',
                action: {
                    type: 'group',
                    title: t('Insights.Actions.AnalyzeByColumn', { column: dimension }),
                    params: {
                        dimensions: [dimension],
                        limit: 20,
                    },
                },
            });
        }
    }

    if (primaryMeasure) {
        actions.push({
            id: 'view-distribution',
            label: t('Insights.Actions.ViewColumnDistribution', { column: primaryMeasure }),
            kind: 'analysis-suggestion',
            suggestionId: 'view-distribution',
            action: {
                type: 'distribution',
                title: t('Insights.Actions.ViewColumnDistribution', { column: primaryMeasure }),
                params: {
                    column: primaryMeasure,
                },
            },
        });
    }

    if (keyColumns.time && (hasRiskSignal || hasTimePattern || !!primaryMeasure)) {
        actions.push({
            id: 'view-time-trend',
            label: t('Insights.Actions.ViewTimeTrendByColumn', { column: keyColumns.time }),
            kind: 'analysis-suggestion',
            suggestionId: 'view-time-trend',
            action: {
                type: 'trend',
                title: t('Insights.Actions.ViewTimeTrendByColumn', { column: keyColumns.time }),
                params: {
                    timeColumn: keyColumns.time,
                    measure: primaryMeasure
                        ? {
                              column: primaryMeasure,
                              aggregation: 'SUM',
                          }
                        : undefined,
                    limit: 50,
                },
            },
        });
    }

    if (primaryMeasure && primaryMeasureThreshold != null) {
        actions.push({
            id: 'filter-outliers',
            label: t('Insights.Actions.ExcludeHighValueRows', { column: primaryMeasure }),
            kind: 'analysis-suggestion',
            suggestionId: 'filter-outliers',
            action: {
                type: 'filter',
                title: t('Insights.Actions.ExcludeHighValueRows', { column: primaryMeasure }),
                params: {
                    column: primaryMeasure,
                    operator: '<=',
                    value: primaryMeasureThreshold,
                },
            },
        });
    }

    if (messageColumn) {
        actions.push({
            id: 'top-messages',
            label: t('Insights.Actions.AnalyzeByColumn', { column: messageColumn }),
            kind: 'analysis-suggestion',
            suggestionId: 'top-messages',
            action: {
                type: 'group',
                title: t('Insights.Actions.AnalyzeByColumn', { column: messageColumn }),
                params: {
                    dimensions: [messageColumn],
                    limit: 20,
                },
            },
        });
    }

    const deduped = actions.filter((action, index) => actions.findIndex(candidate => candidate.id === action.id) === index);
    return normalizeRecommendedActions(deduped, 8);
}

function actionColumns(action: ResultAction) {
    if (action.type === 'filter') return [action.params.column];
    if (action.type === 'group') return [...action.params.dimensions, action.params.measure?.column].filter((column): column is string => !!column);
    if (action.type === 'trend') return [action.params.timeColumn, action.params.measure?.column].filter((column): column is string => !!column);
    return [action.params.column];
}

function isValidResultAction(action: ResultAction, context: InsightRuleContext) {
    const allowedColumns = new Set((context.columns ?? []).map(column => column.name));
    if (!allowedColumns.size) return true;
    return actionColumns(action).every(column => allowedColumns.has(column));
}

function actionSignature(action: ResultAction) {
    return `${action.type}:${JSON.stringify(action.params)}`;
}

function actionKind(action: ResultAction) {
    if (action.type === 'trend') return 'view-time-trend';
    if (action.type === 'distribution') return 'view-distribution';
    if (action.type === 'filter') return action.params.operator === '<=' || action.params.operator === '<' ? 'filter-outliers' : 'inspect-outliers';
    return 'analyze-source';
}

function rewriteActionToInsightAction(
    context: InsightRuleContext,
    action: ResultAction & { priority?: RecommendedActionPriority },
    suggestionId: string,
): RecommendedInsightAction | null {
    if (!isValidResultAction(action, context)) return null;
    return {
        id: suggestionId,
        label: action.title,
        kind: 'analysis-suggestion',
        suggestionId,
        action,
        priority: action.priority === 'primary' ? 'primary' : 'secondary',
    };
}

function buildRewriteActions(context: InsightRuleContext, rewritten?: InsightRewriteResponse | null) {
    const seen = new Set<string>();
    const merged: Array<InsightAction & { priority?: RecommendedActionPriority }> = [];

    for (const [itemIndex, item] of (rewritten?.items ?? []).entries()) {
        for (const [actionIndex, action] of item.actions.entries()) {
            if (!isValidResultAction(action, context)) continue;
            const signature = actionSignature(action);
            if (seen.has(signature)) continue;
            seen.add(signature);
            const suggestionId = `ai-${actionKind(action)}-${itemIndex + 1}-${actionIndex + 1}`;
            merged.push({
                id: suggestionId,
                label: action.title,
                kind: 'analysis-suggestion',
                suggestionId,
                action,
                priority: action.priority,
            });
        }
    }

    return normalizeRecommendedActions(merged);
}

function factToInsight(context: InsightRuleContext, fact: InsightFact) {
    const { locale, t } = context;
    switch (fact.type) {
        case 'dominant_category':
            return t('Insights.Messages.PrimaryCategory', {
                column: String(fact.columns?.[0] ?? ''),
                value: String(fact.metrics?.value ?? ''),
                share: formatPercent(locale, typeof fact.metrics?.share === 'number' ? fact.metrics.share : null),
            });
        case 'low_information_dimension':
            return t('Insights.Messages.LowInformationDimension', {
                column: String(fact.columns?.[0] ?? ''),
                value: String(fact.metrics?.value ?? ''),
                count: formatNumber(locale, typeof fact.metrics?.count === 'number' ? fact.metrics.count : null),
                share: formatPercent(locale, typeof fact.metrics?.share === 'number' ? fact.metrics.share : null),
            });
        case 'risk_signal':
            return t('Insights.Messages.RiskCategory', {
                value: String(fact.metrics?.value ?? ''),
                share: formatPercent(locale, typeof fact.metrics?.share === 'number' ? fact.metrics.share : null),
                column: String(fact.columns?.[0] ?? ''),
            });
        case 'top_dimension':
            return t('Insights.Messages.TopDimension', {
                column: String(fact.columns?.[0] ?? ''),
                value: String(fact.metrics?.value ?? ''),
                count: formatNumber(locale, typeof fact.metrics?.count === 'number' ? fact.metrics.count : null),
            });
        case 'top_message':
            return t('Insights.Messages.TopMessage', {
                value: String(fact.metrics?.value ?? ''),
                count: formatNumber(locale, typeof fact.metrics?.count === 'number' ? fact.metrics.count : null),
            });
        case 'trend_candidate':
            return t('Insights.Messages.TimeTrend', {
                column: String(fact.columns?.[0] ?? ''),
            });
        case 'measure_spread':
            return t('Insights.Messages.MeasureSpread', {
                column: String(fact.columns?.[0] ?? ''),
                p50: formatNumber(locale, typeof fact.metrics?.p50 === 'number' ? fact.metrics.p50 : null),
                p95: formatNumber(locale, typeof fact.metrics?.p95 === 'number' ? fact.metrics.p95 : null),
            });
        default:
            return null;
    }
}

function patternToInsight(context: InsightRuleContext, pattern: InsightPattern) {
    const { locale, t } = context;
    switch (pattern.kind) {
        case 'spike':
            return t('Insights.Messages.SpikePattern', {
                bucket: String(pattern.metrics.bucket ?? ''),
                value: formatNumber(locale, typeof pattern.metrics.value === 'number' ? pattern.metrics.value : null),
                baseline: formatNumber(locale, typeof pattern.metrics.baseline === 'number' ? pattern.metrics.baseline : null),
            });
        case 'drop':
            return t('Insights.Messages.DropPattern', {
                bucket: String(pattern.metrics.bucket ?? ''),
                value: formatNumber(locale, typeof pattern.metrics.value === 'number' ? pattern.metrics.value : null),
                baseline: formatNumber(locale, typeof pattern.metrics.baseline === 'number' ? pattern.metrics.baseline : null),
            });
        case 'outlier':
            return t('Insights.Messages.OutlierPattern', {
                column: String(pattern.columns[0] ?? ''),
                value: formatNumber(locale, typeof pattern.metrics.value === 'number' ? pattern.metrics.value : null),
            });
        case 'correlation':
            return t('Insights.Messages.CorrelationPattern', {
                left: String(pattern.columns[0] ?? ''),
                right: String(pattern.columns[1] ?? ''),
                correlation: typeof pattern.metrics.correlation === 'number' ? pattern.metrics.correlation.toFixed(2) : '—',
            });
        default:
            return null;
    }
}

function factToInsightText(context: InsightRuleContext, fact: InsightFact): InsightText | null {
    const { locale, t } = context;
    const column = String(fact.columns?.[0] ?? '');
    const value = String(fact.metrics?.value ?? '');

    switch (fact.type) {
        case 'dominant_category':
            return {
                title: t('Insights.Decision.ConcentrationTitle', { column }),
                summary: t('Insights.Messages.PrimaryCategory', {
                    column,
                    value,
                    share: formatPercent(locale, typeof fact.metrics?.share === 'number' ? fact.metrics.share : null),
                }),
            };
        case 'low_information_dimension':
            return {
                title: t('Insights.Decision.LowInformationTitle', { column }),
                summary: t('Insights.Messages.LowInformationDimension', {
                    column,
                    value,
                    count: formatNumber(locale, typeof fact.metrics?.count === 'number' ? fact.metrics.count : null),
                    share: formatPercent(locale, typeof fact.metrics?.share === 'number' ? fact.metrics.share : null),
                }),
            };
        case 'risk_signal':
            return {
                title: t('Insights.Decision.RiskTitle', { column }),
                summary: t('Insights.Messages.RiskCategory', {
                    value,
                    share: formatPercent(locale, typeof fact.metrics?.share === 'number' ? fact.metrics.share : null),
                    column,
                }),
            };
        case 'top_dimension':
            return {
                title: t('Insights.Decision.ConcentrationTitle', { column }),
                summary: t('Insights.Messages.TopDimension', {
                    column,
                    value,
                    count: formatNumber(locale, typeof fact.metrics?.count === 'number' ? fact.metrics.count : null),
                }),
            };
        case 'top_message':
            return {
                title: t('Insights.Decision.ConcentrationTitle', { column }),
                summary: t('Insights.Messages.TopMessage', {
                    value,
                    count: formatNumber(locale, typeof fact.metrics?.count === 'number' ? fact.metrics.count : null),
                }),
            };
        case 'trend_candidate':
            return {
                title: t('Insights.Decision.TrendTitle', { column }),
                summary: t('Insights.Messages.TimeTrend', { column }),
            };
        case 'measure_spread':
            return {
                title: t('Insights.Decision.OutlierTitle', { column }),
                summary: t('Insights.Messages.MeasureSpread', {
                    column,
                    p50: formatNumber(locale, typeof fact.metrics?.p50 === 'number' ? fact.metrics.p50 : null),
                    p95: formatNumber(locale, typeof fact.metrics?.p95 === 'number' ? fact.metrics.p95 : null),
                }),
            };
        default: {
            const summary = factToInsight(context, fact);
            return summary ? { title: summary, summary } : null;
        }
    }
}

function patternToInsightText(context: InsightRuleContext, pattern: InsightPattern): InsightText | null {
    const { t } = context;
    const column = String(pattern.columns[0] ?? '');
    const summary = patternToInsight(context, pattern);
    if (!summary) return null;

    if (pattern.kind === 'outlier') {
        return {
            title: t('Insights.Decision.OutlierTitle', { column }),
            summary,
        };
    }

    if (pattern.kind === 'spike' || pattern.kind === 'drop') {
        return {
            title: t('Insights.Decision.TrendTitle', { column }),
            summary,
        };
    }

    return {
        title: summary,
        summary,
    };
}

export function buildInsightDraft(context: InsightRuleContext): InsightDraft {
    const keyColumns = buildKeyColumns(context.columns, context.stats);
    const facts = buildInsightFacts(context);
    const patterns = detectAdvancedPatterns(context);
    const recommendedActions = buildRecommendedActions(context, keyColumns, facts, patterns);

    return {
        quickSummary: buildQuickSummary(context, keyColumns),
        facts,
        patterns,
        keyColumns,
        recommendedActions,
    };
}

export function buildInsights(context: InsightRuleContext, rewritten?: InsightRewriteResponse | null): InsightViewModel {
    const draft = buildInsightDraft(context);

    if (rewritten?.items?.length) {
        return {
            quickSummary: rewritten.quickSummary ?? draft.quickSummary,
            insights: rewritten.items
                .map(item => item.summary || item.title)
                .filter(Boolean)
                .slice(0, 5),
            keyColumns: draft.keyColumns,
            recommendedActions: buildRewriteActions(context, rewritten),
            source: 'llm',
            advancedPatterns: draft.patterns,
            rewriteItems: rewritten.items,
        };
    }

    const insightSet: string[] = [];
    for (const pattern of draft.patterns) {
        const insight = patternToInsight(context, pattern);
        if (insight && !insightSet.includes(insight)) insightSet.push(insight);
    }
    for (const fact of draft.facts) {
        const insight = factToInsight(context, fact);
        if (insight && !insightSet.includes(insight)) insightSet.push(insight);
    }

    return {
        quickSummary: draft.quickSummary,
        insights: insightSet.slice(0, 5),
        keyColumns: draft.keyColumns,
        recommendedActions: draft.recommendedActions,
        source: 'rules',
        advancedPatterns: draft.patterns,
    };
}

export function buildInsightRewriteRequest(context: InsightRuleContext): InsightRewriteRequest | null {
    if (!context.stats?.summary) {
        return null;
    }

    const draft = buildInsightDraft(context);
    const compactPatterns = rankInsightPatterns(draft.patterns);
    const compactFacts = rankInsightFacts(draft.facts);
    const profileColumns = compactProfileColumns(context.stats, draft.keyColumns, compactFacts, compactPatterns);
    const sampleColumns = Array.from(
        new Set(
            [
                draft.keyColumns.time,
                ...draft.keyColumns.measures.slice(0, 3),
                ...draft.keyColumns.dimensions.slice(0, 3),
                ...compactPatterns.flatMap(pattern => pattern.columns),
                ...compactFacts.flatMap(fact => fact.columns ?? []),
            ].filter((column): column is string => !!column),
        ),
    );

    return {
        locale: context.locale,
        sqlText: context.sqlText ?? null,
        summary: context.stats.summary,
        keyColumns: draft.keyColumns,
        facts: compactFacts,
        patterns: compactPatterns,
        profileColumns,
        sampleRows: selectRepresentativeSampleRows(context.rows, draft.keyColumns, compactPatterns)
            .slice(0, 3)
            .map(row => compactRepresentativeRow(row, sampleColumns.length ? sampleColumns : profileColumns.map(column => column.name))),
    };
}

function confidenceBucket(value: number): 'high' | 'medium' | 'low' {
    if (value >= 0.8) return 'high';
    if (value >= 0.55) return 'medium';
    return 'low';
}

function findingSeverity(source: InsightFact | InsightPattern): 'info' | 'warning' | 'critical' {
    if ('severity' in source) {
        if (source.severity === 'risk') return 'critical';
        if (source.severity === 'warning') return 'warning';
        return 'info';
    }

    if ('kind' in source && (source.kind === 'spike' || source.kind === 'outlier')) return 'warning';
    return 'info';
}

function sourceColumns(source: InsightFact | InsightPattern) {
    return new Set(source.columns ?? []);
}

function sourceActionScore(source: InsightFact | InsightPattern, action: RecommendedInsightAction) {
    if (action.kind !== 'analysis-suggestion') return 0;
    if (!action.action && !action.sqlPreview) return -1;
    if (action.sqlPreview) return 1;

    const resultAction = action.action;
    if (!resultAction) return -1;

    const actionColumnSet = new Set(actionColumns(resultAction));
    const overlap = [...sourceColumns(source)].filter(column => actionColumnSet.has(column)).length;
    const actionType = resultAction.type;
    let score = overlap * 4;

    if ('kind' in source) {
        if ((source.kind === 'spike' || source.kind === 'drop') && actionType === 'trend') score += 8;
        if (source.kind === 'outlier' && (actionType === 'filter' || actionType === 'distribution')) score += 8;
        if (source.kind === 'correlation' && (actionType === 'group' || actionType === 'distribution')) score += 4;
    } else {
        if (source.type === 'risk_signal') {
            if (actionType === 'group') score += 8;
            if (actionType === 'trend') score += 5;
            if (actionType === 'filter' && overlap > 0) score += 8;
        }
        if (source.type === 'measure_spread' && (actionType === 'filter' || actionType === 'distribution' || actionType === 'trend')) score += 8;
        if (source.type === 'trend_candidate' && actionType === 'trend') score += 8;
        if ((source.type === 'dominant_category' || source.type === 'top_dimension' || source.type === 'top_message') && actionType === 'group') score += 8;
        if (source.type === 'low_information_dimension' && actionType === 'group') score += 5;
    }

    return score;
}

function actionsForSource(source: InsightFact | InsightPattern, actions: RecommendedInsightAction[]) {
    const scored = actions
        .map((action, index) => ({
            action,
            index,
            score: sourceActionScore(source, action),
        }))
        .filter(item => item.score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map(item => item.action);

    return normalizeInsightActions(scored);
}

function buildFallbackItemActions(source: InsightFact | InsightPattern, draft: InsightDraft) {
    return actionsForSource(source, draft.recommendedActions);
}

function buildCandidateActionPool(view: InsightViewModel, draft: InsightDraft) {
    const seen = new Set<string>();
    const actions: RecommendedInsightAction[] = [];

    const candidates = view.source === 'llm' ? draft.recommendedActions : [...view.recommendedActions, ...draft.recommendedActions];

    for (const action of candidates) {
        const signature = action.kind === 'analysis-suggestion' && action.action ? actionSignature(action.action) : action.id;
        if (seen.has(signature)) continue;
        seen.add(signature);
        actions.push(action);
    }

    return actions;
}

function rewriteItemActions(context: InsightRuleContext, item: InsightRewriteItem, itemIndex: number) {
    const actions = [
        ...(item.primaryAction
            ? [
                  {
                      ...item.primaryAction,
                      priority: 'primary' as RecommendedActionPriority,
                  },
              ]
            : []),
        ...item.actions,
    ];

    return normalizeInsightActions(
        actions
            .map((action, actionIndex) => rewriteActionToInsightAction(context, action, `ai-${actionKind(action)}-${itemIndex + 1}-${actionIndex + 1}`))
            .filter((action): action is RecommendedInsightAction => !!action),
    );
}

function sourceInsightLevel(source: InsightFact | InsightPattern, rewriteLevel?: InsightLevel): InsightLevel {
    if (rewriteLevel === 'primary' || rewriteLevel === 'secondary' || rewriteLevel === 'info') return rewriteLevel;

    if ('kind' in source) {
        if (source.kind === 'outlier') return 'primary';
        if (source.kind === 'spike' || source.kind === 'drop' || source.kind === 'correlation') return 'secondary';
        return 'secondary';
    }

    if (source.type === 'measure_spread') return 'primary';
    if (source.type === 'risk_signal' || source.type === 'dominant_category' || source.type === 'top_dimension' || source.type === 'top_message') return 'secondary';
    return 'info';
}

function sourcePriorityScore(source: InsightFact | InsightPattern, level: InsightLevel) {
    const levelScore = level === 'primary' ? 1000 : level === 'secondary' ? 500 : 100;
    if ('kind' in source) {
        const kindScore = source.kind === 'outlier' ? 80 : source.kind === 'spike' || source.kind === 'drop' ? 50 : source.kind === 'correlation' ? 35 : 20;
        return levelScore + kindScore + source.confidence;
    }

    const typeScore =
        source.type === 'measure_spread'
            ? 90
            : source.type === 'risk_signal'
              ? 70
              : source.type === 'dominant_category' || source.type === 'top_dimension'
                ? 55
                : source.type === 'top_message'
                  ? 45
                  : source.type === 'low_information_dimension'
                    ? 15
                    : source.type === 'trend_candidate'
                      ? 5
                      : 0;

    return levelScore + typeScore + source.confidence;
}

function sourceDedupKey(source: InsightFact | InsightPattern, summary: string) {
    if ('kind' in source) {
        if (source.kind === 'outlier') return `outlier:${source.columns[0] ?? ''}`;
        if (source.kind === 'spike' || source.kind === 'drop') return `time-pattern:${source.columns[0] ?? ''}:${source.kind}`;
        if (source.kind === 'correlation') return `correlation:${source.columns.join(':')}`;
        return `${source.kind}:${source.columns.join(':')}`;
    }

    if (source.type === 'trend_candidate') return `weak-time:${source.columns?.[0] ?? ''}`;
    if (source.type === 'measure_spread') return `spread:${source.columns?.[0] ?? ''}`;
    if (source.type === 'risk_signal') return `risk:${source.columns?.[0] ?? ''}:${String(source.metrics?.value ?? '')}`;
    if (source.type === 'dominant_category' || source.type === 'top_dimension') return `category:${source.columns?.[0] ?? ''}:${String(source.metrics?.value ?? '')}`;
    if (source.type === 'low_information_dimension') return `low-info:${source.columns?.[0] ?? ''}`;
    return summary.trim().toLowerCase();
}

function pickPrimaryAction(actions: RecommendedInsightAction[]) {
    return actions.find(action => action.priority === 'primary') ?? actions[0];
}

function buildFindingFromSource(params: {
    source: InsightFact | InsightPattern;
    title: string;
    summary: string;
    actions: RecommendedInsightAction[];
    rewriteLevel?: InsightLevel;
}): InsightStructuredFinding {
    const level = sourceInsightLevel(params.source, params.rewriteLevel);
    const actions = normalizeInsightActions(params.actions);
    const primaryAction = pickPrimaryAction(actions);

    return {
        id: params.source.id,
        title: params.title,
        summary: params.summary,
        level,
        severity: findingSeverity(params.source),
        confidence: confidenceBucket(params.source.confidence),
        primaryAction,
        actions,
    };
}

function normalizeFindings(findings: Array<InsightStructuredFinding & { source: InsightFact | InsightPattern }>) {
    const seen = new Set<string>();
    const deduped = findings
        .filter(finding => {
            const key = sourceDedupKey(finding.source, finding.summary);
            const textKey = `${finding.title.trim().toLowerCase()}|${finding.summary.trim().toLowerCase()}`;
            if (seen.has(key)) return false;
            if (seen.has(textKey)) return false;
            seen.add(key);
            seen.add(textKey);
            return true;
        })
        .sort((left, right) => sourcePriorityScore(right.source, right.level) - sourcePriorityScore(left.source, left.level));
    const visible = deduped.slice(0, 5);

    const primaryIndex = visible.findIndex(finding => finding.level === 'primary');
    const promotedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : visible.findIndex(finding => finding.level === 'secondary');

    return visible.map((finding, index) => {
        const isPrimary = index === promotedPrimaryIndex || (promotedPrimaryIndex < 0 && index === 0);
        const level: InsightLevel = isPrimary ? 'primary' : finding.level === 'primary' ? 'secondary' : finding.level;
        const actions = finding.actions;
        const primaryAction = pickPrimaryAction(actions);

        return {
            ...finding,
            level,
            primaryAction,
            actions,
        };
    });
}

function buildInsightDecision(params: { context: InsightRuleContext; view: InsightViewModel; findings: InsightStructuredFinding[] }) {
    const { t } = params.context;
    const items: InsightItem[] = params.findings.map(finding => ({
        id: finding.id,
        title: finding.title,
        summary: finding.summary,
        level: finding.level,
        severity: finding.severity,
        confidence: finding.confidence,
        primaryAction: finding.primaryAction,
        actions: finding.actions,
    }));
    const primary = items.find(item => item.level === 'primary') ?? items[0];

    return {
        title: params.view.quickSummary.title,
        impact: items[0]?.summary ?? params.view.quickSummary.subtitle ?? '',
        mainFinding: primary
            ? {
                  title: primary.title,
                  summary: primary.summary,
                  recommendation: primary.primaryAction
                      ? t('Insights.MainFinding.RecommendationWithAction', { action: primary.primaryAction.label })
                      : t('Insights.MainFinding.Recommendation'),
                  action: primary.primaryAction,
              }
            : undefined,
        items,
    };
}

export function buildStructuredInsightView(params: { context: InsightRuleContext; draft?: InsightDraft; view?: InsightViewModel }): StructuredInsightView {
    const draft = params.draft ?? buildInsightDraft(params.context);
    const view = params.view ?? buildInsights(params.context);
    const candidateActions = buildCandidateActionPool(view, draft);
    const findingSources = [...draft.patterns, ...draft.facts];
    const findings = normalizeFindings(
        findingSources
            .map((source, index) => {
                const rewriteItem = view.source === 'llm' ? (view.rewriteItems?.find(item => item.id === source.id) ?? null) : null;
                const ruleText = 'kind' in source ? patternToInsightText(params.context, source) : factToInsightText(params.context, source);
                const fallbackText = view.source === 'llm' && view.insights[index] ? view.insights[index] : null;
                const title = rewriteItem?.title || ruleText?.title || fallbackText;
                const summaryCandidate = rewriteItem?.summary || ruleText?.summary || fallbackText;
                const summary = summaryCandidate && summaryCandidate !== title ? summaryCandidate : ruleText?.summary || summaryCandidate;
                if (!title || !summary) return null;
                const actions = rewriteItem ? rewriteItemActions(params.context, rewriteItem, index) : actionsForSource(source, candidateActions);

                return {
                    ...buildFindingFromSource({
                        source,
                        title,
                        summary,
                        actions: actions.length ? actions : buildFallbackItemActions(source, draft),
                        rewriteLevel: rewriteItem?.level,
                    }),
                    source,
                };
            })
            .filter((item): item is InsightStructuredFinding & { source: InsightFact | InsightPattern } => !!item),
    ).map(({ source, ...finding }) => finding);

    return {
        decision: buildInsightDecision({
            context: params.context,
            view,
            findings,
        }),
        signals: [...draft.facts, ...draft.patterns],
        findings,
        narrative: [view.quickSummary.title, view.quickSummary.subtitle, ...view.insights].filter(Boolean).join(' '),
    };
}
