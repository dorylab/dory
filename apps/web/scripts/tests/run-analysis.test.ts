import assert from 'node:assert/strict';
import { runAnalysis } from '@/lib/server/analysis/run-analysis';
import type { BaseConnection } from '@dory/drivers/core';
import type { RunAnalysisRequest } from '@/lib/analysis/types';

function makeConnection(rows: Array<Record<string, unknown>>, columns: Array<{ name: string; type: string | null }>): Pick<BaseConnection, 'queryWithContext'> {
    return {
        queryWithContext: (async () => {
            return {
                rows,
                columns,
                rowCount: rows.length,
                limited: false,
                limit: undefined,
            };
        }) as unknown as BaseConnection['queryWithContext'],
    };
}

function baseRequest(suggestionId: string): RunAnalysisRequest {
    return {
        context: {
            connectionId: 'conn_123',
            databaseName: 'db',
            resultRef: {
                sessionId: 'session_1',
                setIndex: 0,
            },
            resultContext: {
                resultSetId: {
                    sessionId: 'session_1',
                    setIndex: 0,
                },
                sqlText: 'select service, total_rows, created_at from metrics',
                databaseName: 'db',
                tableRefs: [],
                rowCount: 4,
                columns: [
                    { name: 'service', dataType: 'text', semanticType: 'dimension' },
                    { name: 'total_rows', dataType: 'integer', semanticType: 'measure' },
                    { name: 'created_at', dataType: 'timestamp', semanticType: 'time' },
                ],
            },
            insight: {
                decision: {
                    title: 'warning',
                    impact: 'line 1',
                    recommendedActions: [],
                },
                signals: [],
                findings: [],
                narrative: 'narrative',
                recommendedActions: [],
            },
        } as any,
        trigger: {
            type: 'suggestion',
            suggestionId,
        },
    };
}

async function testDistributionAnalysis() {
    const response = await runAnalysis({
        request: baseRequest('view-distribution'),
        connection: makeConnection(
            [{ min_value: 1, avg_value: 6.5, max_value: 22, total_rows: 4 }],
            [
                { name: 'min_value', type: 'integer' },
                { name: 'avg_value', type: 'numeric' },
                { name: 'max_value', type: 'integer' },
                { name: 'total_rows', type: 'integer' },
            ],
        ) as BaseConnection,
        connectionId: 'conn_123',
        tabId: 'tab_1',
    });

    assert.equal(response.session.status, 'done');
    assert.equal(response.session.steps.length, 3);
    assert.equal(response.session.outcome?.headline, '分布最高值为 22');
    assert.ok(response.session.outcome?.followups.some(item => item.id === 'filter-outliers'));
}

async function testTrendAnalysis() {
    const response = await runAnalysis({
        request: baseRequest('view-time-trend'),
        connection: makeConnection(
            [
                { bucket: '2025-01-01T00:00:00.000Z', total_rows: 3 },
                { bucket: '2025-01-01T01:00:00.000Z', total_rows: 7 },
            ],
            [
                { name: 'bucket', type: 'timestamp' },
                { name: 'total_rows', type: 'integer' },
            ],
        ) as BaseConnection,
        connectionId: 'conn_123',
        tabId: 'tab_1',
    });

    assert.equal(response.session.status, 'done');
    assert.ok(response.session.outcome?.headline.includes('趋势覆盖'));
    assert.ok(response.session.outcome?.followups.some(item => item.id === 'view-distribution'));
}

async function testErrorStateWhenMeasureMissing() {
    const request = baseRequest('view-distribution');
    request.context.resultContext.columns = [{ name: 'service', dataType: 'text', semanticType: 'dimension' }];

    const response = await runAnalysis({
        request,
        connection: makeConnection([], []) as BaseConnection,
        connectionId: 'conn_123',
        tabId: 'tab_1',
    });

    assert.equal(response.session.status, 'error');
    assert.ok(response.session.steps.some(step => step.status === 'error'));
    assert.equal(response.session.outcome?.headline, '分析执行失败');
}

await testDistributionAnalysis();
await testTrendAnalysis();
await testErrorStateWhenMeasureMissing();

console.log('run-analysis tests passed');
