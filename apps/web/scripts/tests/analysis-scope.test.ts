import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAnalysisDatabase } from '@/lib/work-documents/analysis-scope';
import { analysisScopeSchema } from '@/lib/work-documents/schema';

test('database scope accepts legacy sessions and rejects selections for unrelated connections', () => {
    assert.deepEqual(analysisScopeSchema.parse({ connectionIds: ['a'] }), { connectionIds: ['a'] });
    assert.throws(() => analysisScopeSchema.parse({ connectionIds: ['a'], databasesByConnection: { b: 'private' } }), /selected data sources/);
    assert.throws(() => analysisScopeSchema.parse({ connectionIds: ['a'], databasesByConnection: { a: '' } }));
});

test('schema, graph and SQL tools resolve the selected database without changing legacy requests', () => {
    const scope = { connectionIds: ['a', 'b'], databasesByConnection: { a: 'sales', b: 'ads' } };
    for (const tool of ['dory_explore_schema', 'dory_get_schema_graph', 'dory_run_readonly_sql']) {
        assert.deepEqual(applyAnalysisDatabase(scope, tool, { connectionId: 'b' }), { connectionId: 'b', database: 'ads' });
        assert.throws(() => applyAnalysisDatabase(scope, tool, { connectionId: 'b', database: 'sales' }), /does not match/);
        assert.deepEqual(applyAnalysisDatabase({ connectionIds: ['a'] }, tool, { connectionId: 'a', database: 'old' }), { connectionId: 'a', database: 'old' });
    }
    assert.deepEqual(applyAnalysisDatabase(scope, 'dory_search_assets', { connectionId: 'a' }), { connectionId: 'a' });
});
