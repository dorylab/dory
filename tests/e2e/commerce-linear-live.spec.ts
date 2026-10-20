import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type APIRequestContext } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { LinearCommercePhase, LinearCommerceSource, verifyLinearCommerceSources } from '../../apps/web/scripts/linear-commerce/acceptance';

let acceptance: typeof import('../../apps/web/scripts/linear-commerce/acceptance');
let fixtures: typeof import('../../apps/web/scripts/linear-commerce/fixtures');

const enabled = process.env.E2E_LINEAR_COMMERCE === '1';
const projectId = process.env.E2E_LINEAR_COMMERCE_PROJECT_ID ?? '';
const phaseValue = process.env.E2E_LINEAR_COMMERCE_PHASE ?? 'baseline';
const phase = phaseValue as LinearCommercePhase;
const organizationId = process.env.E2E_LINEAR_COMMERCE_ORGANIZATION_ID;
const outputDirectory = path.resolve(process.env.E2E_LINEAR_COMMERCE_OUTPUT_DIR ?? 'apps/web/localdata/linear-commerce-acceptance');

type Model = { id: string; name: string; modelRevision: string; dataSources: Array<{ connectionId: string; name: string }> };
type Credential = { id: string; workspaceId: string; workspaceName: string; status: string; version: number };
type Connector = { id: string; provider: string; credentialId: string | null; projectIds: string[]; linearWorkspaceId: string; status: string; lastSyncedAt: string | null };
type Evidence = ReturnType<typeof verifyLinearCommerceSources>;

async function action<T>(request: APIRequestContext, actionId: string, input: Record<string, unknown>): Promise<T> {
    const response = await request.post('/api/actions/execute', { data: { actionId, input, organizationId } });
    const payload = await response.json();
    if (!response.ok() || !payload.ok) throw new Error(`Live acceptance action failed: ${actionId} (${payload.code ?? response.status()})`);
    return payload.data as T;
}
async function modelFor(request: APIRequestContext) {
    const { models } = await action<{ models: Model[] }>(request, 'knowledge.list', {});
    const matches = models.filter(model =>
        process.env.E2E_LINEAR_COMMERCE_MODEL_ID ? model.id === process.env.E2E_LINEAR_COMMERCE_MODEL_ID : model.name === fixtures.LINEAR_COMMERCE_MODEL_NAME,
    );
    expect(matches, 'Expected one existing commerce model; pass E2E_LINEAR_COMMERCE_MODEL_ID to disambiguate').toHaveLength(1);
    expect(matches[0].dataSources.some(source => source.name === fixtures.LINEAR_COMMERCE_CONNECTION_NAME)).toBe(true);
    return matches[0];
}
async function credentialSetup(request: APIRequestContext, knowledgeModelId: string) {
    return action<{ available: boolean; configured: boolean; canManage: boolean; credentials: Credential[] }>(request, 'knowledge.getLinearConnectorSetup', { knowledgeModelId });
}
async function connectorsFor(request: APIRequestContext, knowledgeModelId: string) {
    return (await action<{ connectors: Connector[] }>(request, 'knowledge.listConnectors', { knowledgeModelId })).connectors;
}
async function sourcesFor(request: APIRequestContext, knowledgeModelId: string, connectorId: string) {
    const { sources } = await action<{ sources: LinearCommerceSource[] }>(request, 'knowledge.listKnowledgeSources', { knowledgeModelId });
    return Promise.all(
        sources
            .filter(source => source.connectorId === connectorId)
            .map(source => action<LinearCommerceSource>(request, 'knowledge.getKnowledgeSource', { knowledgeModelId, id: source.id })),
    );
}
async function evidenceFor(name: string) {
    const json: unknown = JSON.parse(await readFile(path.join(outputDirectory, `${name}.json`), 'utf8'));
    if (!json || typeof json !== 'object' || !('evidence' in json)) throw new Error(`Missing successful ${name} evidence`);
    return (json as { evidence: Evidence }).evidence;
}
function mcpPayload(value: unknown): Record<string, unknown> {
    const result = value as { isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ type: string; text?: string }> };
    if (result.isError) throw new Error('Agent source MCP call failed');
    const payload = result.structuredContent ?? JSON.parse(result.content?.find(item => item.type === 'text')?.text ?? '{}');
    if (!payload || typeof payload !== 'object' || payload.ok === false) throw new Error('Invalid Agent source MCP response');
    return payload;
}

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Commerce Linear real API Key acceptance', () => {
    test.skip(!enabled, 'Explicitly enable E2E_LINEAR_COMMERCE after preparing the real Linear fixture and entering the Key in Dory.');
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(async () => {
        acceptance = await import('../../apps/web/scripts/linear-commerce/acceptance');
        fixtures = await import('../../apps/web/scripts/linear-commerce/fixtures');
        expect(process.env.PLAYWRIGHT_BASE_URL, 'Use an explicitly selected local application').toBeTruthy();
        expect(['localhost', '127.0.0.1']).toContain(new URL(process.env.PLAYWRIGHT_BASE_URL!).hostname);
        expect(projectId, 'Pass the dedicated Linear test project UUID').toMatch(/^[0-9a-f-]{36}$/i);
        expect(acceptance.LINEAR_COMMERCE_PHASES).toContain(phaseValue);
        if (phase === 'revoked') {
            expect(organizationId, 'Revocation requires an explicitly selected isolated Dory organization').toBeTruthy();
            expect(process.env.E2E_LINEAR_COMMERCE_PROTECTED_ORGANIZATION_ID, 'Provide the demonstration organization ID to prevent shared credential invalidation').toBeTruthy();
            expect(organizationId).not.toBe(process.env.E2E_LINEAR_COMMERCE_PROTECTED_ORGANIZATION_ID);
            expect(process.env.E2E_LINEAR_COMMERCE_MODEL_ID, 'Use a disposable model in the isolated organization').toBeTruthy();
            expect(process.env.E2E_LINEAR_COMMERCE_OUTPUT_DIR, 'Keep isolated baseline evidence separate from the demonstration model').toBeTruthy();
        }
    });

    test('real sync preserves complete source content, scope, credentials and source identity', async ({ page, request }) => {
        test.setTimeout(180_000);
        const model = await modelFor(request);
        const setup = await credentialSetup(request, model.id);
        expect(setup.available && setup.configured && setup.canManage).toBe(true);
        let connector = (await connectorsFor(request, model.id)).find(item => item.provider === 'linear' && item.projectIds.includes(projectId));
        if (!connector) {
            expect(phase, 'Connect the dedicated project during baseline first').toBe('baseline');
            const candidates: Credential[] = [];
            for (const credential of setup.credentials.filter(item => item.status === 'active')) {
                let after: string | undefined;
                const seen = new Set<string>();
                do {
                    const projects = await action<{ nodes: Array<{ id: string; name: string }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>(
                        request,
                        'knowledge.listLinearProjects',
                        { knowledgeModelId: model.id, credentialId: credential.id, search: fixtures.LINEAR_COMMERCE_PROJECT_NAME, after },
                    );
                    if (projects.nodes.some(item => item.id === projectId && item.name === fixtures.LINEAR_COMMERCE_PROJECT_NAME)) candidates.push(credential);
                    if (!projects.pageInfo.hasNextPage) break;
                    expect(projects.pageInfo.endCursor).toBeTruthy();
                    after = projects.pageInfo.endCursor!;
                    expect(seen.has(after)).toBe(false);
                    seen.add(after);
                } while (true);
            }
            expect(candidates, 'Enter the read-only Key in Dory; the dedicated project must be accessible').toHaveLength(1);
            connector = await action<Connector>(request, 'knowledge.createLinearConnector', {
                knowledgeModelId: model.id,
                credentialId: candidates[0].id,
                projectIds: [projectId],
            });
        }
        expect(connector.projectIds, 'Do not run lifecycle tests against a mixed project scope').toEqual([projectId]);
        const connectorId = connector.id;
        const before = await sourcesFor(request, model.id, connectorId);
        const lastSuccess = connector.lastSyncedAt;
        if (phase === 'revoked') {
            expect(lastSuccess, 'Revocation requires an already synced disposable connector').toBeTruthy();
            expect(connector.status, 'Revoke only the separate temporary Key before running this phase').not.toBe('disabled');
        } else expect(setup.credentials.find(item => item.id === connector!.credentialId)?.status).toBe('active');
        await action(request, 'knowledge.syncConnector', { connectorId });
        await expect
            .poll(
                async () => {
                    const current = (await connectorsFor(request, model.id)).find(item => item.id === connectorId)!;
                    if (phase === 'revoked') return current.status === 'disabled';
                    if (current.status === 'error' || current.status === 'disabled') throw new Error(`Real Linear synchronization ended in ${current.status}`);
                    return current.status === 'ready' && current.lastSyncedAt !== lastSuccess;
                },
                { timeout: 120_000, intervals: [500, 1000, 2000] },
            )
            .toBe(true);
        connector = (await connectorsFor(request, model.id)).find(item => item.id === connectorId)!;
        const sources = await sourcesFor(request, model.id, connectorId);
        const temporaryEvidence = ['empty', 'deleted'].includes(phase) ? await evidenceFor('temporary') : undefined;
        const baselineIds = phase === 'baseline' ? undefined : phase === 'empty' ? temporaryEvidence!.sourceIdsByRemotePath : (await evidenceFor('baseline')).sourceIdsByRemotePath;
        const temporaryRemotePath = temporaryEvidence?.sources.find(source => source.title.startsWith(acceptance.LINEAR_COMMERCE_TEMP_TITLE))?.remotePath ?? undefined;
        const evidence = acceptance.verifyLinearCommerceSources({
            sources,
            connectorId,
            projectId,
            fixtures: await fixtures.loadLinearCommerceFixtures(),
            phase,
            baselineIds,
            temporaryRemotePath,
        });
        if (phase === 'revoked') {
            expect(connector.lastSyncedAt).toBe(lastSuccess);
            expect(sources.map(source => [source.id, source.contentText])).toEqual(before.map(source => [source.id, source.contentText]));
            expect((await credentialSetup(request, model.id)).credentials.find(item => item.id === connector!.credentialId)?.status).toBe('invalid');
        }
        if (phase === 'baseline') {
            const previous = await credentialSetup(request, model.id);
            const invalid = await request.post('/api/actions/execute', {
                data: {
                    actionId: 'knowledge.saveLinearApiKey',
                    organizationId,
                    input: { knowledgeModelId: model.id, credentialId: connector.credentialId, apiKey: 'dory-deliberately-invalid-fixture-key' },
                },
            });
            expect((await invalid.json()).ok).toBe(false);
            expect(await credentialSetup(request, model.id)).toEqual(previous);
            expect((await sourcesFor(request, model.id, connectorId)).map(source => source.id)).toEqual(sources.map(source => source.id));
        }
        expect((await action<Model>(request, 'knowledge.get', { knowledgeModelId: model.id })).modelRevision).toBe(model.modelRevision);
        await page.goto('/');
        await page.waitForURL(/\/[^/]+\/connections$/);
        const organizationSlug = organizationId ?? new URL(page.url()).pathname.split('/')[1];
        await page.goto(`/${organizationSlug}/knowledge/${model.id}?tab=sources`);
        for (const source of sources) {
            const original = page.getByRole('link', { name: /^(Open original|打开原文)$/, exact: true }).and(page.locator(`a[href="${source.sourceUrl}"]`));
            await expect(original).toBeVisible();
        }
        await expect(page.getByText(/^Linear · (Read-only|只读)$/, { exact: true }).first()).toBeVisible();
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(
            path.join(outputDirectory, `${phase}.json`),
            JSON.stringify(
                {
                    mode: 'real-linear',
                    phase,
                    organizationId: organizationId ?? null,
                    result: 'passed',
                    checkedAt: new Date().toISOString(),
                    knowledgeModelId: model.id,
                    connectorId,
                    projectId,
                    lastSyncedAt: connector.lastSyncedAt,
                    evidence,
                    checks: [
                        'complete-content',
                        'original-urls',
                        'readonly-ui',
                        'model-definitions-preserved',
                        ...(baselineIds ? ['stable-source-ids'] : []),
                        ...(phase === 'baseline' ? ['invalid-key-preserves-credential'] : []),
                    ],
                    agentSourceVerification: 'run-separate-agent-test',
                    hourlyWaitPerformed: false,
                },
                null,
                2,
            ),
        );
    });

    test('existing Agent discovery and read tools find all three Linear answers with original citations', async ({ request }) => {
        test.setTimeout(240_000);
        test.skip(phase === 'revoked', 'Do not use the separate revocation case for Agent acceptance.');
        const model = await modelFor(request);
        const evidence: Array<{ question: string; ref: string; sourceUrl: string }> = [];
        let chatId: string | null = null;
        if (process.env.DORY_MCP_TOKEN) {
            const client = new Client({ name: 'dory-linear-commerce-acceptance', version: '1.0.0' });
            try {
                await client.connect(
                    new StreamableHTTPClientTransport(new URL('/api/mcp', process.env.PLAYWRIGHT_BASE_URL!), {
                        requestInit: { headers: { Authorization: `Bearer ${process.env.DORY_MCP_TOKEN}` } },
                    }),
                );
                for (const spec of fixtures.LINEAR_COMMERCE_DOCUMENTS) {
                    const search = mcpPayload(
                        await client.callTool({
                            name: 'dory_search_assets',
                            arguments: { knowledgeModelId: model.id, connectionId: model.dataSources[0].connectionId, kinds: ['knowledge_source'], query: spec.query },
                        }),
                    );
                    const assets = search.assets as Array<{ ref: string; sourceUrl?: string }>;
                    let match: { ref: string; sourceUrl: string } | undefined;
                    for (const asset of assets) {
                        const read = mcpPayload(await client.callTool({ name: 'dory_read_asset', arguments: { ref: asset.ref, maxChars: 20_000 } }));
                        const content = read.content as { text: string; untrustedContent: boolean };
                        const citation = read.citation as { sourceUrl?: string };
                        if (!content.text.includes(spec.marker)) continue;
                        expect(content.text).toContain(spec.answer);
                        expect(content.untrustedContent).toBe(true);
                        expect(citation.sourceUrl).toBe(asset.sourceUrl);
                        expect(new URL(citation.sourceUrl!).hostname).toBe('linear.app');
                        match = { ref: asset.ref, sourceUrl: citation.sourceUrl! };
                        break;
                    }
                    expect(match, `No Linear answer found for ${spec.question}`).toBeTruthy();
                    evidence.push({ question: spec.question, ...match! });
                }
            } finally {
                await client.close();
            }
        } else {
            expect(organizationId, 'Chat acceptance uses the active organization; use an existing scoped MCP token for an explicit organization override').toBeUndefined();
            const messageId = randomUUID();
            const response = await request.post('/api/chat', {
                timeout: 210_000,
                data: {
                    id: messageId,
                    connectionId: model.dataSources[0].connectionId,
                    connectionType: 'sqlite',
                    database: 'main',
                    webSearch: false,
                    messages: [
                        {
                            id: messageId,
                            role: 'user',
                            parts: [
                                {
                                    type: 'text',
                                    text: [
                                        `请执行电商知识来源验收。只检索知识模型“电商”（knowledgeModelId=${model.id}）的 Linear 文档。`,
                                        `所有 search_assets 调用使用真实数据源 connectionId=${model.dataSources[0].connectionId}。knowledgeModelId 和 connectionId 是不同标识，必须使用上述原值。`,
                                        '依次使用 search_assets 搜索“净收入”“支付成功率”“统计时区”，限制 kinds=["knowledge_source"]，并使用 read_asset 实际读取相关文档完整正文。',
                                        '回答三个问题：净收入如何计算？支付成功率如何计数？统计使用什么时区？',
                                        '请用中文作答，每个回答附相应 Linear 原文 URL。不能只读搜索摘要。仅执行知识检索读取，不运行 SQL、图表或写入操作。',
                                    ].join('\n'),
                                },
                            ],
                        },
                    ],
                },
            });
            expect(response.ok(), `Agent chat returned HTTP ${response.status()}`).toBe(true);
            chatId = response.headers()['x-chat-id'] ?? null;
            const events = (await response.text())
                .split('\n')
                .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
                .map(line => JSON.parse(line.slice(6)) as Record<string, unknown>);
            const outputs = events.filter(event => event.type === 'tool-output-available').map(event => event.output as Record<string, unknown>);
            const discoveredRefs = new Set(outputs.flatMap(output => (Array.isArray(output.assets) ? output.assets.map((asset: { ref: string }) => asset.ref) : [])));
            const reads = outputs.filter(output => output.content && output.citation);
            const answer = events
                .filter(event => event.type === 'text-delta')
                .map(event => String(event.delta ?? ''))
                .join('');
            for (const spec of fixtures.LINEAR_COMMERCE_DOCUMENTS) {
                const read = reads.find(output => String((output.content as { text?: string }).text ?? '').includes(spec.marker));
                expect(read, `Agent did not read the Linear document for ${spec.question}`).toBeTruthy();
                const content = read!.content as { text: string; untrustedContent: boolean };
                const citation = read!.citation as { ref: string; sourceUrl: string };
                expect(discoveredRefs.has(citation.ref), 'Agent must discover a source before reading it').toBe(true);
                expect(content.text).toContain(spec.answer);
                expect(content.untrustedContent).toBe(true);
                expect(new URL(citation.sourceUrl).hostname).toBe('linear.app');
                expect(decodeURI(answer)).toContain(decodeURI(citation.sourceUrl));
                evidence.push({ question: spec.question, ref: citation.ref, sourceUrl: citation.sourceUrl });
            }
            expect(answer).toContain('UTC');
        }
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(
            path.join(outputDirectory, `${phase}-agent.json`),
            JSON.stringify(
                {
                    mode: process.env.DORY_MCP_TOKEN ? 'real-mcp' : 'real-agent-chat',
                    result: 'passed',
                    checkedAt: new Date().toISOString(),
                    knowledgeModelId: model.id,
                    chatId,
                    evidence,
                },
                null,
                2,
            ),
        );
    });
});
