import assert from 'node:assert/strict';
import { profileResultSet } from '@/lib/client/result-set-ai';
import { buildInsightDraft, buildInsights, buildStructuredInsightView } from '@/lib/client/result-set-insights';
import { buildAnalysisSuggestions } from '@/lib/analysis/suggestions';
import { buildResultContext } from '@dory/analysis/result-context';

function translate(key: string, values?: Record<string, string | number>) {
    return `${key}${values ? ` ${JSON.stringify(values)}` : ''}`;
}

function testTrendAndServiceSuggestions() {
    const rows = [
        { created_at: '2025-01-01T00:00:00.000Z', service: 'auth', level: 'error', duration_ms: 120 },
        { created_at: '2025-01-01T01:00:00.000Z', service: 'auth', level: 'error', duration_ms: 110 },
        { created_at: '2025-01-01T02:00:00.000Z', service: 'payment', level: 'info', duration_ms: 20 },
        { created_at: '2025-01-01T03:00:00.000Z', service: 'payment', level: 'error', duration_ms: 90 },
    ];

    const profiled = profileResultSet({
        sqlText: 'select created_at, service, level, duration_ms from logs',
        rawColumns: [
            { name: 'created_at', type: 'timestamp' },
            { name: 'service', type: 'text' },
            { name: 'level', type: 'text' },
            { name: 'duration_ms', type: 'integer' },
        ],
        rows,
        rowCount: rows.length,
        limited: false,
        limit: null,
    });

    const draft = buildInsightDraft({
        stats: profiled.stats,
        columns: profiled.columns,
        sqlText: 'select created_at, service, level, duration_ms from logs',
        rows,
        locale: 'en',
        t: translate,
    });
    const structured = buildStructuredInsightView({
        context: {
            stats: profiled.stats,
            columns: profiled.columns,
            sqlText: 'select created_at, service, level, duration_ms from logs',
            rows,
            locale: 'en',
            t: translate,
        },
        draft,
        view: buildInsights({
            stats: profiled.stats,
            columns: profiled.columns,
            sqlText: 'select created_at, service, level, duration_ms from logs',
            rows,
            locale: 'en',
            t: translate,
        }),
    });

    const resultContext = buildResultContext({
        sessionId: 'session-1',
        setIndex: 0,
        sqlText: 'select created_at, service, level, duration_ms from logs',
        databaseName: 'db',
        rowCount: rows.length,
        columns: profiled.columns,
        stats: profiled.stats,
    });

    const suggestions = buildAnalysisSuggestions({
        resultContext,
        draft,
        recommendedActions: structured.decision.items.flatMap(item => item.actions),
        t: translate,
    });

    const itemActions = structured.decision.items.flatMap(item => item.actions);
    const primaryAction = itemActions.find(action => action.priority === 'primary' && action.kind === 'analysis-suggestion');
    assert.ok(structured.decision.items.some(item => item.actions.length > 0));
    assert.equal(suggestions[0]?.isPrimary, true);
    assert.equal(suggestions[0]?.id, primaryAction?.kind === 'analysis-suggestion' ? primaryAction.suggestionId : undefined);
    assert.ok(suggestions.some(item => item.id === 'view-time-trend'));
    assert.ok(suggestions.some(item => item.id === 'group-by-service' || item.id === 'analyze-source'));
}

function testNoInvalidSuggestionWithoutDimensions() {
    const rows = [{ total: 10 }, { total: 20 }, { total: 30 }];

    const profiled = profileResultSet({
        sqlText: 'select total from metrics',
        rawColumns: [{ name: 'total', type: 'integer' }],
        rows,
        rowCount: rows.length,
        limited: false,
        limit: null,
    });

    const draft = buildInsightDraft({
        stats: profiled.stats,
        columns: profiled.columns,
        sqlText: 'select total from metrics',
        rows,
        locale: 'en',
        t: translate,
    });
    const structured = buildStructuredInsightView({
        context: {
            stats: profiled.stats,
            columns: profiled.columns,
            sqlText: 'select total from metrics',
            rows,
            locale: 'en',
            t: translate,
        },
        draft,
        view: buildInsights({
            stats: profiled.stats,
            columns: profiled.columns,
            sqlText: 'select total from metrics',
            rows,
            locale: 'en',
            t: translate,
        }),
    });

    const resultContext = buildResultContext({
        sessionId: 'session-2',
        setIndex: 0,
        sqlText: 'select total from metrics',
        databaseName: 'db',
        rowCount: rows.length,
        columns: profiled.columns,
        stats: profiled.stats,
    });

    const suggestions = buildAnalysisSuggestions({
        resultContext,
        draft,
        recommendedActions: structured.decision.items.flatMap(item => item.actions),
        t: translate,
    });

    assert.ok(!suggestions.some(item => item.id === 'group-by-service'));
}

function testAiPrimaryNextStepForLowVarianceRawRows() {
    const rows = Array.from({ length: 20 }, (_, index) => ({
        event_type: 'CommitCommentEvent',
        actor_login: index % 2 === 0 ? 'alice' : 'bob',
        repo_name: index % 4 === 0 ? 'dory/studio' : 'dory/web',
        created_at: `2025-01-01T${String(index % 10).padStart(2, '0')}:00:00.000Z`,
    }));

    const sql = 'select event_type, actor_login, repo_name, created_at from github_events limit 20';
    const profiled = profileResultSet({
        sqlText: sql,
        rawColumns: [
            { name: 'event_type', type: 'text' },
            { name: 'actor_login', type: 'text' },
            { name: 'repo_name', type: 'text' },
            { name: 'created_at', type: 'timestamp' },
        ],
        rows,
        rowCount: rows.length,
        limited: true,
        limit: 20,
    });

    const draft = buildInsightDraft({
        stats: profiled.stats,
        columns: profiled.columns,
        sqlText: sql,
        rows,
        locale: 'en',
        t: translate,
    });
    const structured = buildStructuredInsightView({
        context: {
            stats: profiled.stats,
            columns: profiled.columns,
            sqlText: sql,
            rows,
            locale: 'en',
            t: translate,
        },
        draft,
        view: buildInsights({
            stats: profiled.stats,
            columns: profiled.columns,
            sqlText: sql,
            rows,
            locale: 'en',
            t: translate,
        }),
    });

    const resultContext = buildResultContext({
        sessionId: 'session-3',
        setIndex: 0,
        sqlText: sql,
        databaseName: 'db',
        rowCount: rows.length,
        columns: profiled.columns,
        stats: profiled.stats,
    });

    const suggestions = buildAnalysisSuggestions({
        resultContext,
        draft,
        recommendedActions: structured.decision.items.flatMap(item => item.actions),
        t: translate,
    });
    const primary = suggestions[0];

    assert.equal(primary?.isPrimary, true);
    assert.ok(primary?.sqlPreview || primary?.action);
    assert.ok(suggestions.some(item => item.analysisState === 'weak' && (item.sqlPreview || item.action)));
    assert.ok(!primary?.label.toLowerCase().includes('most common'));
    assert.ok(!primary?.label.includes('最常见'));
}

function testMissingColumnTypeDoesNotCrashSuggestions() {
    const resultContext = buildResultContext({
        sessionId: 'session-with-legacy-columns',
        setIndex: 0,
        sqlText: 'select legacy_column from legacy_table',
        rowCount: 1,
        columns: [{ name: 'legacy_column' }],
    });

    assert.equal(resultContext.columns[0]?.dataType, 'unknown');
    assert.doesNotThrow(() =>
        buildAnalysisSuggestions({
            resultContext,
            draft: {
                quickSummary: { title: 'Legacy result' },
                facts: [],
                patterns: [],
                keyColumns: {
                    measures: [],
                    dimensions: ['legacy_column'],
                    identifiers: [],
                },
                recommendedActions: [],
            },
            t: translate,
        }),
    );
}

testTrendAndServiceSuggestions();
testNoInvalidSuggestionWithoutDimensions();
testAiPrimaryNextStepForLowVarianceRawRows();
testMissingColumnTypeDoesNotCrashSuggestions();

console.log('analysis-suggestions tests passed');
