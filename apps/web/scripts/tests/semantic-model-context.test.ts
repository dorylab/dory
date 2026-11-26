import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;

const { resolveSemanticModelContext } = await import('@/lib/server/semantic-model-context');

test('a document-only knowledge base supplies only its current rules for the active connection', async () => {
    const knowledge = {
        listAnalysisRuleCandidates: async () => [{ modelId: 'model', name: 'Orders', connectionId: 'conn', sourceId: 'rules' }],
        getAnalysisRules: async () => ({ id: 'rules', contentText: 'Use paid orders.' }),
    };
    const result = await resolveSemanticModelContext({ knowledge } as unknown as import('@dory/database').DBService, { organizationId: 'org', scope: { connectionIds: ['conn'] } });
    assert.doesNotMatch(result.context!, /Sales guide/);
    assert.match(result.context!, /Use paid orders/);
    assert.match(result.models[0]!.modelRevision, /^[a-f0-9]{64}$/);
});
