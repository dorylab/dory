import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMERCE_EVALUATION_KNOWLEDGE_NAME } from '@/lib/demo/commerce-agent-evaluation';
import { COMMERCE_EVALUATION_SCENARIOS } from '@/lib/demo/commerce-agent-evaluation-knowledge';

import { normalizeArtifactRows, replayCommerceEvaluation, toolPayload } from '../commerce-agent-evaluation-mcp-replay';

function replayFixture(corruptArtifact = false, omitMetric = false) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let index = -1;
    return {
        calls,
        call: async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
            calls.push({ name, args });
            if (name === 'dory_create_work') index += 1;
            const scenario = COMMERCE_EVALUATION_SCENARIOS[index];
            const workId = `work-${index}`;
            switch (name) {
                case 'dory_create_work':
                    return {
                        workId,
                        semanticContext: scenario.expectedSemanticIds.join(' '),
                        semanticModelsUsed: [
                            {
                                id: 'model',
                                name: COMMERCE_EVALUATION_KNOWLEDGE_NAME,
                                ossieVersion: '0.2.0.dev0',
                                modelRevision: 'a'.repeat(64),
                                metricNames: omitMetric && index === 0 ? [] : scenario.expectedSemanticIds.filter(id => id.startsWith('metric:')).map(id => id.split(':')[1]),
                                relationshipNames: scenario.expectedSemanticIds.filter(id => id.startsWith('relationship:')).map(id => id.split(':')[1]),
                            },
                        ],
                    };
                case 'dory_search_assets':
                    return { assets: [{ ref: 'dory://knowledge/model/definition' }] };
                case 'dory_run_readonly_sql':
                    return { result: scenario.expectedRows, truncated: false, artifacts: [{ artifactId: `artifact-${index}` }], workspaceUrl: `http://localhost/work/${workId}` };
                case 'dory_artifacts':
                    return {
                        artifact: { workId },
                        preview: {
                            limited: false,
                            rows:
                                corruptArtifact && index === 0
                                    ? []
                                    : scenario.expectedRows.map(row =>
                                          Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value])),
                                      ),
                        },
                    };
                default:
                    return {};
            }
        },
    };
}

test('replay validates five scenarios without fabricating Agent-authored analytical findings', async () => {
    const fixture = replayFixture();
    const report = await replayCommerceEvaluation(fixture.call, 'connection');
    assert.equal(report.ok, true);
    assert.equal(report.scenarios.length, 5);
    const finished = fixture.calls.filter(call => call.name === 'dory_finish_work');
    assert.equal(finished.length, 5);
    for (let index = 0; index < 5; index += 1) {
        assert.equal(finished[index].args.status, 'completed');
        assert.deepEqual(finished[index].args.findings, []);
        assert.deepEqual(report.scenarios[index].evidenceArtifactIds, [`artifact-${index}`]);
        assert.deepEqual(report.scenarios[index].actualRows, COMMERCE_EVALUATION_SCENARIOS[index].expectedRows);
        assert.ok((finished[index].args.steps as string[]).length > 0);
    }
    assert.equal(fixture.calls[0].name, 'dory_create_work');
    assert.equal(fixture.calls[1].name, 'dory_search_assets');
});

test('replay marks corrupted persisted evidence as failed and continues remaining scenarios', async () => {
    const fixture = replayFixture(true);
    const report = await replayCommerceEvaluation(fixture.call, 'connection');
    assert.equal(report.ok, false);
    assert.equal(report.scenarios[0].status, 'failed');
    assert.ok(report.scenarios.slice(1).every(item => item.status === 'passed'));
    const finish = fixture.calls.find(call => call.name === 'dory_finish_work');
    assert.equal(finish?.args.status, 'error');
    assert.deepEqual(finish?.args.findings, []);
});

test('replay rejects a missing selected metric before explicit Knowledge discovery', async () => {
    const fixture = replayFixture(false, true);
    const report = await replayCommerceEvaluation(fixture.call, 'connection');
    assert.equal(report.ok, false);
    assert.equal(report.scenarios[0].status, 'failed');
    assert.equal(fixture.calls[1].name, 'dory_finish_work');
});

test('replay bounds failure steps while retaining the full error in its report', async () => {
    const fixture = replayFixture();
    const message = 'Artifact mismatch: '.repeat(100);
    const report = await replayCommerceEvaluation(async (name, args) => {
        if (name === 'dory_artifacts') throw new Error(message);
        if (name === 'dory_finish_work') {
            assert.ok((args.steps as string[]).every(step => step.length <= 500));
        }
        return fixture.call(name, args);
    }, 'connection');
    assert.equal(report.ok, false);
    assert.ok(report.scenarios.every(item => item.error === message));
    assert.equal(fixture.calls.filter(call => call.name === 'dory_finish_work' && call.args.status === 'error').length, 5);
});

test('replay reports a failed finalization instead of silently losing it', async t => {
    const fixture = replayFixture(true);
    const errors: unknown[][] = [];
    t.mock.method(console, 'error', (...args: unknown[]) => errors.push(args));
    const report = await replayCommerceEvaluation(async (name, args) => {
        if (name === 'dory_finish_work' && args.status === 'error') throw new Error('Finalization unavailable');
        return fixture.call(name, args);
    }, 'connection');
    assert.equal(report.scenarios[0].status, 'failed');
    assert.equal(report.scenarios[0].finishError, 'Finalization unavailable');
    assert.equal(errors.length, 1);
    assert.ok(report.scenarios.slice(1).every(item => item.status === 'passed'));
});

test('MCP error envelopes cannot be treated as successful tool payloads', () => {
    assert.throws(() => toolPayload({ isError: true, structuredContent: {} }));
    assert.throws(() => toolPayload({ structuredContent: { error: { message: 'Denied' } } }));
});

test('Artifact normalization preserves identifiers, nulls and invalid numeric cells', () => {
    assert.deepEqual(normalizeArtifactRows([{ id: '001', count: '38', rate: '', nullable: null }], [{ id: '001', count: 38, rate: 1, nullable: null }]), [
        { id: '001', count: 38, rate: '', nullable: null },
    ]);
});
