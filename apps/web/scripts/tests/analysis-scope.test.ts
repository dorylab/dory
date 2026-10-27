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

test('multi-database scopes reject empty ranges and keep legacy and automatic semantics', () => {
    const scope = { connectionIds: ['a'], databasesByConnection: { a: ['sales', 'analytics'] } };
    assert.deepEqual(analysisScopeSchema.parse(scope), scope);
    for (const value of [[], [''], ['sales', '']]) {
        assert.throws(() => analysisScopeSchema.parse({ connectionIds: ['a'], databasesByConnection: { a: value } }));
    }
    assert.throws(() => analysisScopeSchema.parse({ connectionIds: ['a'], databasesByConnection: { b: ['sales'] } }));
    for (const tool of ['dory_explore_schema', 'dory_get_schema_graph', 'dory_run_readonly_sql']) {
        for (const database of ['sales', 'analytics']) {
            const input = { connectionId: 'a', database };
            assert.deepEqual(applyAnalysisDatabase(scope, tool, input), input);
        }
        assert.throws(() => applyAnalysisDatabase(scope, tool, { connectionId: 'a' }), /explicit database/);
        assert.throws(() => applyAnalysisDatabase(scope, tool, { connectionId: 'a', database: 'private' }), /does not match/);
        assert.deepEqual(applyAnalysisDatabase({ connectionIds: ['a'], databasesByConnection: { a: ['sales'] } }, tool, { connectionId: 'a' }), {
            connectionId: 'a',
            database: 'sales',
        });
    }
    assert.doesNotThrow(() => applyAnalysisDatabase(scope, 'dory_explore_schema', { connectionId: 'a', operation: 'list_databases' }));
    assert.throws(() => applyAnalysisDatabase(scope, 'dory_explore_schema', { connectionId: 'a', operation: 'search' }), /explicit database/);
    assert.throws(() => applyAnalysisDatabase({ connectionIds: ['a'], databasesByConnection: { a: [] } }, 'dory_run_readonly_sql', { connectionId: 'a', database: 'sales' }));
});

test('database membership is shared across references and evidence without widening empty scopes', async () => {
    const { getAnalysisDatabases, isAnalysisDatabaseAllowed } = await import('@dory/shared/utils/analysis-scope');
    assert.deepEqual(getAnalysisDatabases({ connectionIds: ['a'], databasesByConnection: { a: 'sales' } }, 'a'), ['sales']);
    assert.equal(getAnalysisDatabases({ connectionIds: ['a'] }, 'a'), undefined);
    const scope = { connectionIds: ['a'], databasesByConnection: { a: ['sales', 'analytics'] } };
    for (const database of ['sales', 'analytics']) assert.equal(isAnalysisDatabaseAllowed(scope, 'a', database), true);
    for (const database of ['private', '', null, undefined]) assert.equal(isAnalysisDatabaseAllowed(scope, 'a', database), false);
    assert.equal(isAnalysisDatabaseAllowed({ connectionIds: ['a'], databasesByConnection: { a: [] } }, 'a', 'sales'), false);
    assert.equal(isAnalysisDatabaseAllowed({ connectionIds: ['a'] }, 'a', 'sales'), true);
});
