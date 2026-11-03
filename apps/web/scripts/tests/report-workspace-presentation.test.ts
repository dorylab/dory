import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkDocumentContent, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';

import { editableReport } from '@/lib/work-documents/report-core';
import {
    chartFields,
    flattenReportStructure,
    remapChartFields,
    reportNodePath,
    reportStructure,
    resultUsedBy,
    workspaceErrorMessage,
} from '@/lib/work-documents/workspace-presentation';

const chart: WorkVisual = {
    id: 'chart',
    type: 'chart',
    title: 'Errors',
    evidenceId: 'data',
    chartSpec: {
        version: 1,
        chartType: 'bar',
        xKey: 'service',
        yKey: 'sum:count',
        groupKey: 'region',
        filters: [{ col: 'status', kind: 'string', op: 'equals', value: 'error' }],
        search: { text: 'api', columns: ['service'] },
    },
};

test('structure preserves nested sections, linked findings in lists and paragraph order', () => {
    const content: WorkDocumentContent = editableReport({
        markdown:
            '# Overview\n\nIntro.\n\n## Details\n\n- Errors increased. [Evidence](dory://evidence-group/first)\n- Traffic unchanged. [Evidence](dory://evidence-group/second)\n\n![Errors](dory://visual/chart)\n\n## Next\n\nOther text.',
        visuals: [chart],
        evidence: [],
        knowledge: [],
        evidenceGroups: [
            { id: 'first', references: [] },
            { id: 'second', references: [] },
        ],
    });
    const root = reportStructure(content);
    const nodes = flattenReportStructure(root);
    const details = nodes.find(node => node.title === 'Details')!;
    assert.deepEqual(
        details.children.map(node => node.kind),
        ['finding', 'finding', 'chart'],
    );
    assert.equal(details.children[0].groupId, 'first');
    assert.equal(details.children[1].groupId, 'second');
    assert.deepEqual(reportNodePath(nodes, 'chart'), ['Overview', 'Details', 'Errors']);
    assert.equal(nodes.filter(node => node.kind === 'finding').length, 2);
    assert.equal(root.children[0].children[0].kind, 'text');
});

test('mapping covers aggregation, grouping, filters and search without changing original chart', () => {
    const next = remapChartFields(chart, { service: 'app', count: 'total', region: 'country', status: 'level' });
    assert.deepEqual(chartFields(next), ['app', 'total', 'country', 'level']);
    assert.equal(next.chartSpec!.yKey, 'sum:total');
    assert.equal(next.chartSpec!.filters![0].col, 'level');
    assert.deepEqual(next.chartSpec!.search!.columns, ['app']);
    assert.equal(chart.chartSpec!.xKey, 'service');
});

test('adoption compares result identity and normalized chart config, not SQL or object key order', () => {
    const evidence = { artifactId: 'data' } as WorkEvidence;
    assert.equal(resultUsedBy([chart], evidence).length, 1);
    assert.equal(resultUsedBy([chart], evidence, { ...chart.chartSpec!, chartColorPreset: 'blue' }).length, 1);
    assert.equal(resultUsedBy([chart], evidence, { ...chart.chartSpec!, chartType: 'line' }).length, 0);
    assert.equal(resultUsedBy([chart], { artifactId: 'other' } as WorkEvidence).length, 0);
});

test('database SQL is hidden while actionable short errors remain visible', () => {
    assert.equal(workspaceErrorMessage(new Error('Failed query: select token from credentials params: secret'), 'Retry'), 'Retry');
    assert.equal(workspaceErrorMessage(new Error('The draft changed. Reload to continue.'), 'Retry'), 'The draft changed. Reload to continue.');
});
