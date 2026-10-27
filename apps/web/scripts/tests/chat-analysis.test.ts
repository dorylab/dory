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
import { PostgresArtifactsRepository } from '@dory/database/postgres/impl/artifacts';
import { PostgresResultSetsRepository } from '@dory/database/postgres/impl/result-sets';
import { PostgresChatRepository } from '@dory/database/postgres/impl/chat';
import { PostgresTabStateRepository } from '@dory/database/postgres/impl/sql-console/tabs/tab-states';
import { PostgresWorksRepository } from '@dory/database/postgres/impl/works';
import * as schema from '@dory/database/postgres/schemas';
import type { PostgresDBClient } from '@dory/shared';
import { PGlite } from '@electric-sql/pglite';
import { createAgentUIStream, type ToolExecutionOptions } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { eq } from 'drizzle-orm';
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
const { schemaGetGraphAction } = await import('@/lib/actions/server/domains/schema/graph');
const { schemaListTablesAction } = await import('@/lib/actions/server/domains/schema/list-tables');
const { schemaListDatabasesAction } = await import('@/lib/actions/server/domains/schema/list-databases');
const { schemaDescribeTableAction } = await import('@/lib/actions/server/domains/schema/describe-table');
const { getAgentExecutionTools } = await import('@/lib/server/agent-execution');
const { getChatResponseText } = await import('@/lib/agent-runs/chat-response');

const scope = { organizationId: 'org', userId: 'user' };
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };

async function fixture(progressCheckpoints = false) {
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
    const artifacts = new PostgresArtifactsRepository();
    const resultSets = new PostgresResultSetsRepository(store);
    Object.defineProperty(artifacts, 'db', { value: database });
    Object.defineProperty(resultSets, 'db', { value: database });
    const db = { works, chat, tabState, artifacts, resultSets } as DBService;
    await database.insert(schema.user).values({ id: 'user', name: 'User', email: 'user@example.test' });
    await chat.createGlobalSession({ ...scope, id: 'chat', connectionId: 'connection' });
    const start = (requestId: string, connectionIds?: string[], databasesByConnection?: Record<string, string | string[]>) =>
        works.startChatTurn({
            ...scope,
            requestId,
            connectionId: connectionIds ? null : 'connection',
            externalSessionId: 'chat:chat',
            metadata: {
                source: 'internal_chat',
                progressCheckpoints,
                chatId: 'chat',
                ...(connectionIds ? { analysisScope: { connectionIds, ...(databasesByConnection ? { databasesByConnection } : {}) } } : {}),
            },
        });
    const makeAnalysis = (requestId: string, signal = new AbortController().signal, connectionIds?: string[], databasesByConnection?: Record<string, string | string[]>) => {
        // Match the request-local lifecycle: resolving an old Run must not restart its turn.
        let work: ReturnType<typeof start> | undefined;
        return createChatAnalysis({
            progressCheckpoints,
            db,
            ...scope,
            chatId: 'chat',
            requestId,
            connectionId: connectionIds ? null : 'connection',
            ...(connectionIds ? { analysisScope: { connectionIds, ...(databasesByConnection ? { databasesByConnection } : {}) } } : {}),
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
            resolveWork: () => (work ??= start(requestId, connectionIds, databasesByConnection)),
        });
    };
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
        content: { definition: 'SUM(amount - refunded_amount)', checkedAt: new Date('2026-10-23T00:00:00Z') },
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
        const chartOutput = chunks.find(chunk => chunk.type === 'tool-output-available' && chunk.toolCallId === 'call-3');
        assert.ok(chartOutput && chartOutput.type === 'tool-output-available');
        assert.deepEqual((chartOutput.output as { data: unknown[] }).data, [
            { month: '2026-01', revenue: 180000, orders: 400 },
            { month: '2026-02', revenue: 160000, orders: 350 },
        ]);
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

test('ordinary answers, tool budget and failed saves finish with text without forcing or retrying conclusions', async t => {
    const { tool } = await import('ai');
    const { z } = await import('zod');
    for (const scenario of ['ordinary', 'budget', 'failed-save', 'invalid-save'] as const) {
        await t.test(scenario, async () => {
            let calls = 0;
            let finishes = 0;
            let invalid = 0;
            const model = new MockLanguageModelV4({
                doGenerate: async options => {
                    const index = calls++;
                    if (scenario === 'ordinary' || (scenario === 'budget' ? index >= 2 : index >= 1)) {
                        assert.equal(options.toolChoice?.type, scenario === 'ordinary' ? 'auto' : 'none');
                        return {
                            content: [{ type: 'text', text: 'Available analysis. Saving was not requested or did not succeed.' }],
                            finishReason: { unified: 'stop', raw: 'stop' },
                            usage,
                            warnings: [],
                        };
                    }
                    return {
                        content: [
                            {
                                type: 'tool-call',
                                toolCallId: String(index),
                                toolName: scenario === 'budget' ? 'inspect' : 'finishAnalysis',
                                input: scenario === 'invalid-save' ? '{}' : '{"answer":"analysis"}',
                            },
                        ],
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
                        inputSchema: z.object({ answer: z.string() }),
                        execute: async (): Promise<{ ok: boolean }> => {
                            finishes++;
                            throw new Error('Evidence unavailable');
                        },
                    }),
                },
                instructions: 'Answer, saving only if explicitly requested.',
                maxSteps: 2,
                structuredCompletion: true,
                onSummaryInputError: async () => {
                    invalid++;
                },
                requestId: scenario,
                context: {},
                recordUsage: async () => {},
            });
            const result = await agent.generate({ prompt: 'Analyze' });
            assert.match(result.text, /Available analysis/);
            assert.equal(finishes, scenario === 'failed-save' ? 1 : 0);
            assert.equal(invalid, scenario === 'invalid-save' ? 1 : 0);
            assert.equal(calls, scenario === 'ordinary' ? 1 : scenario === 'budget' ? 3 : 2);
        });
    }
});

test('global analysis queries two selected sources, retains per-source evidence and rejects out-of-scope SQL', async t => {
    const f = await fixture();
    const executed: Array<{ connectionId: string; database: string | null | undefined }> = [];
    const selectedDatabases = { connection: ['sales', 'analytics'], second: 'advertising' };
    const graphs: Array<{ connectionId?: string; database: string }> = [];
    t.mock.method(schemaGetGraphAction, 'handler', async (_ctx: unknown, input: { connectionId?: string; database: string }) => {
        graphs.push(input);
        return { tables: [], relations: [] };
    });
    const explored: Array<{ connectionId?: string; database?: string }> = [];
    t.mock.method(schemaListTablesAction, 'handler', async (_ctx: unknown, input: { connectionId?: string; database?: string }) => {
        explored.push(input);
        return { tables: [] };
    });
    t.mock.method(
        queryReadOnlyExecuteAction,
        'handler',
        async (_ctx: Parameters<typeof queryReadOnlyExecuteAction.handler>[0], input: Parameters<typeof queryReadOnlyExecuteAction.handler>[1]) => {
            assert.ok(input.connectionId);
            executed.push({ connectionId: input.connectionId, database: input.database });
            const sessionId = `multi-${executed.length}`;
            return {
                session: { sessionId, userId: scope.userId, connectionId: input.connectionId, sqlText: input.sql, status: 'success', source: 'ai', durationMs: 1 },
                queryResultSets: [{ sessionId, setIndex: 0, sqlText: input.sql, columns: [{ name: 'total', type: 'numeric' }], rowCount: 1, status: 'success' }],
                results: [[{ total: 42 }]],
                meta: {},
            };
        },
    );
    try {
        await f.start('old-single');
        const work = await f.start('multi', ['connection', 'second'], selectedDatabases);
        assert.equal(work.connectionId, null);
        const analysis = f.makeAnalysis('multi', undefined, ['connection', 'second'], selectedDatabases);
        const execute = analysis.tools.sqlRunner.execute!;
        await assert.rejects(async () => execute({ connectionId: 'connection', sql: 'select 42 as total' }, call('missing-db')), /explicit database/);
        await execute({ connectionId: 'connection', database: 'sales', sql: 'select 42 as total' }, call('one'));
        await execute({ connectionId: 'second', sql: 'select 42 as total', database: 'advertising' }, call('two'));
        assert.deepEqual(executed, [
            { connectionId: 'connection', database: 'sales' },
            { connectionId: 'second', database: 'advertising' },
        ]);
        await assert.rejects(async () => execute({ connectionId: 'second', sql: 'select 42', database: 'sales' }, call('wrong-db')), /does not match/);
        await analysis.tools.exploreSchema.execute!({ operation: 'list_tables', connectionId: 'connection', database: 'analytics' }, call('schema-one'));
        await analysis.tools.exploreSchema.execute!({ operation: 'list_tables', connectionId: 'second' }, call('schema-two'));
        assert.deepEqual(
            explored.map(item => [item.connectionId, item.database]),
            [
                ['connection', 'analytics'],
                ['second', 'advertising'],
            ],
        );
        await assert.rejects(
            async () => analysis.tools.exploreSchema.execute!({ operation: 'list_tables', connectionId: 'second', database: 'sales' }, call('schema-wrong')),
            /does not match/,
        );
        await analysis.tools.getSchemaGraph.execute!({ connectionId: 'second' }, call('graph'));
        assert.deepEqual(
            graphs.map(item => [item.connectionId, item.database]),
            [['second', 'advertising']],
        );
        // External/bridge tools recover the same scope from the persisted Run.
        const bridgeSql = getAgentExecutionTools().find(tool => tool.name === 'dory_run_readonly_sql')!;
        const bridgeContext = {
            ...scope,
            locale: 'en' as const,
            runtime: 'desktop' as const,
            currentConnectionId: null,
            actor: { type: 'agent' as const, id: 'user', scopes: ['connections:read', 'query:read', 'tabs:read', 'tabs:write', 'schema:read'] },
            access: {
                source: 'local' as const,
                userId: 'user',
                organization: { id: 'org' },
                organizationId: 'org',
                isMember: true,
                role: 'owner' as const,
                permissions: getOrganizationPermissionMap('owner'),
            },
            services: { db: f.db, requestOrigin: 'https://dory.test' },
        };
        await bridgeSql.execute(bridgeContext, { workId: work.workId, requestId: 'multi', connectionId: 'second', sql: 'select 42 as total' });
        assert.deepEqual(executed.at(-1), { connectionId: 'second', database: 'advertising' });
        await assert.rejects(
            bridgeSql.execute(bridgeContext, { workId: work.workId, requestId: 'multi', connectionId: 'second', sql: 'select 42', database: 'sales' }),
            /does not match/,
        );
        const bridgeGraph = getAgentExecutionTools().find(tool => tool.name === 'dory_get_schema_graph')!;
        const graphInput = { workId: work.workId, requestId: 'multi', connectionId: 'connection', database: 'analytics' };
        assert.ok(bridgeGraph.inputSchema.safeParse(graphInput).success);
        await bridgeGraph.execute(bridgeContext, graphInput);
        assert.equal(graphs.at(-1)?.database, 'analytics');
        const persisted = await f.works.getById({ ...scope, workId: work.workId });
        assert.deepEqual(persisted?.metadata?.analysisScope, { connectionIds: ['connection', 'second'], databasesByConnection: selectedDatabases });
        await f.chat.updateSession({ ...scope, sessionId: 'chat', patch: { metadata: { analysisScope: persisted?.metadata?.analysisScope } } });
        assert.deepEqual((await f.chat.readSession({ ...scope, sessionId: 'chat' }))?.metadata?.analysisScope, persisted?.metadata?.analysisScope);
        await assert.rejects(async () => execute({ connectionId: 'other', sql: 'select 42' }, call('denied')), /outside the selected/);
        await assert.rejects(async () => execute({ sql: 'select 42' }, call('missing')), /explicit connectionId/);
        const snapshot = await f.works.getSnapshot({ ...scope, workId: work.workId });
        assert.ok(snapshot);
        const artifacts = await f.database.select().from(schema.artifacts);
        assert.deepEqual(new Set(artifacts.map(item => item.connectionId)), new Set(['connection', 'second']));
        assert.equal((await f.works.getById({ ...scope, workId: work.workId }))?.connectionId, null);
        const narrowed = await f.start('narrowed', ['second']);
        assert.deepEqual(narrowed.metadata?.analysisScope, { connectionIds: ['second'] });
        const automaticDatabase = f.makeAnalysis('narrowed', undefined, ['second']);
        await assert.rejects(async () => automaticDatabase.tools.sqlRunner.execute!({ connectionId: 'second', sql: 'select 42' }, call('auto-missing-db')), /explicit database/);
        await automaticDatabase.tools.sqlRunner.execute!({ connectionId: 'second', database: 'advertising', sql: 'select 42' }, call('auto-db'));
        await assert.rejects(bridgeSql.execute(bridgeContext, { workId: narrowed.workId, requestId: 'narrowed', connectionId: 'second', sql: 'select 42' }), /explicit database/);
        await bridgeSql.execute(bridgeContext, { workId: narrowed.workId, requestId: 'narrowed', connectionId: 'second', database: 'advertising', sql: 'select 42' });
        assert.deepEqual(executed.at(-1), { connectionId: 'second', database: 'advertising' });
        await assert.rejects(
            bridgeSql.execute(bridgeContext, { workId: narrowed.workId, requestId: 'narrowed', connectionId: 'connection', database: 'sales', sql: 'select 42' }),
            /outside the selected/,
        );
        await assert.rejects(f.works.resolveExisting({ ...scope, workId: work.workId, connectionId: 'connection' }), /outside the selected/);
    } finally {
        await f.close();
    }
});

test('a failed summary is attempted once across SDK and MCP, including validation and concurrent calls', async () => {
    const f = await fixture();
    try {
        const work = await f.start('once');
        const analysis = f.makeAnalysis('once');
        const invalid = {
            status: 'completed',
            finalAnswer: 'Available analysis',
            findings: [{ title: 'Invalid evidence', evidenceArtifactIds: ['missing'] }],
            steps: ['Read data'],
        };
        const results = await Promise.allSettled([analysis.tools.finishAnalysis.execute!(invalid, call('a')), analysis.tools.finishAnalysis.execute!(invalid, call('b'))]);
        assert.ok(results.every(result => result.status === 'rejected'));
        await assert.rejects(analysis.tools.finishAnalysis.execute!({ ...invalid, findings: [] }, call('new-id')) as Promise<unknown>, /already attempted/);
        const events = await f.works.listEvents({ ...scope, workId: work.workId });
        assert.equal(events.filter(event => event.toolName === 'dory_finish_work').length, 1);
        assert.equal((await f.works.listFindings({ ...scope, workId: work.workId })).length, 0);
        await f.works.finishChatTurn({ ...scope, workId: work.workId, requestId: 'once', outcome: 'completed' });
        assert.equal((await f.works.getById({ ...scope, workId: work.workId }))?.status, 'error');
        await f.start('next');
        const next = f.makeAnalysis('next');
        await next.tools.finishAnalysis.execute!({ ...invalid, findings: [{ title: 'Explicitly saved note' }] }, call('next'));
        await next.tools.finishAnalysis.execute!({ ...invalid, findings: [{ title: 'Must not duplicate' }] }, call('next-again'));
        assert.equal((await f.works.listFindings({ ...scope, workId: work.workId })).length, 1);
        await assert.rejects(analysis.tools.finishAnalysis.execute!(invalid, call('stale')) as Promise<unknown>, /no longer active/);
        await f.start('bad-input');
        const malformed = f.makeAnalysis('bad-input');
        await assert.rejects(malformed.tools.finishAnalysis.execute!({ ...invalid, findings: 'invalid' }, call('bad')) as Promise<unknown>);
        await assert.rejects(malformed.tools.finishAnalysis.execute!({ ...invalid, findings: [] }, call('corrected')) as Promise<unknown>, /already attempted/);
        await f.start('plain');
        await f.works.finishChatTurn({ ...scope, workId: work.workId, requestId: 'plain', outcome: 'completed' });
        assert.equal((await f.works.getById({ ...scope, workId: work.workId }))?.status, 'completed');
    } finally {
        await f.close();
    }
});

test('completed turn duration is saved on its answer and survives a subsequent turn', async () => {
    const f = await fixture();
    try {
        const work = await f.start('timed');
        await f.chat.appendMessage({
            ...scope,
            sessionId: 'chat',
            message: {
                id: 'timed-answer',
                ...scope,
                sessionId: 'chat',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Analysis complete.' }],
                metadata: { requestId: 'timed', agentRunId: work.workId },
            },
        });
        await f.works.finishChatTurn({ ...scope, workId: work.workId, requestId: 'timed', outcome: 'completed' });
        const [answer] = await f.database.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, 'timed-answer'));
        const duration = answer.metadata?.analysisDurationMs;
        assert.equal(typeof duration, 'number');
        assert.ok(Number(duration) >= 0);
        assert.equal(answer.metadata?.requestId, 'timed');
        await f.start('following');
        assert.equal(await f.works.finishChatTurn({ ...scope, workId: work.workId, requestId: 'timed', outcome: 'completed' }), null);
        const [restored] = await f.database.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, 'timed-answer'));
        assert.equal(restored.metadata?.analysisDurationMs, duration);
        assert.deepEqual(restored.parts, answer.parts);
    } finally {
        await f.close();
    }
});

test('follow-up charts read real saved rows and reject unavailable or out-of-scope Artifacts', async () => {
    const f = await fixture(true);
    try {
        const source = await f.works.create({ ...scope, connectionId: 'connection', externalSessionId: 'chart-source' });
        const rows = [
            { month: '2026-01', revenue: 180000, orders: 400 },
            { month: '2026-02', revenue: 160000, orders: 350 },
        ];
        const [artifact] = await f.works.saveSqlSnapshot(source.workId, {
            session: {
                sessionId: 'chart-source-sql',
                userId: 'user',
                connectionId: 'connection',
                database: 'main',
                sqlText: 'SELECT month, revenue, orders FROM monthly',
                status: 'success',
            },
            queryResultSets: [
                {
                    sessionId: 'chart-source-sql',
                    setIndex: 0,
                    sqlText: 'SELECT month, revenue, orders FROM monthly',
                    columns: [{ name: 'month' }, { name: 'revenue' }, { name: 'orders' }],
                    rowCount: 2,
                    status: 'success',
                },
            ],
            results: [rows],
        });
        const analysis = f.makeAnalysis('chart-followup', undefined, ['connection'], { connection: 'main' });
        await analysis.tools.publishProgress.execute!({ text: '将读取上一次已保存的月度收入查询结果，并据此生成趋势图。', nextStage: 'output' }, call('chart-progress'));
        const input = { artifactId: artifact.artifactId, chartType: 'line', xKey: 'month', yKeys: [{ key: 'revenue' }, { key: 'orders' }] };
        const chart = (await analysis.tools.chartBuilder.execute!(input, call('saved-chart'))) as { data: unknown[]; source: { artifactId: string }; dataState: string };
        assert.equal(chart.dataState, 'ready');
        assert.deepEqual(chart.data, rows);
        assert.equal(chart.source.artifactId, artifact.artifactId);
        assert.equal((await analysis.inspectCheckpoint())?.actions[0].state, 'completed');

        await f.database.update(schema.resultSets).set({ dataAvailability: 'none' }).where(eq(schema.resultSets.id, artifact.resultSetId));
        await assert.rejects(analysis.tools.chartBuilder.execute!(input, call('expired-chart')) as Promise<unknown>, /no longer available/);
        assert.equal((await analysis.inspectCheckpoint())?.actions[1].state, 'failed');

        const other = f.makeAnalysis('chart-outside-scope', undefined, ['other']);
        await other.tools.publishProgress.execute!({ text: '检查保存的图表来源是否属于本轮选择的数据源。', nextStage: 'output' }, call('other-progress'));
        await assert.rejects(other.tools.chartBuilder.execute!(input, call('outside-chart')) as Promise<unknown>, /ACCESS_DENIED/);
    } finally {
        await f.close();
    }
});

test('external Artifact evidence is explicitly read, scoped, retained and revalidated in SDK and MCP saves', async () => {
    const f = await fixture();
    try {
        const source = await f.works.create({ ...scope, connectionId: 'connection', externalSessionId: 'source-query' });
        const [artifact] = await f.works.saveSqlSnapshot(source.workId, {
            session: { sessionId: 'source-sql', userId: 'user', connectionId: 'connection', database: 'main', sqlText: 'select 42 as orders', status: 'success' },
            queryResultSets: [
                { sessionId: 'source-sql', setIndex: 0, sqlText: 'select 42 as orders', columns: [{ name: 'orders', type: 'integer' }], rowCount: 1, status: 'success' },
            ],
            results: [[{ orders: 42 }]],
        });
        await f.database.update(schema.resultSets).set({ sourceDatabaseName: null }).where(eq(schema.resultSets.id, artifact.resultSetId));
        assert.equal((await f.db.artifacts.get({ ...scope, artifactId: artifact.artifactId })).resultSet?.sourceDatabaseName, 'main');
        const work = await f.start('unread', ['connection'], { connection: 'main' });
        const payload = {
            status: 'completed',
            finalAnswer: 'The saved query returned 42 orders.',
            findings: [{ title: '42 orders', evidenceArtifactIds: [artifact.artifactId] }],
            steps: ['Read saved query'],
        };
        await assert.rejects(
            f.makeAnalysis('unread', undefined, ['connection'], { connection: 'main' }).tools.finishAnalysis.execute!(payload, call('unread')) as Promise<unknown>,
            /explicitly read/,
        );
        await f.start('read', ['connection'], { connection: ['main', 'analytics'] });
        const analysis = f.makeAnalysis('read', undefined, ['connection'], { connection: ['main', 'analytics'] });
        const preview = (await analysis.tools.readArtifact.execute!({ artifactId: artifact.artifactId }, call('read'))) as {
            evidence: { sourceWorkId: string };
            preview: { rows: unknown[] };
        };
        assert.equal(preview.evidence.sourceWorkId, source.workId);
        assert.equal(Number((preview.preview.rows[0] as { orders: unknown }).orders), 42);
        await analysis.tools.finishAnalysis.execute!(payload, call('save'));
        const findings = await f.works.listFindings({ ...scope, workId: work.workId });
        assert.equal(findings[0].evidence[0].id, artifact.artifactId);
        assert.equal((await f.db.artifacts.get({ organizationId: scope.organizationId, artifactId: artifact.artifactId })).workId, source.workId);
        const ctx = {
            ...scope,
            locale: 'en' as const,
            runtime: 'desktop' as const,
            currentConnectionId: null,
            actor: { type: 'agent' as const, id: 'user', scopes: ['connections:read', 'query:read', 'schema:read', 'assets:read'] },
            access: { source: 'local' as const, ...scope, organization: { id: 'org' }, isMember: true, role: 'owner' as const, permissions: getOrganizationPermissionMap('owner') },
            services: { db: f.db, requestOrigin: 'https://dory.test' },
        };
        const read = getAgentExecutionTools().find(tool => tool.name === 'dory_artifacts')!;
        const finish = getAgentExecutionTools().find(tool => tool.name === 'dory_finish_work')!;
        await f.start('mcp', ['connection'], { connection: ['main', 'analytics'] });
        await read.execute(ctx, { artifactId: artifact.artifactId, workId: work.workId, requestId: 'mcp' });
        await finish.execute(ctx, { ...payload, workId: work.workId, requestId: 'mcp' });
        await finish.execute(ctx, { ...payload, workId: work.workId, requestId: 'mcp' });
        assert.equal((await f.works.listFindings({ ...scope, workId: work.workId })).length, 2);
        const summary = (await f.works.getById({ ...scope, workId: work.workId }))?.metadata?.agentRunSummary as {
            sections: Array<{ evidence: Record<string, { sourceWorkId: string }> }>;
        };
        assert.equal(summary.sections[0].evidence[artifact.artifactId].sourceWorkId, source.workId);
        assert.equal(summary.sections[1].evidence[artifact.artifactId].sourceWorkId, source.workId);
        await f.start('narrow-save', ['connection'], { connection: ['main', 'analytics'] });
        await read.execute(ctx, { artifactId: artifact.artifactId, workId: work.workId, requestId: 'narrow-save' });
        const beforeNarrow = await f.works.getById({ ...scope, workId: work.workId });
        await f.database
            .update(schema.works)
            .set({ metadata: { ...beforeNarrow!.metadata, analysisScope: { connectionIds: ['connection'], databasesByConnection: { connection: ['other-db', 'third-db'] } } } })
            .where(eq(schema.works.workId, work.workId));
        await assert.rejects(finish.execute(ctx, { ...payload, workId: work.workId, requestId: 'narrow-save' }), /outside the selected database/);
        await f.start('db-mismatch', ['connection'], { connection: ['other-db', 'third-db'] });
        await assert.rejects(read.execute(ctx, { artifactId: artifact.artifactId, workId: work.workId, requestId: 'db-mismatch' }), /selected database/);
        await f.start('source-mismatch', ['other']);
        await assert.rejects(read.execute(ctx, { artifactId: artifact.artifactId, workId: work.workId, requestId: 'source-mismatch' }), /scope/);
        await f.start('expired', ['connection']);
        await read.execute(ctx, { artifactId: artifact.artifactId, workId: work.workId, requestId: 'expired' });
        await f.database.update(schema.resultSets).set({ dataAvailability: 'none' }).where(eq(schema.resultSets.id, artifact.resultSetId));
        await assert.rejects(finish.execute(ctx, { ...payload, workId: work.workId, requestId: 'expired' }), /no longer available/);
        await assert.rejects(finish.execute(ctx, { ...payload, workId: work.workId, requestId: 'expired' }), /already attempted/);
        await f.database.update(schema.resultSets).set({ dataAvailability: 'full' }).where(eq(schema.resultSets.id, artifact.resultSetId));
        await f.start('denied', ['connection']);
        await f.database.insert(schema.user).values({ id: 'someone-else', name: 'Other user', email: 'other@example.test' });
        await f.database.update(schema.works).set({ userId: 'someone-else' }).where(eq(schema.works.workId, source.workId));
        await assert.rejects(read.execute(ctx, { artifactId: artifact.artifactId, workId: work.workId, requestId: 'denied' }), /unavailable/);
        await assert.rejects(
            f.works.inspectChatEvidence({ ...scope, organizationId: 'another-org', workId: work.workId, requestId: 'denied', artifactId: artifact.artifactId }),
            /no longer active/,
        );
    } finally {
        await f.close();
    }
});

test('chat progress persists ordered revisions, isolates requests and validates claimed Bridge ownership', async () => {
    const f = await fixture();
    try {
        const run = await f.start('progress-1');
        const owner = { ...scope, workId: run.workId, requestId: 'progress-1' };
        const entry = { id: 'text', sequence: 0, revision: 1, kind: 'text' as const, text: '开始分析', phase: 'commentary' as const };
        await Promise.all([
            f.works.appendChatProgress({ ...owner, entries: [entry] }),
            f.works.appendChatProgress({ ...owner, entries: [{ ...entry, revision: 2, text: '已读取结果' }] }),
        ]);
        const events = await f.works.listEvents(owner);
        assert.equal(events.filter(event => event.toolName === 'chat_progress').length, 1);
        assert.equal((events[0].outputSummary?.entries as Array<{ text: string }>)[0].text, '已读取结果');
        await assert.rejects(f.works.appendChatProgress({ ...owner, userId: 'other', entries: [entry] }), /no longer active/);
        await f.database.insert(schema.localAiBridges).values({ id: 'progress-bridge', ...scope, mcpTokenId: 'token', provider: 'codex-agent', name: 'test' });
        await f.database.insert(schema.localAiJobs).values({
            id: 'progress-job',
            organizationId: scope.organizationId,
            bridgeId: 'progress-bridge',
            provider: 'codex-agent',
            model: 'default',
            prompt: '',
            status: 'claimed',
            expiresAt: new Date(Date.now() + 60_000),
        });
        await f.works.bindChatBridgeJob({ ...owner, jobId: 'progress-job' });
        const bridge = { jobId: 'progress-job', bridgeId: 'progress-bridge', mcpTokenId: 'token' };
        await f.works.appendChatProgress({ ...owner, bridge, entries: [{ ...entry, revision: 3 }] });
        await assert.rejects(f.works.appendChatProgress({ ...owner, bridge: { ...bridge, mcpTokenId: 'wrong' }, entries: [entry] }), /no longer accepted/);
        await f.database.update(schema.localAiJobs).set({ status: 'completed' }).where(eq(schema.localAiJobs.id, bridge.jobId));
        await assert.rejects(f.works.appendChatProgress({ ...owner, bridge, entries: [entry] }), /no longer accepted/);
        await f.start('progress-2');
        await assert.rejects(f.works.appendChatProgress({ ...owner, entries: [entry] }), /no longer active/);
        assert.equal((await f.works.listEvents(owner)).filter(event => event.inputSummary?.requestId === 'progress-1').length, 1);
    } finally {
        await f.close();
    }
});

test('server stages accept concurrent actions without progress and reject stale turns', async () => {
    const f = await fixture(true);
    try {
        const work = await f.start('stages');
        const owner = { ...scope, workId: work.workId, requestId: 'stages' };
        const run = (command: import('@dory/shared/types/chat-checkpoints').CheckpointCommand) => f.works.chatCheckpoint({ ...owner, command });
        const reserved = await Promise.all([1, 2, 3, 4].map(i => run({ kind: 'reserve', id: `action-${i}`, toolName: 'read_asset', stage: 'reference' })));
        assert.equal(reserved.filter(value => value?.accepted).length, 4);
        assert.equal((await run({ kind: 'reserve', id: 'schema', toolName: 'exploreSchema', stage: 'schema' }))?.accepted, true);
        for (const i of [3, 1, 2, 4]) await run({ kind: 'settle', id: `action-${i}`, failed: i === 2, result: 'result' });
        for (let i = 0; i < 20; i++) await run({ kind: 'publish', checkpointId: 'stale', text: '', nextStage: 'query' });
        assert.equal((await run({ kind: 'inspect' }))?.stopped, false);
        assert.equal((await run({ kind: 'reserve', id: 'sql', toolName: 'sqlRunner', stage: 'query' }))?.accepted, true);
        assert.equal((await run({ kind: 'reserve', id: 'sql', toolName: 'sqlRunner', stage: 'query' }))?.duplicate, true);
        const event = (await f.works.listEvents(owner)).find(event => event.toolName === 'chat_checkpoints');
        const state = event?.outputSummary?.state as import('@dory/shared/types/chat-checkpoints').ChatCheckpoints;
        assert.deepEqual(state.entries.map(entry => entry.id).sort(), ['action-1', 'action-2', 'action-3', 'action-4', 'schema', 'sql']);
        assert.deepEqual(
            state.entries.map(entry => entry.sequence),
            [0, 1, 2, 3, 4, 5],
        );
        assert.deepEqual(
            state.entries.map(entry => entry.id),
            state.actions.map(action => action.id),
        );
        assert.equal(state.entries.find(entry => entry.id === 'action-2')?.state, 'failed');
        await assert.rejects(f.works.chatCheckpoint({ ...owner, userId: 'stranger', command: { kind: 'inspect' } }), /no longer active/);
        await f.start('next-stage-turn');
        await assert.rejects(run({ kind: 'inspect' }), /no longer active/);
    } finally {
        await f.close();
    }
});

test('SDK monthly analysis advances from three schema actions to SQL with host-owned checkpoint IDs', async t => {
    const f = await fixture(true);
    t.mock.method(schemaListDatabasesAction, 'handler', async () => ({ databases: [{ label: 'main', value: 'main' }] }));
    t.mock.method(schemaListTablesAction, 'handler', async () => ({ tables: [{ name: 'orders' }] }));
    t.mock.method(schemaDescribeTableAction, 'handler', async () => ({ columns: [{ columnName: 'ordered_at', columnType: 'TEXT' }] }));
    let sqlCalls = 0;
    t.mock.method(queryReadOnlyExecuteAction, 'handler', async () => {
        sqlCalls++;
        return {
            session: {
                sessionId: 'monthly-sql',
                userId: 'user',
                connectionId: 'connection',
                sqlText: 'SELECT COUNT(order_id) AS orders FROM orders',
                status: 'success',
                source: 'ai',
                durationMs: 10,
            },
            queryResultSets: [
                {
                    sessionId: 'monthly-sql',
                    setIndex: 0,
                    sqlText: 'SELECT COUNT(order_id) AS orders FROM orders',
                    columns: [{ name: 'orders', type: 'integer' }],
                    rowCount: 1,
                    status: 'success',
                },
            ],
            results: [[{ orders: 42 }]],
            meta: {},
        };
    });
    try {
        const work = await f.start('monthly');
        const analysis = f.makeAnalysis('monthly');
        const progress = { text: '已确认 orders 表的 ordered_at 字段，接下来执行月度订单聚合查询。', nextStage: 'query' };
        const calls = [
            { toolName: 'publishProgress', input: { text: '我先检查订单表和日期字段，再按月统计订单数。', nextStage: 'schema' } },
            { toolName: 'exploreSchema', input: { operation: 'list_databases' } },
            { toolName: 'exploreSchema', input: { operation: 'list_tables', database: 'main' } },
            { toolName: 'exploreSchema', input: { operation: 'describe_table', database: 'main', table: 'orders' } },
            // Reproduce the erroneous ID from the original session. It is no longer
            // part of the SDK schema and cannot override the host's current ID.
            { toolName: 'publishProgress', input: { ...progress, checkpointId: 'monthly:2' } },
            { toolName: 'sqlRunner', input: { connectionId: 'connection', database: 'main', sql: 'SELECT COUNT(order_id) AS orders FROM orders' } },
        ];
        let step = 0;
        const agent = buildDoryChatAgent({
            model: new MockLanguageModelV4({
                doGenerate: async options => {
                    const current = step++;
                    const progressTool = options.tools?.find(tool => tool.name === 'publishProgress');
                    if (progressTool?.type === 'function') {
                        const properties = progressTool.inputSchema.properties as Record<string, unknown>;
                        assert.deepEqual(Object.keys(properties).sort(), ['nextStage', 'text']);
                    }
                    if (current === 4) assert.ok(options.tools?.some(tool => tool.name === 'sqlRunner'));
                    if (current === 5) assert.ok(options.tools?.some(tool => tool.name === 'sqlRunner'));
                    if (current === calls.length) {
                        assert.equal(sqlCalls, 1);
                        assert.match(JSON.stringify(options.prompt), /"orders":42/);
                        return { content: [{ type: 'text', text: '实际查询得到 42 个订单。' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] };
                    }
                    const action = calls[current];
                    return {
                        content: [{ type: 'tool-call', toolCallId: `monthly-${current}`, toolName: action.toolName, input: JSON.stringify(action.input) }],
                        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                        usage,
                        warnings: [],
                    };
                },
            }),
            tools: analysis.tools,
            instructions: 'Analyze monthly orders using query results.',
            requestId: 'monthly',
            checkpoint: { inspect: analysis.inspectCheckpoint, invalid: analysis.invalidProgress },
            context: {},
            recordUsage: async () => {},
        });
        const result = await agent.generate({ prompt: '帮我做月度订单分析' });
        assert.match(result.text, /42/);
        assert.equal(sqlCalls, 1);
        const state = await analysis.inspectCheckpoint();
        assert.equal(state?.stopped, false);
        assert.equal(state?.checkpointId, 'monthly:2');
        assert.equal(state?.stage, 'query');
        assert.equal((await f.database.select().from(schema.artifacts)).length, 1);

        // Replaying the same SDK call must not consume another checkpoint.
        await analysis.tools.publishProgress.execute!(progress, call('monthly-4'));
        assert.equal((await analysis.inspectCheckpoint())?.checkpointId, 'monthly:2');
        await f.start('later-turn');
        await assert.rejects(analysis.tools.publishProgress.execute!(progress, call('stale-progress')) as Promise<unknown>, /no longer active/);
        assert.equal((await f.works.getById({ ...scope, workId: work.workId }))?.status, 'active');
    } finally {
        await f.close();
    }
});

test('SDK tools remain available across automatic stage changes and progress is optional', async () => {
    const { tool } = await import('ai');
    const { z } = await import('zod');
    const { initialChatCheckpoints, applyCheckpointCommand } = await import('@dory/shared/types/chat-checkpoints');
    for (const name of ['chartBuilder', 'readAttachment', 'queryAttachment']) {
        const state = initialChatCheckpoints();
        state.stage = 'output';
        let calls = 0;
        let executions = 0;
        const agent = buildDoryChatAgent({
            model: new MockLanguageModelV4({
                doGenerate: async options => {
                    assert.ok(options.tools?.some(tool => tool.name === name));
                    if (calls++ === 0)
                        return {
                            content: [{ type: 'tool-call', toolCallId: 'first', toolName: name, input: '{}' }],
                            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                            usage,
                            warnings: [],
                        };
                    assert.equal(executions, 1);
                    return { content: [{ type: 'text', text: 'Completed from verified data.' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] };
                },
            }),
            tools: {
                [name]: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        const admission = applyCheckpointCommand(state, 'automatic', {
                            kind: 'reserve',
                            id: 'first',
                            toolName: name,
                            stage: name === 'chartBuilder' ? 'output' : name === 'queryAttachment' ? 'query' : 'reference',
                        });
                        assert.equal(admission.accepted, true);
                        executions++;
                        applyCheckpointCommand(state, 'automatic', { kind: 'settle', id: 'first', failed: false, result: 'verified' });
                        return { ok: true };
                    },
                }),
            },
            checkpoint: { inspect: async () => applyCheckpointCommand(state, 'automatic', { kind: 'inspect' }), invalid: async () => {} },
            instructions: 'Use the supplied source.',
            requestId: 'automatic',
            context: {},
            recordUsage: async () => {},
        });
        assert.match((await agent.generate({ prompt: 'Continue' })).text, /verified/);
        assert.equal(state.revision, 0);
    }
});

test('requested reports save before completion and an execution limit preserves an unsaved answer', async () => {
    const { tool } = await import('ai');
    const { z } = await import('zod');
    for (const fail of [false, true]) {
        let reportStatus: 'missing' | 'draft' | 'ready' = 'missing';
        let step = 0;
        let saves = 0;
        const agent = buildDoryChatAgent({
            model: new MockLanguageModelV4({
                doGenerate: async options => {
                    const current = step++;
                    if (current === 2) {
                        assert.equal(options.toolChoice?.type, fail ? 'none' : 'auto');
                        return {
                            content: [{ type: 'text', text: fail ? 'Report save failed; analysis preserved.' : 'Report saved.' }],
                            finishReason: { unified: 'stop', raw: 'stop' },
                            usage,
                            warnings: [],
                        };
                    }
                    assert.equal(options.toolChoice?.type, 'required');
                    assert.ok(!options.tools?.some(tool => tool.name === 'finishAnalysis'));
                    return {
                        content: [{ type: 'tool-call', toolCallId: `report-${current}`, toolName: current === 0 ? 'createWorkReport' : 'updateWorkReport', input: '{}' }],
                        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                        usage,
                        warnings: [],
                    };
                },
            }),
            tools: {
                createWorkReport: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        reportStatus = 'draft';
                        return { status: 'draft' };
                    },
                }),
                updateWorkReport: tool({
                    inputSchema: z.object({}),
                    execute: async () => {
                        saves++;
                        if (fail) throw new Error('Storage unavailable');
                        reportStatus = 'ready';
                        return { status: 'ready' };
                    },
                }),
            },
            requiredReport: { status: async () => reportStatus },
            maxSteps: fail ? 2 : 4,
            instructions: 'Save the requested report.',
            requestId: 'report',
            context: {},
            recordUsage: async () => {},
        });
        assert.match((await agent.generate({ prompt: 'Create report' })).text, fail ? /failed/ : /saved/);
        assert.equal(saves, 1);
    }
});

test('server recovery rejects unchanged failures, caps retries and preserves execution budget', async () => {
    const { initialChatCheckpoints, applyCheckpointCommand } = await import('@dory/shared/types/chat-checkpoints');
    const { chatToolFailure } = await import('@dory/shared/types/chat-tool-error');
    const state = initialChatCheckpoints();
    const run = (command: import('@dory/shared/types/chat-checkpoints').CheckpointCommand) => applyCheckpointCommand(state, 'recovery', command);
    const fail = (id: string) =>
        run({ kind: 'settle', id, failed: true, result: 'invalid column', failure: chatToolFailure(new Error('Chart fields do not match'), 'chartBuilder') });
    assert.equal(run({ kind: 'reserve', id: 'a', toolName: 'chartBuilder', stage: 'output', fingerprint: 'same' }).accepted, true);
    fail('a');
    assert.equal(run({ kind: 'reserve', id: 'b', toolName: 'chartBuilder', stage: 'output', fingerprint: 'same' }).control, 'answer_required');
    assert.equal(run({ kind: 'reserve', id: 'read', toolName: 'readArtifact', stage: 'reference' }).accepted, true);
    run({ kind: 'settle', id: 'read', failed: false, result: 'columns confirmed' });
    assert.equal(run({ kind: 'reserve', id: 'c', toolName: 'chartBuilder', stage: 'output', fingerprint: 'corrected' }).accepted, true);
    fail('c');
    assert.equal(run({ kind: 'reserve', id: 'd', toolName: 'chartBuilder', stage: 'output', fingerprint: 'corrected-again' }).accepted, true);
    fail('d');
    assert.equal(run({ kind: 'reserve', id: 'e', toolName: 'chartBuilder', stage: 'output', fingerprint: 'third' }).control, 'answer_required');
    const budget = initialChatCheckpoints();
    budget.maxActions = 2;
    assert.equal(applyCheckpointCommand(budget, 'budget', { kind: 'reserve', id: '1', toolName: 'readAttachment', stage: 'reference' }).accepted, true);
    assert.equal(applyCheckpointCommand(budget, 'budget', { kind: 'reserve', id: '1', toolName: 'readAttachment', stage: 'reference' }).duplicate, true);
    assert.equal(applyCheckpointCommand(budget, 'budget', { kind: 'reserve', id: '2', toolName: 'queryAttachment', stage: 'query' }).accepted, true);
    assert.equal(applyCheckpointCommand(budget, 'budget', { kind: 'reserve', id: '3', toolName: 'chartBuilder', stage: 'output' }).stopped, true);
});

test('MCP automatically admits stages and progress mistakes do not stop real tool work', async t => {
    const f = await fixture(true);
    let reads = 0;
    t.mock.method(catalogReadAction, 'handler', async () => {
        reads++;
        return {
            asset,
            content: { definition: 'One order per order_id' },
            relatedRefs: [],
            citation: { ref: asset.ref, title: asset.title, revision: 'v1', deepLink: asset.deepLink },
        };
    });
    try {
        const work = await f.start('mcp-auto');
        const ctx = {
            ...scope,
            locale: 'en' as const,
            runtime: 'desktop' as const,
            currentConnectionId: 'connection',
            actor: { type: 'agent' as const, id: 'user', scopes: ['connections:read', 'query:read', 'schema:read', 'assets:read', 'knowledge:read'] },
            access: { source: 'local' as const, ...scope, organization: { id: 'org' }, isMember: true, role: 'owner' as const, permissions: getOrganizationPermissionMap('owner') },
            services: { db: f.db, requestOrigin: 'https://dory.test' },
        };
        const invoke = (name: string, input: Record<string, unknown>) =>
            getAgentExecutionTools()
                .find(tool => tool.name === name)!
                .execute(ctx, { ...input, workId: work.workId, requestId: 'mcp-auto' }) as Promise<Record<string, unknown>>;
        for (let i = 0; i < 4; i++) await invoke('dory_read', { operation: 'run', actionId: 'catalog.read', input: { ref: asset.ref } });
        assert.equal(reads, 4);
        for (let i = 0; i < 3; i++) await invoke('dory_publish_progress', { checkpointId: 'stale', text: '', nextStage: 'schema' });
        await invoke('dory_read', { operation: 'run', actionId: 'catalog.read', input: { ref: asset.ref } });
        assert.equal(reads, 5);
        const state = (await f.works.listEvents({ ...scope, workId: work.workId })).find(event => event.toolName === 'chat_checkpoints')?.outputSummary
            ?.state as import('@dory/shared/types/chat-checkpoints').ChatCheckpoints;
        assert.equal(state.stopped, undefined);
        assert.equal(state.actions.length, 5);
    } finally {
        await f.close();
    }
});
