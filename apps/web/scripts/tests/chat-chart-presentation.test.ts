import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChartResultPart } from '@dory/shared/types/chat-chart';
import { chartRows, chartTime, chartTimeRange, effectiveChart, formatChartNumber, getChartOverride, readStoredChart } from '@dory/shared/utils/chat-chart';

import { CHART_BUILDER_INPUT_SCHEMA } from '@/lib/ai/cloud-tools';
import { chartPresentationSchema } from '@/lib/charts/schema';
import { resolveReportChatCharts } from '@/lib/server/report-chat-charts';
import { workChartSvg } from '@/lib/work-documents/render';

const base: ChartResultPart = {
    type: 'chart',
    chartType: 'line',
    xKey: 'year',
    yKeys: [{ key: 'value' }],
    data: [
        { year: 2026, value: -1 },
        { year: 2024, value: null },
        { year: 2025, value: 2 },
    ],
};
test('sorts calendar periods and preserves missing values without mutating evidence', () => {
    const original = JSON.stringify(base);
    assert.deepEqual(
        chartRows(base).map(row => row.year),
        [2024, 2025, 2026],
    );
    assert.equal(chartRows(base)[0].value, null);
    assert.deepEqual(chartTimeRange(base), ['2024', '2026']);
    for (const years of [
        ['2026', '2024', '2025'],
        ['FY2026-Q1', 'FY2024-Q4', 'FY2025-Q2'],
        ['2026-02', '2024-11', '2025-01'],
        ['2026-02-03', '2024-11-02', '2025-01-01'],
    ]) {
        assert.deepEqual(
            chartRows({ ...base, data: years.map(year => ({ year, value: 1 })) }).map(row => row.year),
            [years[1], years[2], years[0]],
        );
    }
    assert.deepEqual(
        chartRows({ ...base, options: { sortDirection: 'none' } }).map(row => row.year),
        [2026, 2024, 2025],
    );
    assert.deepEqual(
        chartRows({ ...base, options: { sortBy: 'x', sortDirection: 'desc' } }).map(row => row.year),
        [2026, 2025, 2024],
    );
    assert.equal(JSON.stringify(base), original);
    assert.equal(chartTime('customer-2025'), null);
    assert.equal(chartTime('2025-13'), null);
});

test('legacy field defaults and boolean categories still render without changing source rows', () => {
    const data = [
        { active: true, count: 2 },
        { active: false, count: 5 },
    ];
    const legacy = readStoredChart({ output: { type: 'chart', chartType: 'bar', data } });
    assert.ok(legacy);
    assert.equal(legacy.xKey, 'active');
    assert.deepEqual(legacy.yKeys, [{ key: 'count' }]);
    assert.deepEqual(chartRows(legacy), [
        { active: 'true', count: 2 },
        { active: 'false', count: 5 },
    ]);
    assert.deepEqual(chartRows(legacy, false), data);
    assert.equal(chartTimeRange(legacy), null);
});
test('category rankings and numeric identifiers are not treated as calendar dates', () => {
    const categories = {
        ...base,
        xKey: 'customer_id',
        data: [
            { customer_id: 2026, value: 9 },
            { customer_id: 2024, value: 2 },
        ],
    };
    assert.deepEqual(
        chartRows(categories).map(row => row.customer_id),
        [2026, 2024],
    );
    assert.deepEqual(
        chartRows({ ...base, options: { xKeyType: 'category' } }).map(row => row.year),
        [2026, 2024, 2025],
    );
});
test('formats display units without modifying numeric values and preserves options in history', () => {
    assert.equal(formatChartNumber(12345000000, { scale: 100000000, precision: 2, suffix: '亿元' }, 'zh'), '123.45亿元');
    assert.equal(formatChartNumber(null), '—');
    assert.equal(formatChartNumber(-3, { precision: 2, suffix: '%' }), '-3.00%');
    const value = { ...base, options: { xKeyType: 'time' as const, sortDirection: 'asc' as const, valueFormat: { scale: 100000000, suffix: '亿元' } } };
    assert.deepEqual(readStoredChart({ output: { type: 'json', value: JSON.parse(JSON.stringify(value)) } })?.options?.valueFormat, {
        scale: 100000000,
        suffix: '亿元',
        precision: undefined,
        prefix: undefined,
    });
    assert.equal(chartPresentationSchema.safeParse({ chartType: 'bar', data: [{ fake: 1 }] }).success, false);
    assert.ok(JSON.stringify(CHART_BUILDER_INPUT_SCHEMA).includes('sortDirection'));
    assert.ok(JSON.stringify(CHART_BUILDER_INPUT_SCHEMA).includes('artifactId'));
});
test('saved presentation is applied to chat/report copies and reset keeps its revision', () => {
    const metadata = {
        chartOverrides: {
            call: {
                version: 3,
                presentation: {
                    chartType: 'bar',
                    title: 'Edited',
                    xKey: 'year',
                    yKeys: [{ key: 'value', label: 'Revenue' }],
                    options: { sortDirection: 'asc', valueFormat: { suffix: '元' } },
                },
            },
        },
    };
    const chart = { ...base, dataState: 'ready' as const, source: { artifactId: 'evidence' } };
    assert.equal(effectiveChart(chart, metadata, 'call').title, 'Edited');
    assert.equal(chart.title, undefined);
    assert.deepEqual(getChartOverride({ chartOverrides: { call: { version: 4, presentation: null } } }, 'call'), { version: 4, presentation: null });
    const converted = resolveReportChatCharts(
        '![Chart](dory://chart/call)',
        [],
        [{ role: 'assistant', metadata, parts: [{ type: 'tool-chartBuilder', toolCallId: 'call', output: chart }] }],
        false,
    );
    assert.equal(converted.visuals[0].title, 'Edited');
    const repeated = resolveReportChatCharts(
        '![Chart](dory://chart/call)',
        [],
        [
            { role: 'assistant', metadata, parts: [{ type: 'tool-chartBuilder', toolCallId: 'call', output: chart }] },
            { role: 'tool', content: [{ type: 'tool-result', toolName: 'chartBuilder', toolCallId: 'call', output: { type: 'json', value: chart } }] },
        ],
        false,
    );
    assert.equal(repeated.visuals.length, 1);
    assert.equal(repeated.visuals[0].title, 'Edited');
    assert.equal(converted.visuals[0].chart?.options?.valueFormat?.suffix, '元');
    const svg = workChartSvg(converted.visuals[0], {
        artifactId: 'evidence',
        title: 'Test',
        columns: ['year', 'value'],
        rows: chart.data,
        capturedAt: '',
        truncated: false,
        connectionId: null,
        connectionName: null,
        sql: null,
        rowCount: 3,
        runId: null,
    });
    assert.ok(svg.includes('元'));
    assert.ok(svg.indexOf('2025') < svg.indexOf('2026'));
});

test('raw data exports retain numeric string precision, invalid dates stay invalid', () => {
    const value = {
        ...base,
        data: [
            { year: 2026, value: '1234567890123456789.0123' },
            { year: 2024, value: '1.23' },
        ],
    };
    assert.equal(chartRows(value, false)[1].value, '1234567890123456789.0123');
    assert.equal(chartTime('2025-02-30'), null);
    assert.ok(chartTime('FY24-Q4')! < chartTime('FY25-Q1')!);
});
