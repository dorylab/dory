import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;

const { artifactAgentAssetRef, knowledgeSourceAgentAssetRef, parseAgentAssetRef, readAgentAsset, searchAgentAssets } = await import('@/lib/server/agent-assets');

const now = new Date('2026-09-17T00:00:00.000Z');
const model = {
    id: 'kn-1',
    organizationId: 'org-1',
    name: 'Revenue knowledge',
    description: null,
    businessContextMd: '',
    modelYaml: '',
    model: {
        definitions: [
            { id: 'metric:mrr', name: 'Monthly recurring revenue', kind: 'metric', status: 'verified', sourceConnectionId: 'conn-1', description: 'Recurring revenue' },
            { id: 'metric:draft', name: 'Draft revenue', kind: 'metric', status: 'unverified', sourceConnectionId: 'conn-1' },
        ],
    },
    dataSources: [{ connectionId: 'conn-1', name: 'Warehouse', type: 'postgres', engine: 'postgres' }],
    verifiedQueryCount: 1,
    knowledgeSourceCount: 1,
    readiness: { status: 'ready', requirements: { dataSource: true, verifiedDefinition: true } },
    agentUnderstands: [],
    createdAt: now,
    updatedAt: now,
};

function dbMock() {
    const sourceText = 'abcdefghijklmnopqrstuvwxyz';
    return {
        artifacts: {
            list: async () => ({
                rows: [
                    {
                        id: 'art-1',
                        type: 'result_set',
                        title: 'Revenue result',
                        status: 'ready',
                        resourceId: 'rs-1',
                        parentArtifactId: null,
                        sourceResultSetId: 'rs-1',
                        connectionId: 'conn-1',
                        connectionName: 'Warehouse',
                        workId: 'work-1',
                        agentRunId: 'work-1',
                        runTitle: 'Revenue analysis',
                        comparisonId: null,
                        comparisonName: null,
                        sourceType: 'query-run',
                        createdByActorType: 'agent',
                        createdByActorId: 'user-1',
                        createdByName: 'User',
                        rowCount: 500,
                        byteSize: 100,
                        fileName: null,
                        fileFormat: null,
                        createdAt: now,
                        updatedAt: now,
                        expiresAt: null,
                        pinnedAt: null,
                        pinnedByActorId: null,
                        retentionDays: 30,
                        usedByCount: 0,
                    },
                    {
                        id: 'art-expired',
                        type: 'result_set',
                        title: 'Expired revenue result',
                        status: 'ready',
                        resourceId: 'rs-expired',
                        connectionId: 'conn-1',
                        connectionName: 'Warehouse',
                        sourceType: 'query-run',
                        createdAt: now,
                        updatedAt: now,
                        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
                    },
                ],
                total: 1,
            }),
            get: async () => ({
                ...(await (dbMock() as any).artifacts.list()).rows[0],
                chartState: null,
                resultSet: { id: 'rs-1', columns: [], dataAvailability: 'full', sql: 'select 1', previewRowCount: 1 },
                workspaceTarget: null,
                downloadUrl: null,
                usedBy: [],
            }),
        },
        knowledge: {
            extraction: { evidenceFor: async () => [], listRules: async () => [] },
            listModels: async () => [model],
            getModel: async () => model,
            listVerifiedQueries: async () => [
                {
                    id: 'query-1',
                    knowledgeModelId: 'kn-1',
                    sourceConnectionId: 'conn-1',
                    title: 'MRR by month',
                    question: 'What is MRR?',
                    sql: 'select 1',
                    description: null,
                    definitionIds: ['metric:mrr'],
                    sourceType: 'saved_query',
                    sourceId: 'saved-1',
                    createdBy: 'user-1',
                    updatedBy: 'user-1',
                    updatedByName: 'User',
                    createdAt: now,
                    updatedAt: now,
                },
            ],
            getVerifiedQuery: async () => (await (dbMock() as any).knowledge.listVerifiedQueries())[0],
            listKnowledgeSources: async () => [
                {
                    id: 'source-1',
                    organizationId: 'org-1',
                    knowledgeModelId: 'kn-1',
                    connectionId: 'conn-1',
                    fileName: 'metrics.md',
                    format: 'markdown',
                    byteSize: sourceText.length,
                    createdBy: 'user-1',
                    createdAt: now,
                    updatedAt: now,
                    connectorId: null,
                    connectorProvider: null,
                    remotePath: null,
                    sourceUrl: 'https://linear.app/dory/document/revenue',
                },
            ],
            searchKnowledgeSources: async () => [{ id: 'source-1', fileName: 'metrics.md', format: 'markdown', connectionId: 'conn-1', excerpt: 'Recurring revenue' }],
            getKnowledgeSource: async () => ({ ...(await (dbMock() as any).knowledge.listKnowledgeSources())[0], contentText: sourceText }),
            getGraph: async () => ({ queryDefinitionEdges: [], sourceAssetEdges: [] }),
        },
        resultSets: {
            readRows: async ({ limit }: { limit: number }) => ({
                resultSetId: 'rs-1',
                rows: Array.from({ length: limit + 20 }, (_, index) => ({ index })),
                offset: 0,
                limit,
                rowCount: 500,
                columns: [],
                dataAvailability: 'full',
            }),
        },
    } as any;
}

test('Agent asset refs parse stable Artifact and Knowledge URIs', () => {
    assert.deepEqual(parseAgentAssetRef(artifactAgentAssetRef('art-1')), { kind: 'artifact', artifactId: 'art-1' });
    assert.deepEqual(parseAgentAssetRef(knowledgeSourceAgentAssetRef('kn-1', 'source-1')), { kind: 'knowledge_source', knowledgeModelId: 'kn-1', sourceId: 'source-1' });
});

test('Agent asset search hides unverified definitions and supports connection allowlists', async () => {
    const result = await searchAgentAssets(dbMock(), { organizationId: 'org-1', query: 'revenue', allowedConnectionIds: ['conn-1'] });
    assert.ok(result.assets.some(asset => asset.kind === 'artifact'));
    assert.ok(result.assets.some(asset => asset.ref.includes('metric:mrr')));
    assert.equal(
        result.assets.some(asset => asset.ref.includes('draft')),
        false,
    );
    assert.equal(
        result.assets.some(asset => asset.ref.includes('art-expired')),
        false,
    );

    const denied = await searchAgentAssets(dbMock(), { organizationId: 'org-1', allowedConnectionIds: ['conn-2'] });
    assert.equal(denied.assets.length, 0);
});

test('Agent asset search scores public Artifact titles without repository prefiltering', async () => {
    const db = dbMock();
    const list = db.artifacts.list;
    let receivedInput: { query?: string | undefined } | undefined;
    db.artifacts.list = async (input: { organizationId: string; query?: string; limit?: number }) => {
        receivedInput = input;
        return list(input);
    };

    const result = await searchAgentAssets(db, { organizationId: 'org-1', query: 'revenue' });

    assert.equal(receivedInput?.query, undefined);
    assert.ok(result.assets.some(asset => asset.ref === artifactAgentAssetRef('art-1')));
});

test('Agent asset reads chunk untrusted sources and cap Artifact previews', async () => {
    const source = await readAgentAsset(dbMock(), { organizationId: 'org-1', ref: knowledgeSourceAgentAssetRef('kn-1', 'source-1'), maxChars: 10 });
    assert.equal((source.content as any).text, 'abcdefghij');
    assert.equal((source.content as any).untrustedContent, true);
    assert.ok((source.content as any).nextCursor);
    assert.equal(source.asset.sourceUrl, 'https://linear.app/dory/document/revenue');
    assert.equal(source.citation.sourceUrl, source.asset.sourceUrl);
    const metadata = (source.content as { source: { createdAt: unknown; updatedAt: unknown } }).source;
    assert.equal(metadata.createdAt, now.toISOString());
    assert.equal(metadata.updatedAt, now.toISOString());
    assert.deepEqual(JSON.parse(JSON.stringify(source)), source, 'Agent tool results must be JSON values accepted by the model SDK');

    const artifact = await readAgentAsset(dbMock(), { organizationId: 'org-1', ref: artifactAgentAssetRef('art-1'), previewRows: 500 });
    assert.equal((artifact.content as any).preview.rows.length, 200);
});

test('natural Chinese questions find verified definitions without whitespace', async () => {
    const db = dbMock();
    const base = await db.knowledge.listModels();
    db.knowledge.listModels = async () => [
        {
            ...base[0],
            model: {
                definitions: [
                    {
                        id: 'metric:late',
                        name: 'late_delivery_rate',
                        kind: 'metric',
                        status: 'verified',
                        sourceConnectionId: 'conn-1',
                        description: '已送达订单迟到率',
                        aliases: ['迟到率'],
                    },
                ],
            },
        },
    ];
    const found = await searchAgentAssets(db, {
        organizationId: 'org-1',
        connectionId: 'conn-1',
        query: '2018年8月下单的已送达订单迟到率是多少？',
        kinds: ['knowledge_definition'],
    });
    assert.equal(found.assets[0]?.title, 'late_delivery_rate');
});

test('approved business rules expose evidence and staleness while respecting model and data-source scope', async () => {
    const db = dbMock();
    const evidence = {
        id: 'ev-1',
        sourceId: null,
        originalSourceId: 'deleted-source',
        sourceHash: 'v1',
        sourceTitle: 'Policy',
        sourceUrl: 'https://linear.app/test/document/policy',
        quote: 'Reports use UTC.',
        state: 'missing',
    };
    db.knowledge.extraction.listRules = async () => [
        {
            id: 'rule-1',
            revision: 1,
            status: 'active',
            sourceState: 'outdated',
            payload: { kind: 'business_rule', name: 'Reporting timezone', description: 'Reports use UTC.', aliases: [], sourceConnectionId: null },
            evidence: [evidence],
        },
    ];
    const found = await searchAgentAssets(db, { organizationId: 'org-1', knowledgeModelId: 'kn-1', query: 'timezone', kinds: ['business_rule'], allowedConnectionIds: ['conn-1'] });
    assert.equal(found.assets.length, 1);
    assert.equal(found.assets[0].sourceState, 'outdated');
    const read = await readAgentAsset(db, { organizationId: 'org-1', ref: found.assets[0].ref, allowedConnectionIds: ['conn-1'] });
    assert.equal(read.citation.sourceState, 'outdated');
    assert.equal(read.citation.sourceUrl, evidence.sourceUrl);
    assert.deepEqual(JSON.parse(JSON.stringify(read)), read);
    const denied = await searchAgentAssets(db, { organizationId: 'org-1', query: 'timezone', kinds: ['business_rule'], allowedConnectionIds: ['conn-other'] });
    assert.equal(denied.assets.length, 0);
    await assert.rejects(readAgentAsset(db, { organizationId: 'org-1', ref: found.assets[0].ref, allowedConnectionIds: ['conn-other'] }));
});

test('metric reads include only effective rules and revisions change when a referenced rule is reviewed', async () => {
    const db = dbMock() as any;
    let ruleRevision = 1;
    db.knowledge.extraction.listRules = async () => [
        {
            id: 'revenue-rule',
            revision: ruleRevision,
            status: 'active',
            applicationScope: 'metrics',
            metricIds: ['metric:mrr'],
            metrics: [{ id: 'metric:mrr', name: 'Monthly recurring revenue', sourceConnectionId: 'conn-1' }],
            payload: { kind: 'business_rule', name: 'Revenue exclusion', description: 'Exclude failed orders from revenue.', aliases: [], sourceConnectionId: null },
            sourceState: 'current',
            evidence: [],
        },
        {
            id: 'other-rule',
            revision: 1,
            status: 'active',
            applicationScope: 'metrics',
            metricIds: ['metric:payments'],
            metrics: [{ id: 'metric:payments', sourceConnectionId: 'conn-1' }],
            payload: { kind: 'business_rule', name: 'Payment denominator', description: 'Count every attempt.', aliases: [], sourceConnectionId: null },
            sourceState: 'current',
            evidence: [],
        },
    ];
    const read = () => readAgentAsset(db, { organizationId: 'org-1', ref: 'dory://knowledge/kn-1/definitions/metric%3Amrr', allowedConnectionIds: ['conn-1'] });
    const first = await read();
    assert.equal((first.content as any).effectiveRules.length, 1);
    assert.equal((first.content as any).effectiveRules[0].id, 'revenue-rule');
    const search = await searchAgentAssets(db, { organizationId: 'org-1', query: 'Monthly recurring revenue', kinds: ['knowledge_definition'], allowedConnectionIds: ['conn-1'] });
    assert.equal(search.assets[0].revision, first.asset.revision);
    ruleRevision++;
    const second = await read();
    assert.notEqual(first.asset.revision, second.asset.revision);
    assert.equal((second.content as any).effectiveRules[0].revision, 2);
});

test('automatic metrics are available with explicit trust while ordinary drafts stay private', async () => {
    const db = dbMock();
    const originalList = db.knowledge.listModels;
    const originalGet = db.knowledge.getModel;
    const automaticModel = { ...model, model: { definitions: model.model.definitions.map(d => (d.id === 'metric:mrr' ? { ...d, status: 'auto_published' } : d)) } };
    db.knowledge.listModels = async () => [automaticModel];
    db.knowledge.getModel = async () => automaticModel;
    try {
        const result = await searchAgentAssets(db, { organizationId: 'org-1', query: 'revenue', kinds: ['knowledge_definition'] });
        assert.equal(result.assets.length, 1);
        assert.equal(result.assets[0].trustLevel, 'automatic');
        const read = await readAgentAsset(db, { organizationId: 'org-1', ref: result.assets[0].ref });
        assert.equal(read.asset.trustLevel, 'automatic');
        await assert.rejects(readAgentAsset(db, { organizationId: 'org-1', ref: 'dory://knowledge/kn-1/definitions/metric%3Adraft' }));
    } finally {
        db.knowledge.listModels = originalList;
        db.knowledge.getModel = originalGet;
    }
});
