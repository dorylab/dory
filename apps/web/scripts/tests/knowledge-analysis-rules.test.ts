import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;

const { resolveSemanticModelContext } = await import('@/lib/server/semantic-model-context');

test('load all applicable rules once; defer oversized and newly discovered bases', async () => {
    const reads: string[] = [];
    const db = {
        knowledge: {
            listAnalysisRuleCandidates: async (_org: string, ids: string[] | null, modelId?: string) =>
                ['shared', 'other', 'long', 'legacy', 'excluded']
                    .filter(id => !modelId || modelId === id)
                    .flatMap(id =>
                        (id === 'excluded' ? ['third'] : ['one', 'two'])
                            .filter(connectionId => !ids || ids.includes(connectionId))
                            .map(connectionId => ({ modelId: id, name: id, sourceId: id === 'legacy' ? null : 'rules', connectionId })),
                    ),
            getAnalysisRules: async (_org: string, id: string) => {
                reads.push(id);
                return { id: 'rules', contentText: id === 'long' ? 'x'.repeat(20001) : id + ' definition' };
            },
        },
    } as unknown as import('@dory/database').DBService;
    const result = await resolveSemanticModelContext(db, { organizationId: 'org', scope: { connectionIds: ['one', 'two'] } });
    assert.deepEqual(reads, ['shared', 'other', 'long']);
    assert.deepEqual(
        result.models.map(item => item.id),
        ['shared', 'other'],
    );
    assert.match(result.context!, /shared definition/);
    assert.match(result.context!, /other definition/);
    assert.match(result.context!, /readBeforeAnalysis":true/);
    assert.doesNotMatch(result.context!, /xxx|excluded/);
    reads.length = 0;
    for (const scope of [{}, { knowledgeMode: 'none' as const, connectionIds: ['one'] }]) {
        const lazy = await resolveSemanticModelContext(db, { organizationId: 'org', scope });
        assert.deepEqual(lazy.models, []);
    }
    assert.deepEqual(reads, []);
    const isolated = await resolveSemanticModelContext(db, {
        organizationId: 'org',
        scope: { knowledgeMode: 'manual', knowledgeModelId: 'excluded', connectionIds: ['one'] },
        allowedConnectionIds: ['one', 'two'],
    });
    assert.deepEqual(isolated.models, []);
});
