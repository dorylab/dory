import assert from 'node:assert/strict';
import test from 'node:test';

import { chatToolFailure } from '@dory/shared/types/chat-tool-error';
import { buildChartFromQuery } from '@/lib/agent-runs/chart-result';
import { reportChatChartAxes, resolveReportChatCharts } from '@/lib/server/report-chat-charts';
import type { WorkEvidence } from '@dory/shared/types/work-document';

const chart = { type: 'chart', chartType: 'line', title: 'Trend', xKey: 'month', yKeys: [{ key: 'revenue' }], source: { artifactId: 'orders' }, dataState: 'ready', data: [] };
const output = (value: unknown) => ({ role: 'tool', content: [{ type: 'tool-result', toolName: 'chartBuilder', toolCallId: 'call-1', output: { type: 'json', value } }] });

test('only unambiguous completed chart outputs become report visuals', () => {
    const body = '![Chart](dory://chart/call-1)\n\n```\n![Chart](dory://chart/call-1)\n```';
    const converted = resolveReportChatCharts(body, [], [output(chart)], false);
    assert.match(converted.body, /^!\[Chart\]\(dory:\/\/visual\/chat-chart-/);
    assert.match(converted.body, /```\n!\[Chart\]\(dory:\/\/chart\/call-1\)\n```/);
    assert.equal(converted.visuals[0].evidenceId, 'orders');
    assert.equal(resolveReportChatCharts(body, [], [output(chart), output({ ...chart, source: { artifactId: 'other' } })], false).body, body);
    assert.equal(resolveReportChatCharts(body, [], [output({ ...chart, dataState: 'missing' })], false).body, body);
});

const evidence: WorkEvidence = {
    artifactId: 'orders',
    title: 'Orders by continent',
    connectionId: 'orders',
    connectionName: 'Orders',
    sql: 'SELECT continent, COUNT(*) AS order_count FROM orders GROUP BY continent',
    runId: 'run-1',
    capturedAt: '2026-11-02T00:00:00Z',
    columns: ['continent', 'order_count'],
    rows: [
        { continent: 'Asia', order_count: 42 },
        { continent: 'Europe', order_count: 18 },
    ],
    rowCount: 2,
    truncated: false,
};
const automaticChart = (rows = evidence.rows, input = {}) =>
    buildChartFromQuery(
        { chartType: 'bar', ...input },
        {
            source: { artifactId: 'orders', toolCallId: 'sql-1' },
            result: { type: 'sql-result', ok: true, sql: '', database: 'main', previewRows: rows, columns: [] },
        },
    );

test('automatic chart axes are restored from verified evidence rather than internal display keys', () => {
    const chart = automaticChart();
    assert.equal(chart.xKey, 'xLabel');
    assert.equal(chart.yKeys?.[0].key, '__value__');
    const converted = resolveReportChatCharts('![Chart](dory://chart/call-1)', [], [output(chart)], true);
    const source = converted.charts.get(converted.visuals[0].id)!;
    assert.deepEqual(reportChatChartAxes(source, evidence), {
        type: 'bar',
        xKey: 'continent',
        yKeys: [{ key: 'order_count', label: 'Sum(order_count)' }],
    });
    assert.equal(reportChatChartAxes(source, { ...evidence, artifactId: 'other' }), undefined);
    assert.equal(reportChatChartAxes(source, { ...evidence, truncated: true }), undefined);
    assert.equal(reportChatChartAxes({ ...source, chart: { ...chart, data: [{ ...chart.data[0], __value__: 999 }, chart.data[1]] } }, evidence), undefined);
});

test('derived counts, duplicate categories and bucketed charts cannot silently change into raw report axes', () => {
    for (const rows of [
        [{ continent: 'Asia' }, { continent: 'Europe' }],
        [...evidence.rows, { continent: 'Asia', order_count: 9 }],
        Array.from({ length: 35 }, (_, index) => ({ continent: `Region ${index}`, order_count: index + 10 })),
    ]) {
        assert.equal(reportChatChartAxes({ chart: automaticChart(rows), input: {} }, { ...evidence, rows, rowCount: rows.length }), undefined);
    }
});

test('an invalid reference with a draft revision is not mislabeled as a version conflict', () => {
    const failure = chatToolFailure(new Error('WORK_REFERENCE_INVALID: bad reference. Draft exists: documentId=doc-1, revision=1.'), 'createWorkReport');
    assert.equal(failure.code, 'INVALID_FIELDS');
    assert.match(failure.recovery, /draft/);
});

test('a chart column failure remains an argument error when creation returns a draft revision', () => {
    for (const prefix of ['', 'WORK_REFERENCE_INVALID: ']) {
        const failure = chatToolFailure(new Error(`${prefix}Chart columns do not match its evidence. Draft exists: documentId=doc-1, revision=1.`), 'createWorkReport');
        assert.equal(failure.code, 'INVALID_FIELDS');
        assert.equal(failure.retryable, true);
    }
    const conflict = chatToolFailure(new Error('Report changed. Read the latest version before editing. Draft exists: documentId=doc-1, revision=1.'), 'createWorkReport');
    assert.equal(conflict.code, 'REPORT_CONFLICT');
});
