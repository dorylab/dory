import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { ossieRevision, parseKnowledgeYaml, serializeOssieDocument } from '@dory/database/postgres/impl/knowledge';
import { OSSIE_VERSION } from '@dory/shared/types/ossie';

import { buildCommerceEvaluationOssieDocument, COMMERCE_EVALUATION_SCENARIOS } from '@/lib/demo/commerce-agent-evaluation-knowledge';
import { buildOlistOssieDocument, olistScenarios } from '@/lib/demo/olist-evaluation';
import { knowledgeSearchTokens } from '@/lib/server/knowledge-search-tokens';

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
        ossieVersion: '0.2.0.dev0' as const,
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
            version: '0.2.0.dev0' as const,
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

test('classic commerce questions resolve the expected Ossie metrics and relationship paths', async () => {
    const connectionId = 'connection-commerce';
    const ossieDocument = buildCommerceEvaluationOssieDocument(connectionId);
    const yaml = serializeOssieDocument(ossieDocument);
    const knowledgeModel = {
        id: 'commerce-operations',
        name: 'Commerce Operations Knowledge',
        description: ossieDocument.description ?? null,
        ossieVersion: '0.2.0.dev0' as const,
        modelRevision: ossieRevision(ossieDocument),
        readiness: { status: 'ready' as const },
        model: parseKnowledgeYaml(yaml, connectionId, false),
        ossieDocument,
    };

    for (const scenario of COMMERCE_EVALUATION_SCENARIOS) {
        const result = await resolveSemanticModelContext(fakeDb([knowledgeModel as any]), {
            organizationId: 'org-1',
            connectionId,
            question: scenario.question,
            dialect: 'ANSI_SQL',
        });
        assert.equal(result.models[0]?.id, knowledgeModel.id, scenario.id);
        for (const semanticId of scenario.expectedSemanticIds) {
            assert.match(result.context ?? '', new RegExp(semanticId.split(':').at(-1)!), `${scenario.id} should include ${semanticId}`);
        }
    }
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

test('natural Chinese Olist questions match metrics and retain second-hop category translation', async () => {
    const connectionId = 'olist';
    const ossieDocument = buildOlistOssieDocument(connectionId, { min: '2016-09-04', max: '2018-10-17' });
    const knowledgeModel = {
        id: 'olist-model',
        name: 'Olist Commerce Knowledge',
        description: null,
        ossieVersion: OSSIE_VERSION,
        modelRevision: ossieRevision(ossieDocument),
        readiness: { status: 'ready' as const },
        model: parseKnowledgeYaml(serializeOssieDocument(ossieDocument), connectionId, false),
        ossieDocument,
    };
    for (const scenario of olistScenarios('2026-10-15')) {
        const result = await resolveSemanticModelContext(fakeDb([knowledgeModel as any]), { organizationId: 'org', connectionId, question: scenario.question });
        for (const name of scenario.semanticNames) {
            assert.ok(result.context?.includes(name), `${scenario.id}: ${name}`);
            assert.ok([...result.models[0].metricNames, ...result.models[0].relationshipNames].includes(name), `Unrecorded ${name}`);
        }
    }
});

test('search phrases remain bounded for long multilingual questions', () => {
    assert.ok(knowledgeSearchTokens(Array.from({ length: 2000 }, (_, i) => `term_${i}`).join(' ')).length <= 256);
    assert.ok(knowledgeSearchTokens('这是一条很长的客户订单复购问题'.repeat(1000)).length <= 256);
});

test('model changes produce a new revision without changing previously recorded Run context', async () => {
    const document = buildOlistOssieDocument('olist', { min: '2016-09-04', max: '2018-10-17' });
    const firstRevision = ossieRevision(document);
    const snapshots: Array<{ workId: string; revision: string; assetSnapshot: Record<string, unknown> }> = [];
    const db = {
        works: {
            recordAgentAssetUsageEvent: async (input: { workId: string; revision: string; assetSnapshot: Record<string, unknown> }) => snapshots.push(structuredClone(input)),
        },
    } as any;
    const usage = (revision: string) => ({
        id: 'olist-model',
        name: 'Olist',
        ossieVersion: OSSIE_VERSION,
        modelRevision: revision,
        metricNames: ['merchandise_amount'],
        relationshipNames: ['items_order'],
        deepLink: '/org/knowledge/olist-model',
    });
    await recordSemanticModelUsage(db, { organizationId: 'org', userId: 'user', workId: 'old', models: [usage(firstRevision)] });
    document.metrics![0].description += ' Changed definition.';
    const secondRevision = ossieRevision(document);
    assert.notEqual(firstRevision, secondRevision);
    await recordSemanticModelUsage(db, { organizationId: 'org', userId: 'user', workId: 'new', models: [usage(secondRevision)] });
    assert.equal(snapshots[0].assetSnapshot.modelRevision, firstRevision);
    assert.equal(snapshots[1].assetSnapshot.modelRevision, secondRevision);
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
            {
                id: 'model-1',
                name: 'Commerce',
                ossieVersion: '0.2.0.dev0',
                modelRevision: 'aaa',
                metricNames: ['revenue'],
                relationshipNames: [],
                deepLink: '/org-1/knowledge/model-1',
            },
            {
                id: 'model-1',
                name: 'Commerce',
                ossieVersion: '0.2.0.dev0',
                modelRevision: 'bbb',
                metricNames: ['revenue'],
                relationshipNames: [],
                deepLink: '/org-1/knowledge/model-1',
            },
        ],
    });
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0][0].assetRef, calls[1][0].assetRef);
    assert.deepEqual(
        calls.map(call => call[0].revision),
        ['aaa', 'bbb'],
    );
});
