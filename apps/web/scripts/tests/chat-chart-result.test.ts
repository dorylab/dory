import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQueryChart, getChartResultFromPart } from '@/lib/agent-runs/chart-result';
import { createChartBuilderTool } from '@/app/api/chat/tools/chart-builder';
import type { ModelMessage } from 'ai';

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
        assert.deepEqual(result.source, { toolCallId: 'sql-1', artifactId: 'payments' });
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
