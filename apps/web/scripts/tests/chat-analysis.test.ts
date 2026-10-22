import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { createDoryArtifactStore } from '@dory/artifacts';
import type { DBService } from '@dory/database';
import { PostgresChatRepository } from '@dory/database/postgres/impl/chat';
import { PostgresTabStateRepository } from '@dory/database/postgres/impl/sql-console/tabs/tab-states';
import { PostgresWorksRepository } from '@dory/database/postgres/impl/works';
import * as schema from '@dory/database/postgres/schemas';
import type { PostgresDBClient } from '@dory/shared';
import { PGlite } from '@electric-sql/pglite';
import { createAgentUIStream, type ToolExecutionOptions } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;
const [{ createChatAnalysis }, { buildDoryChatAgent }, { catalogSearchAction, catalogReadAction }, { queryReadOnlyExecuteAction }, { getOrganizationPermissionMap }] =
    await Promise.all([
        import('@/lib/server/chat-analysis'),
        import('@/lib/ai/agents/chat-agent'),
        import('@/lib/actions/server/domains/catalog'),
        import('@/lib/actions/server/domains/query/read-only-execute'),
        import('@/lib/auth/organization-ac'),
    ]);
const { getChatResponseText } = await import('@/lib/agent-runs/chat-response');

const scope = { organizationId: 'org', userId: 'user' };
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };

async function fixture() {
    const dir = await mkdtemp(join(tmpdir(), 'dory-chat-analysis-'));
    const previous = process.env.DORY_ARTIFACTS_FILESYSTEM_DIR;
    process.env.DORY_ARTIFACTS_FILESYSTEM_DIR = dir;
    const store = createDoryArtifactStore();
    if (previous === undefined) delete process.env.DORY_ARTIFACTS_FILESYSTEM_DIR;
    else process.env.DORY_ARTIFACTS_FILESYSTEM_DIR = previous;
    const postgresUrl = process.env.DORY_TEST_POSTGRES_URL;
    const client = postgresUrl ? null : new PGlite();
    const admin = postgresUrl ? new Pool({ connectionString: postgresUrl }) : null;
    const databaseName = `dory_analysis_${randomUUID().replaceAll('-', '')}`;
    if (admin) await admin.query(`CREATE DATABASE "${databaseName}"`);
    const url = postgresUrl ? new URL(postgresUrl) : null;
    if (url) url.pathname = `/${databaseName}`;
    const pool = url ? new Pool({ connectionString: url.toString() }) : null;
    const pg = pool ? drizzlePg({ client: pool, schema }) : null;
    const database = pg ? (pg as unknown as ReturnType<typeof drizzle<typeof schema>>) : drizzle({ client: client!, schema });
    if (pg) await migratePg(pg, { migrationsFolder: new URL('../../../../packages/database/src/postgres/migrations', import.meta.url).pathname });
    else await migrate(database, { migrationsFolder: new URL('../../../../packages/database/src/pglite/migrations', import.meta.url).pathname });
    const works = new PostgresWorksRepository(store);
    await works.init(database as unknown as PostgresDBClient);
    const chat = new PostgresChatRepository();
    const tabState = new PostgresTabStateRepository();
    Object.defineProperty(chat, 'db', { value: database });
    Object.defineProperty(tabState, 'db', { value: database });
    const db = { works, chat, tabState } as DBService;
    await database.insert(schema.user).values({ id: 'user', name: 'User', email: 'user@example.test' });
    await chat.createGlobalSession({ ...scope, id: 'chat', connectionId: 'connection' });
    const start = (requestId: string) =>
        works.startChatTurn({ ...scope, requestId, connectionId: 'connection', externalSessionId: 'chat:chat', metadata: { source: 'internal_chat', chatId: 'chat' } });
    const makeAnalysis = (requestId: string, signal = new AbortController().signal) =>
        createChatAnalysis({
            db,
            ...scope,
            chatId: 'chat',
            requestId,
            connectionId: 'connection',
            locale: 'en',
            requestOrigin: 'https://dory.test',
            signal,
            access: {
                source: 'local',
                userId: 'user',
                organization: { id: 'org' },
                organizationId: 'org',
                isMember: true,
                role: 'owner',
                permissions: getOrganizationPermissionMap('owner'),
            },
            resolveWork: () => start(requestId),
        });
    return {
        db,
        client,
        database,
        works,
        chat,
        start,
        makeAnalysis,
        close: async () => {
            await client?.close();
            await pool?.end();
            if (admin) {
                await admin.query(`DROP DATABASE "${databaseName}"`);
                await admin.end();
            }
            await rm(dir, { recursive: true, force: true });
        },
    };
}

const asset = {
    ref: 'dory://knowledge/model/definitions/net-revenue',
    kind: 'knowledge_definition' as const,
    title: 'Net revenue',
    summary: 'Revenue after refunds',
    connectionIds: ['connection'],
    knowledgeModelId: 'model',
    knowledgeModelName: 'Commerce',
    trustLevel: 'verified' as const,
    updatedAt: '2026-01-01T00:00:00Z',
    revision: 'v1',
    deepLink: '/org/knowledge/model',
};
const call = (id: string): ToolExecutionOptions<unknown> => ({ toolCallId: id, messages: [], context: {} });

// The model and datasource are controlled; authorization, tools, SQL workspace, snapshots,
// Findings, evidence validation and chat persistence use the actual production code.
test('built-in analysis closes the Knowledge → SQL → chart → Findings loop and preserves follow-ups', async t => {
    const f = await fixture();
    t.mock.method(catalogSearchAction, 'handler', async () => ({ assets: [asset], total: 1, nextCursor: null }));
    t.mock.method(catalogReadAction, 'handler', async () => ({
        asset,
        content: { definition: 'SUM(amount - refunded_amount)' },
        relatedRefs: [],
        citation: { ref: asset.ref, title: asset.title, revision: 'v1', deepLink: asset.deepLink },
    }));
    let sqlCalls = 0;
    let failNextSql = false;
    t.mock.method(queryReadOnlyExecuteAction, 'handler', async () => {
        sqlCalls++;
        if (failNextSql) {
            failNextSql = false;
            throw new Error('Temporary SQL failure');
        }
        const sessionId = `sql-${sqlCalls}`;
        return {
            session: {
                sessionId,
                userId: 'user',
                connectionId: 'connection',
                sqlText: 'SELECT month, revenue, orders FROM monthly',
                status: 'success',
                source: 'ai',
                durationMs: 10,
            },
            queryResultSets: [
                {
                    sessionId,
                    setIndex: 0,
                    sqlText: 'SELECT month, revenue, orders FROM monthly',
                    columns: [
                        { name: 'month', type: 'text' },
                        { name: 'revenue', type: 'numeric' },
                        { name: 'orders', type: 'integer' },
                    ],
                    rowCount: 2,
                    status: 'success',
                },
            ],
            results: [
                [
                    { month: '2026-01', revenue: 180000, orders: 400 },
                    { month: '2026-02', revenue: 160000, orders: 350 },
                ],
            ],
            meta: {},
        };
    });
    try {
        const work = await f.start('turn-1');
        const analysis = f.makeAnalysis('turn-1');
        assert.match(await analysis.prepareKnowledge('月度净收入与订单数'), /net-revenue/);
        let step = 0;
        const answer = 'February net revenue was 160,000; orders were 350. Revenue fell from January. Currency is not established.';
        const model = new MockLanguageModelV4({
            doGenerate: async (): Promise<LanguageModelV4GenerateResult> => {
                const outputs = await f.database.select().from(schema.artifacts);
                const actions = [
                    ['read_asset', { ref: asset.ref }],
                    ['sqlRunner', { sql: 'SELECT month, revenue, orders FROM monthly', database: 'main' }],
                    ['chartBuilder', { chartType: 'line', xKey: 'month', yKeys: [{ key: 'revenue' }] }],
                    [
                        'finishAnalysis',
                        {
                            status: 'completed',
                            summaryTitle: 'Monthly revenue',
                            finalAnswer: answer,
                            findings: [{ title: 'February revenue declined', content: answer, evidenceArtifactIds: outputs.map(item => item.id), isPrimary: true }],
                            steps: ['Read net revenue definition', 'Compared monthly revenue and orders'],
                        },
                    ],
                ] as const;
                const [toolName, input] = actions[step++]!;
                return {
                    content: [{ type: 'tool-call', toolCallId: `call-${step}`, toolName, input: JSON.stringify(input) }],
                    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                    usage,
                    warnings: [],
                };
            },
        });
        const agent = buildDoryChatAgent({
            model,
            tools: analysis.tools,
            instructions: 'Analyze monthly net revenue and orders.',
            structuredCompletion: true,
            requestId: 'turn-1',
            context: {},
            recordUsage: async () => {},
        });
        model.doStream = async options => {
            const generated = await model.doGenerate(options);
            return {
                stream: new ReadableStream({
                    start(controller) {
                        controller.enqueue({ type: 'stream-start', warnings: [] });
                        for (const content of generated.content) if (content.type === 'tool-call') controller.enqueue(content);
                        controller.enqueue({ type: 'finish', finishReason: generated.finishReason, usage: generated.usage });
                        controller.close();
                    },
                }),
            };
        };
        const stream = await createAgentUIStream({
            agent,
            uiMessages: [{ id: 'question', role: 'user', parts: [{ type: 'text', text: 'Analyze monthly revenue' }] }],
            generateMessageId: () => 'msg_turn-1',
            onEnd: async event => {
                await f.chat.appendMessage({
                    ...scope,
                    sessionId: 'chat',
                    updateExistingAssistant: true,
                    message: {
                        id: event.responseMessage.id,
                        ...scope,
                        sessionId: 'chat',
                        role: 'assistant',
                        parts: event.responseMessage.parts as unknown as Parameters<typeof f.chat.appendMessage>[0]['message']['parts'],
                        metadata: { requestId: 'turn-1', agentRunId: work.workId, summarySaved: true },
                    },
                });
            },
        });
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        assert.ok(chunks.some(chunk => chunk.type === 'tool-output-available'));
        assert.ok(!chunks.some(chunk => chunk.type === 'error'));
        assert.equal(step, 4, 'chart generation must not stop the loop');
        assert.equal(analysis.getFinalAnswer(), answer);
        await f.works.finishChatTurn({ ...scope, workId: work.workId, requestId: 'turn-1', outcome: 'completed', requireSummary: true });
        assert.equal((await f.works.getById({ ...scope, workId: work.workId }))?.status, 'completed');
        const snapshot = await f.works.getSnapshot({ ...scope, workId: work.workId });
        assert.equal(snapshot?.sessions.length, 1);
        assert.equal(snapshot?.tabs.length, 1);
        const findings = await f.works.listFindings({ ...scope, workId: work.workId });
        assert.equal(findings.length, 1);
        assert.equal(findings[0]?.evidence.length, 1);
        const summary = (await f.works.getById({ ...scope, workId: work.workId }))?.metadata?.agentRunSummary as {
            sections: Array<{ findingIds: string[]; responseMessageId: string }>;
        };
        assert.deepEqual(summary.sections[0]?.findingIds, [findings[0]?.id]);
        assert.equal(summary.sections[0]?.responseMessageId, 'msg_turn-1');
        const responses = await f.works.listChatResponses({ ...scope, workId: work.workId });
        assert.equal(getChatResponseText(responses[0]?.parts), answer);
        const events = await f.works.listEvents({ ...scope, workId: work.workId });
        assert.equal(events.find(event => event.toolName === 'dory_search_assets')?.inputSummary?.activitySource, 'automatic');
        for (const [toolName, toolCallId] of [
            ['dory_read_asset', 'call-1'],
            ['dory_run_readonly_sql', 'call-2'],
            ['chartBuilder', 'call-3'],
            ['dory_finish_work', 'call-4'],
        ]) {
            assert.equal(events.find(event => event.toolName === toolName)?.inputSummary?.toolCallId, toolCallId);
        }
        for (const toolName of ['dory_search_assets', 'dory_read_asset', 'dory_run_readonly_sql', 'chartBuilder', 'dory_finish_work']) {
            assert.ok(events.some(event => event.toolName === toolName && event.inputSummary?.requestId === 'turn-1'));
        }
        assert.equal((await f.start('turn-2')).workId, work.workId);
        const next = f.makeAnalysis('turn-2');
        const sql = next.tools.sqlRunner!;
        failNextSql = true;
        const failed = await sql.execute!({ sql: 'SELECT revenue FROM monthly' }, call('failed-query'));
        assert.equal((failed as { ok: boolean }).ok, false);
        await Promise.all([sql.execute!({ sql: 'SELECT revenue FROM monthly' }, call('same-call')), sql.execute!({ sql: 'SELECT revenue FROM monthly' }, call('same-call'))]);
        assert.equal(sqlCalls, 3, 'a retry executes once and duplicate SDK execution must not repeat SQL');
        const followup = { status: 'completed', finalAnswer: 'The prior result remains valid.', findings: [], steps: ['Reviewed prior evidence'] };
        await next.tools.finishAnalysis!.execute!(followup, call('finish-2'));
        await next.tools.finishAnalysis!.execute!(followup, call('finish-2-retry'));
        assert.equal((await f.works.listChatResponses({ ...scope, workId: work.workId })).length, 2);
        assert.equal((await f.works.listFindings({ ...scope, workId: work.workId })).length, 1);
        await assert.rejects(analysis.tools.finishAnalysis!.execute!(followup, call('old')) as Promise<unknown>, /no longer active/);
    } finally {
        await f.close();
    }
});

test('missing Knowledge, failed SQL, invalid evidence, cancellation and stale turns remain honest', async t => {
    const f = await fixture();
    try {
        t.mock.method(catalogSearchAction, 'handler', async () => ({ assets: [], total: 0, nextCursor: null }));
        const work = await f.start('errors');
        const analysis = f.makeAnalysis('errors');
        assert.match(await analysis.prepareKnowledge('unknown metric'), /"assets":\[\]/);
        t.mock.method(queryReadOnlyExecuteAction, 'handler', async () => {
            throw new Error('Only read-only SQL is allowed');
        });
        const denied = await analysis.tools.sqlRunner!.execute!({ sql: 'DELETE FROM orders' }, call('denied'));
        assert.equal((denied as { ok: boolean }).ok, false);
        assert.equal((denied as { manualExecution: { required: boolean } }).manualExecution.required, true);
        await assert.rejects(
            analysis.tools.finishAnalysis!.execute!(
                { status: 'completed', finalAnswer: 'Wrong', findings: [{ title: 'Invalid', evidenceArtifactIds: ['invented'] }], steps: ['Tried analysis'] },
                call('invalid'),
            ) as Promise<unknown>,
            /Evidence|evidence/,
        );
        assert.equal((await f.works.listFindings({ ...scope, workId: work.workId })).length, 0);
        await f.works.finishChatTurn({ ...scope, workId: work.workId, requestId: 'errors', outcome: 'completed', requireSummary: true });
        assert.equal((await f.works.getById({ ...scope, workId: work.workId }))?.status, 'error');
        await f.start('cancel');
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(f.makeAnalysis('cancel', controller.signal).tools.read_asset!.execute!({ ref: asset.ref }, call('aborted')) as Promise<unknown>, /abort/i);
        await assert.rejects(f.works.listChatResponses({ ...scope, userId: 'other', workId: work.workId }), /not found/i);
        await assert.rejects(f.works.startChatTurn({ ...scope, requestId: 'other-connection', connectionId: 'different', externalSessionId: 'chat:chat' }), /already bound/);
    } finally {
        await f.close();
    }
});

test('concurrent starts share one Run and a missing answer cannot complete a turn', async t => {
    const f = await fixture();
    try {
        const [first, second] = await Promise.all([f.start('first'), f.start('first')]);
        assert.equal(first.workId, second.workId);
        assert.equal((await f.database.select().from(schema.works)).length, 1);
        await f.works.bindChatBridgeJob({ ...scope, workId: first.workId, requestId: 'first', jobId: 'job' });
        assert.deepEqual(await f.works.getChatBridgeTurn({ ...scope, jobId: 'job' }), { workId: first.workId, requestId: 'first' });
        assert.equal(await f.works.getChatBridgeTurn({ ...scope, userId: 'other', jobId: 'job' }), null);
        const append = t.mock.method(f.chat, 'appendMessage', async () => {
            throw new Error('Message storage unavailable');
        });
        const analysis = f.makeAnalysis('first');
        await assert.rejects(
            analysis.tools.finishAnalysis!.execute!(
                { status: 'completed', finalAnswer: 'Knowledge answer', findings: [{ title: 'Verified definition', content: 'Knowledge answer' }], steps: ['Read knowledge'] },
                call('finish'),
            ) as Promise<unknown>,
            /storage unavailable/,
        );
        assert.equal(analysis.getFinalAnswer(), null);
        assert.equal((await f.works.listFindings({ ...scope, workId: first.workId })).length, 1);
        await f.works.finishChatTurn({ ...scope, workId: first.workId, requestId: 'first', outcome: 'completed', requireSummary: true });
        assert.equal((await f.works.getById({ ...scope, workId: first.workId }))?.status, 'error');
        append.mock.restore();
        await f.start('second');
        assert.equal(await f.works.getChatBridgeTurn({ ...scope, jobId: 'job' }), null);
        assert.equal(await f.works.finishChatTurn({ ...scope, workId: first.workId, requestId: 'first', outcome: 'failed' }), null);
        assert.equal((await f.works.getById({ ...scope, workId: first.workId }))?.status, 'active');
    } finally {
        await f.close();
    }
});

test('Knowledge failure is distinct from no hits and running activity keeps the same event ID', async t => {
    const f = await fixture();
    try {
        const work = await f.start('search');
        let release!: () => void;
        const wait = new Promise<void>(resolve => {
            release = resolve;
        });
        let entered!: () => void;
        const ready = new Promise<void>(resolve => {
            entered = resolve;
        });
        t.mock.method(catalogSearchAction, 'handler', async () => {
            entered();
            await wait;
            throw new Error('Search unavailable');
        });
        const pending = f.makeAnalysis('search').prepareKnowledge('monthly revenue');
        await ready;
        const running = await f.works.listEvents({ ...scope, workId: work.workId });
        assert.equal(running.length, 1);
        assert.equal(running[0]?.status, 'running');
        release();
        assert.match(await pending, /failed[\s\S]*Do not claim no Knowledge/);
        const events = await f.works.listEvents({ ...scope, workId: work.workId });
        assert.equal(events.length, 1);
        assert.equal(events[0]?.eventId, running[0]?.eventId);
        assert.equal(events[0]?.status, 'error');
    } finally {
        await f.close();
    }
});

test('analysis budget reserves a finalization call and one correction', async () => {
    const { tool } = await import('ai');
    const { z } = await import('zod');
    let calls = 0;
    let finishes = 0;
    const model = new MockLanguageModelV4({
        doGenerate: async options => {
            const index = calls++;
            if (index >= 12)
                assert.deepEqual(
                    options.tools?.map(item => item.name),
                    ['finishAnalysis'],
                );
            const toolName = index < 12 ? 'inspect' : 'finishAnalysis';
            return {
                content: [{ type: 'tool-call', toolCallId: String(index), toolName, input: '{}' }],
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
                warnings: [],
            };
        },
    });
    const agent = buildDoryChatAgent({
        model,
        tools: {
            inspect: tool({ inputSchema: z.object({}), execute: async () => ({ ok: true }) }),
            finishAnalysis: tool({
                inputSchema: z.object({}),
                execute: async () => {
                    if (++finishes === 1) throw new Error('Fix invalid evidence');
                    return { ok: true };
                },
            }),
        },
        instructions: 'Inspect then finish.',
        structuredCompletion: true,
        requestId: 'budget',
        context: {},
        recordUsage: async () => {},
    });
    const result = await agent.generate({ prompt: 'Analyze' });
    assert.equal(result.steps.length, 14);
    assert.equal(finishes, 2);
});
