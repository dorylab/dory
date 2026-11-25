import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;

const { resolveSemanticModelContext } = await import('@/lib/server/semantic-model-context');

test('a document-only knowledge base supplies its guide and current rules for the active connection', async () => {
    const updatedAt = new Date('2026-11-25T00:00:00Z');
    const scope = { organizationId: 'org', connectionId: 'conn' };
    const knowledge = {
        listModels: async (input: typeof scope) => {
            assert.deepEqual(input, scope);
            return [{ id: 'model', name: 'Orders', businessContextMd: '# Sales guide', updatedAt }];
        },
        listAnalysisRuleCandidates: async () => [{ modelId: 'model', name: 'Orders', connectionId: 'conn', sourceId: 'rules' }],
        getAnalysisRules: async () => ({ id: 'rules', contentText: 'Use paid orders.' }),
    };
    const result = await resolveSemanticModelContext({ knowledge } as unknown as import('@dory/database').DBService, scope);
    assert.match(result.context!, /Sales guide/);
    assert.match(result.context!, /Use paid orders/);
    assert.equal(result.models[0]?.modelRevision, updatedAt.toISOString());
});
