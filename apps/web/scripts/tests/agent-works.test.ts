import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { WorkDocumentView } from '@dory/shared/types/work-document';

import { renderSharedReport, shareCsv, shareFilename } from '@/lib/work-documents/share';
import { searchWorks, workStatus } from '@/lib/work-documents/work-summary';
import { completeAgentWorkTitle } from '@/lib/work-documents/work-title';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;
const directory = await mkdtemp(join(tmpdir(), 'dory-agent-works-'));
const postgres = process.env.AGENT_WORKS_TEST_POSTGRES === '1';
process.env.DB_TYPE = postgres ? 'postgres' : 'pglite';
process.env.PGLITE_DB_PATH = join(directory, 'db');
const { getClient } = await import('@dory/database/postgres/client');
const { resetPgliteClient } = await import('@dory/database/postgres/client/pglite');
const { getDBService } = await import('@dory/database');
const schema = await import('@dory/database/postgres/schemas');
const { listAgentWorks } = await import('@/lib/server/agent-works');

export const report: WorkDocumentView = {
    id: 'doc',
    title: 'Monthly revenue',
    chatId: 'chat',
    scope: { connectionIds: ['private-connection'] },
    revision: 2,
    status: 'ready',
    archivedAt: null,
    createdAt: '2026-10-25T00:00:00Z',
    updatedAt: '2026-10-26T00:00:00Z',
    content: {
        markdown: 'A **finding**. [Evidence](dory://evidence/private-artifact)\n\n![Trend](dory://visual/trend)',
        knowledge: [],
        visuals: [{ id: 'trend', title: 'Revenue trend', type: 'chart', evidenceId: 'private-artifact', chart: { type: 'bar', xKey: 'month', yKey: 'revenue' } }],
        evidence: [
            {
                artifactId: 'private-artifact',
                title: 'Private SQL',
                connectionId: 'private-connection',
                connectionName: 'Private database',
                sql: 'SELECT private_secret FROM private_table',
                capturedAt: '2026-10-26T00:00:00Z',
                runId: 'private-run',
                columns: ['month', 'revenue'],
                rows: [{ month: 'October', revenue: 42 }],
                rowCount: 1,
                truncated: true,
            },
        ],
    },
};

test('shared reports include only presentation content and preserve the preview scope', () => {
    const html = renderSharedReport(report);
    assert.match(html, /<strong>finding<\/strong>/);
    assert.match(html, /<svg/);
    assert.match(html, /Preview/);
    assert.doesNotMatch(html, /private-|Private database|Private SQL|SELECT|Sources|dory:\/\/|data-evidence/);
});

test('CSV preserves Chinese, multiline values, quotes, empty values and formula safety', () => {
    assert.equal(
        shareCsv(
            ['名称', '值'],
            [
                { 名称: '中文,"一"\n二', 值: null },
                { 名称: '=SUM(1)', 值: -2 },
            ],
        ),
        '\uFEFF"名称","值"\r\n"中文,""一""\n二",""\r\n"\'=SUM(1)","-2"',
    );
    assert.equal(shareFilename('收入/分析', 'csv', true), '收入-分析-preview.csv');
});

test('latest turn status distinguishes stopping, failure, completion and continuation', () => {
    assert.equal(workStatus('error', { chatTurn: { outcome: 'aborted' } }), 'stopped');
    assert.equal(workStatus('error', null), 'failed');
    assert.equal(workStatus('completed', null), 'completed');
    assert.equal(workStatus('active', { chatTurn: { outcome: 'aborted' } }), 'running');
    assert.equal(workStatus(undefined, null), 'idle');
});

test('work metadata aggregation, title races and owner isolation use the shared persistence path', async () => {
    try {
        const database = await getClient();
        if (postgres)
            await migratePostgres(database as unknown as NodePgDatabase, {
                migrationsFolder: new URL('../../../../packages/database/src/postgres/migrations', import.meta.url).pathname,
            });
        else await migrate(database as unknown as PgliteDatabase, { migrationsFolder: new URL('../../../../packages/database/src/pglite/migrations', import.meta.url).pathname });
        const db = await getDBService();
        const owner = { organizationId: 'works-org', userId: 'works-user' };
        await database.insert(schema.user).values({ id: owner.userId, name: 'Works user', email: 'works@example.test' });
        await database.insert(schema.organizations).values({ id: owner.organizationId, name: 'Works', ownerUserId: owner.userId });
        await db.chat.createGlobalSession({ ...owner, id: 'chat', metadata: { workTitleSource: 'pending' } });
        await db.chat.appendMessage({
            ...owner,
            sessionId: 'chat',
            message: { ...owner, sessionId: 'chat', role: 'user', parts: [{ type: 'text', text: 'Please analyze monthly revenue and use this private raw prompt' }] },
        });
        assert.equal((await db.chat.readSession({ ...owner, sessionId: 'chat' }))?.title, null);
        const claims = await Promise.all([db.chat.claimWorkTitle({ ...owner, sessionId: 'chat' }), db.chat.claimWorkTitle({ ...owner, sessionId: 'chat' })]);
        assert.equal(claims.filter(Boolean).length, 1);
        await db.chat.updateSession({ ...owner, sessionId: 'chat', patch: { title: 'Human title' } });
        await db.chat.finishWorkTitle({ ...owner, sessionId: 'chat' }, 'Agent title');
        assert.equal((await db.chat.readSession({ ...owner, sessionId: 'chat' }))?.title, 'Human title');
        await db.chat.updateSession({ ...owner, sessionId: 'chat', patch: { metadata: { analysisScope: { connectionIds: [] } } } });
        assert.equal((await db.chat.readSession({ ...owner, sessionId: 'chat' }))?.metadata?.workTitleSource, 'user');
        await db.chat.createGlobalSession({ ...owner, id: 'title-failure', metadata: { workTitleSource: 'pending' } });
        await completeAgentWorkTitle(db.chat, { ...owner, sessionId: 'title-failure' }, async () => {
            throw new Error('Model unavailable');
        });
        assert.equal(await db.chat.claimWorkTitle({ ...owner, sessionId: 'title-failure' }), false);
        assert.equal((await db.chat.readSession({ ...owner, sessionId: 'title-failure' }))?.metadata?.workTitleSource, 'failed');
        await db.chat.createGlobalSession({ ...owner, id: 'title-success', metadata: { workTitleSource: 'pending' } });
        let generations = 0;
        const generate = async () => {
            generations++;
            return '月度收入分析';
        };
        await Promise.all([
            completeAgentWorkTitle(db.chat, { ...owner, sessionId: 'title-success' }, generate),
            completeAgentWorkTitle(db.chat, { ...owner, sessionId: 'title-success' }, generate),
        ]);
        assert.equal(generations, 1);
        assert.equal((await db.chat.readSession({ ...owner, sessionId: 'title-success' }))?.title, '月度收入分析');
        await db.chat.createGlobalSession({ ...owner, id: 'legacy', title: 'Original prompt title' });
        assert.equal(await db.chat.claimWorkTitle({ ...owner, sessionId: 'legacy' }), false);
        await db.chat.updateSession({ ...owner, sessionId: 'legacy', patch: { metadata: null } });
        assert.equal((await db.chat.readSession({ ...owner, sessionId: 'legacy' }))?.metadata, null);
        const run = await db.works.startChatTurn({
            ...owner,
            externalSessionId: 'chat:chat',
            title: 'Analysis',
            metadata: { source: 'internal_chat', chatId: 'chat' },
            requestId: 'turn-1',
        });
        await db.works.finishChatTurn({ ...owner, workId: run.workId, requestId: 'turn-1', outcome: 'completed' });
        await db.chat.appendMessage({
            ...owner,
            sessionId: 'chat',
            message: {
                ...owner,
                sessionId: 'chat',
                id: 'assistant',
                role: 'assistant',
                metadata: { agentRunId: run.workId },
                parts: [{ type: 'tool_call', tool: 'chartBuilder', callId: 'unused', args: {} }],
            },
        });
        // Persist the current SDK tool envelope, including a duplicate reference and a failed chart.
        await database
            .update(schema.chatMessages)
            .set({
                parts: [
                    {
                        type: 'tool-chartBuilder',
                        toolCallId: 'chart-1',
                        state: 'output-available',
                        output: { type: 'chart', title: 'Revenue breakdown', chartType: 'bar', dataState: 'ready', data: [{ private_rows: 42 }] },
                    },
                    { type: 'tool-chartBuilder', toolCallId: 'chart-1', output: { type: 'chart', title: 'Revenue breakdown', data: [{ private_rows: 42 }] } },
                    { type: 'tool-chartBuilder', toolCallId: 'bad-chart', output: { type: 'chart', dataState: 'missing', data: [] } },
                ] as unknown as typeof schema.chatMessages.$inferInsert.parts,
            })
            .where((await import('drizzle-orm')).eq(schema.chatMessages.id, 'assistant'));
        const savedReport = await db.workDocuments.create({ ...owner, creationKey: 'report', chatId: 'chat', title: report.title, scope: report.scope, content: report.content });
        await db.workDocuments.update({
            ...owner,
            documentId: savedReport.id,
            expectedRevision: savedReport.revision,
            title: savedReport.title,
            scope: report.scope,
            content: report.content,
            status: 'ready',
            source: 'user',
        });
        const archivedReport = await db.workDocuments.create({
            ...owner,
            creationKey: 'archived',
            chatId: 'chat',
            title: 'Archived report',
            scope: report.scope,
            content: report.content,
        });
        await db.workDocuments.archive({ ...owner, documentId: archivedReport.id, archived: true });
        const artifactRef = { store: 'filesystem', artifactId: 'stored', basePath: '/tmp/works-test', manifestPath: '/tmp/works-test/manifest', dataAvailability: 'full' as const };
        await database.insert(schema.resultSets).values([
            {
                id: 'rows',
                organizationId: owner.organizationId,
                workId: run.workId,
                sourceType: 'query-run',
                kind: 'sql-result-set',
                status: 'success',
                dataAvailability: 'full',
                artifactRefJson: artifactRef,
                createdByActorType: 'user',
            },
            {
                id: 'expired-rows',
                organizationId: owner.organizationId,
                workId: run.workId,
                sourceType: 'query-run',
                kind: 'sql-result-set',
                status: 'success',
                dataAvailability: 'full',
                expiresAt: new Date('2020-01-01'),
                artifactRefJson: artifactRef,
                createdByActorType: 'user',
            },
            {
                id: 'failed-rows',
                organizationId: owner.organizationId,
                workId: run.workId,
                sourceType: 'query-run',
                kind: 'sql-result-set',
                status: 'error',
                dataAvailability: 'none',
                artifactRefJson: artifactRef,
                createdByActorType: 'user',
            },
        ]);
        await database.insert(schema.artifacts).values([
            {
                id: 'result-1',
                organizationId: owner.organizationId,
                workId: run.workId,
                type: 'result_set',
                title: 'Saved result',
                resourceId: 'rows',
                sourceResultSetId: 'rows',
                createdByActorType: 'user',
            },
            {
                id: 'result-reference',
                organizationId: owner.organizationId,
                agentRunId: run.workId,
                type: 'result_set',
                title: 'Referenced result',
                resourceId: 'reference-rows',
                sourceResultSetId: 'rows',
                createdByActorType: 'user',
            },
            {
                id: 'saved-chart',
                organizationId: owner.organizationId,
                workId: run.workId,
                type: 'chart',
                title: 'Saved chart',
                resourceId: 'chart-resource',
                sourceResultSetId: 'rows',
                createdByActorType: 'user',
            },
            {
                id: 'expired-chart',
                organizationId: owner.organizationId,
                workId: run.workId,
                type: 'chart',
                title: 'Expired chart',
                resourceId: 'expired-resource',
                sourceResultSetId: 'expired-rows',
                createdByActorType: 'user',
            },
            {
                id: 'failed-result',
                organizationId: owner.organizationId,
                workId: run.workId,
                type: 'result_set',
                title: 'Failed result',
                resourceId: 'failed-rows',
                sourceResultSetId: 'failed-rows',
                createdByActorType: 'user',
            },
            {
                id: 'download',
                organizationId: owner.organizationId,
                workId: run.workId,
                type: 'file',
                title: 'CSV download',
                resourceId: 'download',
                sourceResultSetId: 'rows',
                createdByActorType: 'user',
            },
        ]);
        const summaries = await listAgentWorks(db, owner, await db.chat.listSessions({ ...owner, type: 'global' }));
        const work = summaries.find(item => item.id === 'chat')!;
        assert.equal(work.status, 'completed');
        assert.deepEqual(work.counts, { report: 1, chart: 4, result: 1 });
        assert.equal(work.outputs.find(output => output.id === 'expired-chart')?.available, false);
        assert.ok(!work.outputs.some(output => ['failed-result', 'download', archivedReport.id].includes(output.id)));
        assert.equal(work.outputs.find(output => output.type === 'report')?.available, true);
        assert.doesNotMatch(JSON.stringify(work), /private_rows|private-connection|SELECT|raw prompt/);
        assert.equal(searchWorks(summaries, 'BREAKDOWN').length, 1);
        assert.equal(searchWorks(summaries, 'BREAKDOWN')[0].matchedOutput, 'Revenue breakdown');
        assert.equal(searchWorks(summaries, 'no match').length, 0);
        const firstRead = JSON.stringify(summaries);
        assert.equal(JSON.stringify(await listAgentWorks(db, owner, await db.chat.listSessions({ ...owner, type: 'global' }))), firstRead);
        assert.deepEqual(await db.chat.listWorkSources({ ...owner, userId: 'outsider' }, ['chat']), { runs: [], reports: [], artifacts: [], messages: [] });
        const latest = async () => (await listAgentWorks(db, owner, await db.chat.listSessions({ ...owner, type: 'global' }))).find(item => item.id === 'chat')!;
        for (const outcome of ['aborted', 'failed', 'completed'] as const) {
            const requestId = `turn-${outcome}`;
            await db.works.startChatTurn({ ...owner, externalSessionId: 'chat:chat', metadata: { source: 'internal_chat', chatId: 'chat' }, requestId });
            assert.equal((await latest()).status, 'running');
            await db.works.finishChatTurn({ ...owner, workId: run.workId, requestId, outcome });
            assert.equal((await latest()).status, outcome === 'aborted' ? 'stopped' : outcome === 'failed' ? 'failed' : 'completed');
            assert.deepEqual((await latest()).counts, work.counts);
        }
    } finally {
        if (postgres) await ((await getClient()) as unknown as { $client: Pool }).$client.end();
        else await resetPgliteClient();
        await rm(directory, { recursive: true, force: true });
    }
});
