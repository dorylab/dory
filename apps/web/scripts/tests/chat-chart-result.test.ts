import assert from 'node:assert/strict';
import test from 'node:test';
import type { ModelMessage } from 'ai';

import { buildQueryChart, getChartResultFromPart } from '@/lib/agent-runs/chart-result';
import { createChartBuilderTool } from '@/app/api/chat/tools/chart-builder';

const rows = [
    { status: 'succeeded', count: 7829 },
    { status: 'failed', count: 375 },
];
const config = { chartType: 'bar' as const, title: '支付状态分布', xKey: 'status', yKeys: [{ key: 'count' }] };
const saved = { result: rows, columns: [{ name: 'status' }, { name: 'count' }], artifacts: [{ artifactId: 'payments' }] };
const legacy = { type: 'sql-result', ok: true, previewRows: rows, artifactIds: ['payments'] };
const messages = (output: unknown, sdk = false) => [
    { role: 'user', content: 'Chart payments' },
    {
        role: 'tool',
        content: [{ type: 'tool-result', toolName: 'sqlRunner', toolCallId: 'sql-1', ...(sdk ? { output: { type: 'json', value: output } } : { result: output }) }],
    },
];

test('chart builder consumes single and multi-source query results and persists the source', async () => {
    for (const output of [saved, legacy]) {
        const tool = createChartBuilderTool('en');
        const result = await tool.execute!(config, { toolCallId: 'chart-1', context: {}, messages: messages(output, true) as ModelMessage[] });
        assert.ok('data' in result);
        assert.equal(result.dataState, 'ready');
        assert.equal(result.embed, '![Chart](dory://chart/chart-1)');
        assert.equal(result.source?.toolCallId, 'sql-1');
        assert.equal(result.source?.artifactId, 'payments');
        assert.deepEqual(result.source?.columns, output === saved ? ['status', 'count'] : []);
        assert.ok(JSON.stringify(result.data).includes('7829'));
        assert.ok(JSON.stringify(result.data).includes('375'));
        assert.deepEqual(getChartResultFromPart({ type: 'tool-chartBuilder', output: JSON.parse(JSON.stringify(result)) })?.data, result.data);
    }
});

test('latest query failure, empty or pending output never falls back to older data', () => {
    for (const [output, state] of [
        [{ ...saved, result: [] }, 'empty'],
        [{ ok: false, error: 'failed' }, 'missing'],
        [undefined, 'missing'],
    ] as const) {
        const history = [...messages(saved), { role: 'assistant', parts: [{ type: 'tool-sqlRunner', toolCallId: 'sql-2', output }] }];
        const result = buildQueryChart(config, history);
        assert.deepEqual(result.data, []);
        assert.equal(result.dataState, state);
        assert.equal(result.source?.toolCallId, 'sql-2');
    }
    assert.equal(buildQueryChart(config, [...messages(saved), { role: 'user', content: 'Next turn' }]).dataState, 'missing');
});

test('a follow-up chart explicitly resolves its saved Artifact instead of consuming older message rows', async () => {
    const oldMessages = [...messages(saved, true), { role: 'user', content: 'Chart the previous result' }] as ModelMessage[];
    let selected: string | undefined;
    const tool = createChartBuilderTool('en', async artifactId => {
        selected = artifactId;
        return {
            source: { artifactId, toolCallId: undefined },
            result: { type: 'sql-result', ok: true, sql: '', database: 'main', previewRows: [{ status: 'verified', count: 42 }], columns: [] },
        };
    });
    const options = { toolCallId: 'followup-chart', context: {}, messages: oldMessages };
    await assert.rejects(tool.execute!({ ...config }, options) as Promise<unknown>, /Pass the artifactId/);
    const result = await tool.execute!({ ...config, artifactId: 'payments' }, options);
    assert.ok('data' in result);
    assert.equal(selected, 'payments');
    assert.equal(result.source?.artifactId, 'payments');
    assert.deepEqual(result.source?.columns, []);
    assert.deepEqual(result.data, [{ status: 'verified', count: 42 }]);
    assert.equal(result.dataState, 'ready');
});

test('missing data, invalid fields and inaccessible saved results fail instead of returning completed empty charts', async () => {
    const options = { toolCallId: 'bad-chart', context: {}, messages: messages(saved, true) as ModelMessage[] };
    const tool = createChartBuilderTool('en');
    await assert.rejects(tool.execute!({ ...config, yKeys: [{ key: 'unknown' }] }, options) as Promise<unknown>, /Chart fields do not match/);
    await assert.rejects(tool.execute!({ ...config, artifactId: 'payments' }, options) as Promise<unknown>, /active Dory Run/);
    const denied = createChartBuilderTool('en', async () => {
        throw new Error('Evidence is outside the selected analysis scope.');
    });
    await assert.rejects(denied.execute!({ ...config, artifactId: 'payments' }, options) as Promise<unknown>, /outside the selected analysis scope/);
});

test('history repair is read-only, requires matching explicit fields, and preserves new empty states', () => {
    const part = { type: 'tool-chartBuilder', output: { type: 'chart', ...config, data: [] } };
    const snapshot = structuredClone(part);
    const repaired = getChartResultFromPart(part, messages(saved));
    assert.equal(repaired?.dataState, 'ready');
    assert.deepEqual(part, snapshot);
    assert.equal(getChartResultFromPart({ ...part, output: { ...part.output, xKey: 'unrelated' } }, messages(saved))?.dataState, 'invalid-fields');
    assert.equal(getChartResultFromPart({ ...part, output: { ...part.output, xKey: undefined } }, messages(saved))?.dataState, 'invalid-fields');
    assert.equal(getChartResultFromPart({ ...part, output: { ...part.output, dataState: 'empty' } }, messages(saved))?.dataState, 'empty');
    assert.deepEqual(getChartResultFromPart(part, [{ role: 'assistant', parts: [part] }])?.data, []);
    assert.equal(buildQueryChart(config, messages({ ...saved, result: [{ status: 'failed', count: 'bad' }] })).dataState, 'invalid-fields');
    assert.equal(buildQueryChart(config, messages({ ...saved, result: [{ status: 'failed', count: 0 }] })).dataState, 'ready');
});

test('malformed stored chart fields cannot crash history rendering', () => {
    assert.doesNotThrow(() => getChartResultFromPart({ type: 'tool-chartBuilder', output: { type: 'chart', chartType: 'bar', yKeys: 'count', data: null } }, messages(saved)));
});

test('attachment queries provide chart evidence and multiple matching results require an explicit Artifact', async () => {
    const attachment = {
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolName: 'queryAttachment',
                toolCallId: 'attachment-query',
                output: {
                    type: 'json',
                    value: { rows, columns: [{ name: 'status' }, { name: 'count' }], rowCount: 2, artifactId: 'attachment-artifact', previewTruncated: false },
                },
            },
        ],
    };
    const history = [{ role: 'user', content: 'Chart uploaded customers' }, attachment];
    const chart = buildQueryChart({ chartType: 'pie', categoryKey: 'status', valueKey: 'count' }, history);
    assert.equal(chart.dataState, 'ready');
    assert.equal(chart.source?.artifactId, 'attachment-artifact');
    assert.equal(buildQueryChart(config, [...messages(saved), attachment]).dataState, 'missing');
    for (const count of [-1, null, '', 'bad', 0]) {
        const invalid = messages({ ...saved, result: [{ status: 'active', count }] });
        assert.equal(buildQueryChart({ chartType: 'pie', categoryKey: 'status', valueKey: 'count' }, invalid).dataState, 'invalid-fields');
    }
});

test('truncated query previews remain labeled and cannot become complete pie proportions', () => {
    const history = messages({ ...saved, truncated: true, rowCount: 1000 });
    assert.equal(buildQueryChart(config, history).source?.truncated, true);
    assert.equal(buildQueryChart(config, history).source?.rowCount, 1000);
    assert.equal(buildQueryChart({ chartType: 'pie', categoryKey: 'status', valueKey: 'count' }, history).dataState, 'incomplete');
});

test('chronological metadata survives tool serialization, with separate numeric series', async () => {
    const tool = createChartBuilderTool('en');
    const result = await tool.execute!(
        {
            chartType: 'bar',
            title: 'Annual performance',
            xKey: 'year',
            yKeys: [
                { key: 'revenue', label: 'Revenue' },
                { key: 'profit', label: 'Profit' },
            ],
            options: { valueFormat: { scale: 100000000, suffix: '亿元', precision: 2 }, xAxisLabel: 'Fiscal year' },
        },
        {
            toolCallId: 'chronological',
            context: {},
            messages: messages({
                ...saved,
                result: [
                    { year: 2026, revenue: 1000000000, profit: -100000000 },
                    { year: 2024, revenue: 2000000000, profit: null },
                    { year: 2025, revenue: 1500000000, profit: 100000000 },
                ],
            }) as ModelMessage[],
        },
    );
    const restored = getChartResultFromPart({ output: JSON.parse(JSON.stringify(result)) })!;
    assert.equal(restored.options?.xKeyType, 'time');
    assert.equal(restored.options?.sortDirection, 'asc');
    assert.equal(restored.options?.valueFormat?.scale, 100000000);
    assert.equal(restored.yKeys?.length, 2);
    assert.equal(restored.data.find(row => row.year === 2024)?.profit, null);
});

test('long-form and mixed-period duplicates require a new query rather than implicit aggregation', async () => {
    const input = { chartType: 'line' as const, xKey: 'year', yKeys: [{ key: 'amount' }] };
    const history = messages({
        ...saved,
        result: [
            { year: 2025, metric: 'revenue', amount: 100 },
            { year: 2025, metric: 'profit', amount: 10 },
        ],
    });
    assert.equal(buildQueryChart(input, history).dataState, 'duplicate-x');
    await assert.rejects(
        createChartBuilderTool('en').execute!(input, { toolCallId: 'duplicates', context: {}, messages: history as ModelMessage[] }) as Promise<unknown>,
        /Repeated X values/,
    );
    // Inferred axes cannot silently aggregate the same ambiguous source either.
    assert.equal(buildQueryChart({ chartType: 'line' }, history).dataState, 'duplicate-x');
});
