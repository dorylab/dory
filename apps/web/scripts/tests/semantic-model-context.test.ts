import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;

const { recordSemanticModelUsage, resolveSemanticModelContext } = await import('@/lib/server/semantic-model-context');

function model(options: { id: string; connectionId: string; synonym?: string; verified?: boolean; revision?: string; metricCount?: number }) {
    const verified = options.verified ?? true;
    const metrics = Array.from({ length: options.metricCount ?? 1 }, (_, index) => ({
        name: index ? `revenue_${index}` : 'revenue',
        expression: { dialects: [{ dialect: 'ANSI_SQL' as const, expression: 'SUM(orders.amount)' }] },
        ai_context: index ? undefined : { synonyms: [options.synonym ?? 'sales'] },
    }));
    return {
        id: options.id,
        name: options.id,
        description: null,
        ossieVersion: '0.1.1' as const,
        modelRevision: options.revision ?? `rev-${options.id}`,
        readiness: { status: 'ready' as const },
        model: {
            definitions: [
                { name: 'orders', kind: 'entity', status: verified ? 'verified' : 'unverified' },
                { name: 'amount', kind: 'dimension', status: verified ? 'verified' : 'unverified' },
                ...metrics.map(metric => ({ name: metric.name, kind: 'metric', status: verified ? 'verified' : 'unverified' })),
            ],
        },
        ossieDocument: {
            version: '0.1.1' as const,
            semantic_model: [
                {
                    name: options.id,
                    datasets: [
                        {
                            name: 'orders',
                            source: 'public.orders',
                            fields: [
                                {
                                    name: 'amount',
                                    expression: { dialects: [{ dialect: 'ANSI_SQL' as const, expression: 'amount' }] },
                                    ai_context: { synonyms: ['order value'] },
                                },
                            ],
                        },
                    ],
                    metrics,
                    relationships: [],
                },
            ],
        },
    };
}

function fakeDb(models: ReturnType<typeof model>[]) {
    const listInputs: unknown[] = [];
    return {
        listInputs,
        knowledge: {
            listModels: async (input: unknown) => {
                listInputs.push(input);
                return models;
            },
        },
    } as any;
}

test('resolver isolates by connection and matches synonyms with ANSI fallback', async () => {
    const db = fakeDb([model({ id: 'commerce', connectionId: 'connection-1', synonym: 'gmv' })]);
    const result = await resolveSemanticModelContext(db, {
        organizationId: 'org-1',
        connectionId: 'connection-1',
        question: 'Show GMV',
        dialect: 'SNOWFLAKE',
    });
    assert.deepEqual(db.listInputs, [{ organizationId: 'org-1', connectionId: 'connection-1' }]);
    assert.match(result.context ?? '', /Semantic Model Context/);
    assert.match(result.context ?? '', /SUM\(orders\.amount\)/);
    assert.deepEqual(
        result.models.map(item => item.id),
        ['commerce'],
    );
});

test('resolver uses a single-model fallback but not an ambiguous multi-model fallback', async () => {
    const single = await resolveSemanticModelContext(fakeDb([model({ id: 'one', connectionId: 'connection-1' })]), {
        organizationId: 'org-1',
        connectionId: 'connection-1',
        question: 'unrelated phrase',
    });
    assert.equal(single.models.length, 1);
    const multiple = await resolveSemanticModelContext(fakeDb([model({ id: 'one', connectionId: 'connection-1' }), model({ id: 'two', connectionId: 'connection-1' })]), {
        organizationId: 'org-1',
        connectionId: 'connection-1',
        question: 'unrelated phrase',
    });
    assert.deepEqual(multiple, { context: null, models: [] });
});

test('resolver excludes unverified constructs and applies metric and character budgets', async () => {
    const unverified = await resolveSemanticModelContext(fakeDb([model({ id: 'draft', connectionId: 'connection-1', verified: false })]), {
        organizationId: 'org-1',
        connectionId: 'connection-1',
        table: 'orders',
    });
    assert.doesNotMatch(unverified.context ?? '', /^- revenue:/m);

    const budgeted = await resolveSemanticModelContext(
        fakeDb([model({ id: 'large-a', connectionId: 'connection-1', metricCount: 20 }), model({ id: 'large-b', connectionId: 'connection-1', metricCount: 20 })]),
        {
            organizationId: 'org-1',
            connectionId: 'connection-1',
            question: 'revenue',
        },
    );
    assert.ok(budgeted.models.reduce((count, item) => count + item.metricNames.length, 0) <= 12);
    assert.ok((budgeted.context?.length ?? 0) <= 16_000);
});

test('semantic model usage keeps exact revisions as separate Agent Run assets', async () => {
    const calls: any[] = [];
    const db = { works: { recordAgentAssetUsageEvent: async (...args: unknown[]) => calls.push(args) } } as any;
    await recordSemanticModelUsage(db, {
        organizationId: 'org-1',
        userId: 'user-1',
        workId: 'work-1',
        models: [
            { id: 'model-1', name: 'Commerce', ossieVersion: '0.1.1', modelRevision: 'aaa', metricNames: ['revenue'], relationshipNames: [], deepLink: '/org-1/knowledge/model-1' },
            { id: 'model-1', name: 'Commerce', ossieVersion: '0.1.1', modelRevision: 'bbb', metricNames: ['revenue'], relationshipNames: [], deepLink: '/org-1/knowledge/model-1' },
        ],
    });
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0][0].assetRef, calls[1][0].assetRef);
    assert.deepEqual(
        calls.map(call => call[0].revision),
        ['aaa', 'bbb'],
    );
});
