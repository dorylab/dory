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

test('Agent asset reads chunk untrusted sources and cap Artifact previews', async () => {
    const source = await readAgentAsset(dbMock(), { organizationId: 'org-1', ref: knowledgeSourceAgentAssetRef('kn-1', 'source-1'), maxChars: 10 });
    assert.equal((source.content as any).text, 'abcdefghij');
    assert.equal((source.content as any).untrustedContent, true);
    assert.ok((source.content as any).nextCursor);

    const artifact = await readAgentAsset(dbMock(), { organizationId: 'org-1', ref: artifactAgentAssetRef('art-1'), previewRows: 500 });
    assert.equal((artifact.content as any).preview.rows.length, 200);
});
