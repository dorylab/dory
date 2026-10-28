import assert from 'node:assert/strict';
import test from 'node:test';

import { chatToolFailure } from '@dory/shared/types/chat-tool-error';
import { resolveReportChatCharts } from '@/lib/server/report-chat-charts';

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

test('an invalid reference with a draft revision is not mislabeled as a version conflict', () => {
    const failure = chatToolFailure(new Error('WORK_REFERENCE_INVALID: bad reference. Draft exists: documentId=doc-1, revision=1.'), 'createWorkReport');
    assert.equal(failure.code, 'INVALID_FIELDS');
    assert.match(failure.recovery, /draft/);
});
