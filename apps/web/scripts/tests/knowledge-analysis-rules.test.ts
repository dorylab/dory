import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveKnowledgeAnalysisRules } from '../../lib/server/knowledge-analysis-rules';

test('analysis loads the current shared rules once per turn and asks before choosing among matching bases', async () => {
    const candidates = [
        { modelId: 'shared', name: 'Shared', connectionId: 'one', sourceId: 'rules' },
        { modelId: 'shared', name: 'Shared', connectionId: 'two', sourceId: 'rules' },
    ];
    const reads: string[] = [];
    let body = 'Version one';
    const store = {
        async listAnalysisRuleCandidates(org: string, ids: string[]) {
            assert.equal(org, 'org');
            return candidates.filter(row => ids.includes(row.connectionId));
        },
        async getAnalysisRules(org: string, id: string) {
            assert.equal(org, 'org');
            reads.push(id);
            return id === 'shared' ? { id: 'rules', contentText: body } : null;
        },
    };
    const scope = { connectionIds: ['one', 'two'] };
    assert.match((await resolveKnowledgeAnalysisRules(store, 'org', scope))!.instruction, /Version one/);
    assert.deepEqual(reads, ['shared']);
    body = 'Version two';
    candidates.push({ modelId: 'other', name: 'Other', connectionId: 'one', sourceId: 'different' });
    const ambiguous = await resolveKnowledgeAnalysisRules(store, 'org', scope);
    assert.equal(ambiguous?.modelId, null);
    assert.match(ambiguous!.instruction, /ask the user to select/);
    assert.match(ambiguous!.instruction, /dory:\/\/knowledge\/shared\/sources\/rules/);
    assert.deepEqual(reads, ['shared']);
    assert.match((await resolveKnowledgeAnalysisRules(store, 'org', { ...scope, knowledgeMode: 'manual', knowledgeModelId: 'shared' }))!.instruction, /Version two/);
    assert.equal(await resolveKnowledgeAnalysisRules(store, 'org', { ...scope, knowledgeMode: 'none' }), null);
    assert.equal(await resolveKnowledgeAnalysisRules(store, 'org', { connectionIds: ['unrelated'] }), null);
    assert.equal(await resolveKnowledgeAnalysisRules(store, 'org', { ...scope, knowledgeModelId: 'legacy' }), null);
    assert.deepEqual(reads, ['shared', 'shared', 'legacy']);
});
