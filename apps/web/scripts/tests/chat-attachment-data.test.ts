import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Readable } from 'node:stream';
import type { ToolExecutionOptions } from 'ai';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;
const directory = await mkdtemp(join(tmpdir(), 'dory-attachment-service-'));
process.env.DB_TYPE = 'pglite';
process.env.PGLITE_DB_PATH = join(directory, 'db');
process.env.DORY_ARTIFACTS_FILESYSTEM_DIR = join(directory, 'artifacts');
const { getClient } = await import('@dory/database/postgres/client');
const { resetPgliteClient } = await import('@dory/database/postgres/client/pglite');
const { getDBService } = await import('@dory/database');
const schema = await import('@dory/database/postgres/schemas');
const { getDoryArtifactStore } = await import('@dory/artifacts');
const { readChatAttachment, bindChatAttachments, validatedAttachmentStream, readAttachmentText } = await import('@/lib/server/chat-attachments');
const { queryChatAttachments } = await import('@/lib/server/chat-attachment-data');
const { createChatAnalysis } = await import('@/lib/server/chat-analysis');
const { createWorkDocumentTools } = await import('@/lib/server/work-document-tools');
const { getAgentExecutionTools } = await import('@/lib/server/agent-execution');
const { resolveOrganizationAccess } = await import('@/lib/server/authz');
const call: ToolExecutionOptions<Record<string, unknown>> = { toolCallId: 'attachment-test', messages: [], context: {} };

test('streaming upload boundaries and UTF-8 text pagination/search', async () => {
    const stream = (parts: Iterable<Uint8Array> | AsyncIterable<Uint8Array>) => Readable.toWeb(Readable.from(parts)) as ReadableStream<Uint8Array>;
    const consume = async (source: Readable) => {
        let count = 0;
        for await (const chunk of source) count += chunk.length;
        return count;
    };
    const chunk = Buffer.alloc(1024 * 1024, 97);
    assert.equal(await consume(validatedAttachmentStream(stream(Array.from({ length: 100 }, () => chunk)), 'large.csv')), 100 * 1024 * 1024);
    await assert.rejects(consume(validatedAttachmentStream(stream([...Array.from({ length: 100 }, () => chunk), Buffer.from('x')]), 'large.csv')), /100 MiB/);
    await assert.rejects(consume(validatedAttachmentStream(stream([Buffer.from([0xff])]), 'invalid.txt')));
    await assert.rejects(consume(validatedAttachmentStream(stream([Buffer.from('fake')]), 'invalid.parquet')), /invalid/);
    const text = '中文前缀'.repeat(100) + 'NEEDLE' + '中文后缀'.repeat(100);
    const bytes = Buffer.from(text);
    const parts = Array.from({ length: bytes.length }, (_, n) => bytes.subarray(n, n + 1));
    const range = await readAttachmentText(Readable.from(parts), 'text.txt', { offset: 399, limit: 10 });
    assert.equal(range.content, text.slice(399, 409));
    assert.equal(range.totalCharacters, text.length);
    const found = await readAttachmentText(Readable.from(parts), 'text.txt', { offset: 0, limit: 100, query: 'NEEDLE' });
    assert.equal(found.matches?.[0].offset, 400);
    assert.equal(found.matches?.[0].content, text.slice(240, 566));
});

test('private attachments produce reusable full-data evidence, charts and reports in SDK and MCP', async () => {
    try {
        const database = await getClient();
        await migrate(database as unknown as PgliteDatabase, { migrationsFolder: new URL('../../../../packages/database/src/pglite/migrations', import.meta.url).pathname });
        const db = await getDBService();
        const owner = { organizationId: 'attachment-org', userId: 'attachment-owner' };
        await database.insert(schema.user).values({ id: owner.userId, name: 'Owner', email: 'attachment@example.test' });
        await database.insert(schema.organizations).values({ id: owner.organizationId, name: 'Attachments', ownerUserId: owner.userId });
        const chat = await db.chat.createGlobalSession({ ...owner, id: 'attachment-chat', connectionId: null });
        const scope = { connectionIds: [], connectionMode: 'auto' as const };
        const file = await getDoryArtifactStore().chatAttachments.put(owner, {
            filename: 'customers.csv',
            mediaType: 'text/csv',
            chatId: null,
            bytes: Buffer.from('id,active\n' + Array.from({ length: 25000 }, (_, n) => `${n},${n % 4 === 0}`).join('\n')),
        });
        const messages = [
            {
                id: 'attachment-message',
                role: 'user' as const,
                parts: [{ type: 'file' as const, filename: file.filename, mediaType: file.mediaType, url: `/api/chat/attachments/${file.id}` }],
            },
        ];
        await bindChatAttachments(owner, chat.id, messages);
        await db.chat.appendMessage({ ...owner, sessionId: chat.id, message: { ...owner, ...messages[0], sessionId: chat.id } });
        const work = await db.works.startChatTurn({
            ...owner,
            requestId: 'attachment-turn',
            externalSessionId: `chat:${chat.id}`,
            metadata: { source: 'internal_chat', chatId: chat.id, analysisScope: scope },
        });
        const inspected = await readChatAttachment(db, owner, chat.id, { attachmentId: file.id });
        assert.ok('tables' in inspected);
        assert.equal(inspected.tables[0].rowCount, 25000);
        const sql = `SELECT count(*) AS total, count(*) FILTER (WHERE active) AS active_count, avg(active::INT) AS ratio FROM "${inspected.tables[0].name}"`;
        const result = await queryChatAttachments(db, owner, chat.id, { attachmentIds: [file.id], sql }, work.workId, 'attachment-turn');
        assert.deepEqual(result.rows, [{ total: '25000', active_count: '6250', ratio: 0.25 }]);
        const evidence = await db.works.inspectChatEvidence({ ...owner, workId: work.workId, requestId: 'attachment-turn', artifactId: result.artifactId });
        assert.equal(evidence.attachmentSource?.files[0].sha256, file.sha256);
        assert.equal(evidence.connectionId, null);
        assert.equal((await db.connections.list(owner.organizationId)).length, 0);
        const artifact = await db.artifacts.get({ ...owner, artifactId: result.artifactId });
        assert.equal(artifact.resultSet?.attachmentSource?.chatId, chat.id);
        assert.equal((await db.resultSets.readRows({ ...owner, resultSetId: result.resultSetId })).rows[0].ratio, 0.25);
        const exported = await db.resultSets.createExport({ ...owner, resultSetId: result.resultSetId, format: 'csv' });
        assert.ok(exported);
        await assert.rejects(db.artifacts.get({ ...owner, userId: 'other-user', artifactId: result.artifactId }), /unavailable/);
        await assert.rejects(db.resultSets.readRows({ ...owner, userId: 'other-user', resultSetId: result.resultSetId }), /unavailable/);
        await assert.rejects(db.resultSets.createExport({ ...owner, userId: 'other-user', resultSetId: result.resultSetId, format: 'csv' }), /unavailable/);
        await assert.rejects(queryChatAttachments(db, owner, 'other-chat', { attachmentIds: [file.id], sql }, work.workId), /unavailable/);
        const other = await db.works.startChatTurn({
            ...owner,
            requestId: 'other-turn',
            externalSessionId: 'chat:other-chat',
            metadata: { source: 'internal_chat', chatId: 'other-chat', analysisScope: scope },
        });
        await assert.rejects(db.works.inspectChatEvidence({ ...owner, workId: other.workId, requestId: 'other-turn', artifactId: result.artifactId }), /another conversation/);
        const analysis = createChatAnalysis({
            db,
            ...owner,
            chatId: chat.id,
            requestId: 'attachment-turn',
            connectionId: null,
            analysisScope: scope,
            locale: 'en',
            requestOrigin: 'http://localhost',
            signal: new AbortController().signal,
            resolveWork: async () => work,
        });
        const sdk = await analysis.tools.queryAttachment.execute!({ attachmentIds: [file.id], sql }, { ...call, toolCallId: 'query' });
        assert.match(JSON.stringify(sdk), /0.25/);
        const chart = await analysis.tools.chartBuilder.execute!(
            { chartType: 'bar', title: 'Active customers', artifactId: result.artifactId, xKey: 'total', yKeys: [{ key: 'active_count' }] },
            { ...call, toolCallId: 'chart' },
        );
        assert.ok(chart);
        const reports = createWorkDocumentTools({
            db,
            ...owner,
            chatId: chat.id,
            requestId: 'attachment-turn',
            creationKey: `${chat.id}:report`,
            scope,
            runId: async () => work.workId,
        });
        const report = await reports.tools.createWorkReport.execute!(
            {
                title: 'Customer activity',
                markdown: '![Activity](dory://visual/activity)',
                status: 'ready',
                visuals: [{ id: 'activity', type: 'table', title: 'Full dataset', evidenceId: result.artifactId }],
            },
            { ...call, toolCallId: 'report' },
        );
        assert.ok('id' in report);
        const saved = await db.workDocuments.get({ ...owner, documentId: report.id });
        assert.equal(saved.status, 'ready');
        assert.equal(saved.content.evidence[0].rows[0].ratio, 0.25);
        assert.equal(saved.content.evidence[0].attachmentSource?.files[0].filename, 'customers.csv');
        // New turn resolves the same original attachment and existing immutable dataset.
        const followup = await db.works.startChatTurn({
            ...owner,
            requestId: 'followup',
            externalSessionId: `chat:${chat.id}`,
            metadata: { source: 'internal_chat', chatId: chat.id, analysisScope: scope },
        });
        const ctx = {
            ...owner,
            access: (await resolveOrganizationAccess(owner.organizationId, owner.userId))!,
            actor: { type: 'agent' as const, id: owner.userId, scopes: ['assets:read'] },
            services: { db, agentTurn: { workId: followup.workId, requestId: 'followup', responseMessageId: 'followup-message' } },
        };
        const mcp = await getAgentExecutionTools()
            .find(tool => tool.name === 'dory_query_attachment')!
            .execute(ctx, { workId: followup.workId, requestId: 'followup', attachmentIds: [file.id], sql });
        assert.match(JSON.stringify(mcp), /6250/);
        const inspectedAgain = await readChatAttachment(db, owner, chat.id, { attachmentId: file.id });
        assert.deepEqual(inspectedAgain, inspected);
        const pg = await readFile(new URL('../../../../packages/database/src/postgres/migrations/0039_chat_attachment_sources.sql', import.meta.url), 'utf8');
        const pglite = await readFile(new URL('../../../../packages/database/src/pglite/migrations/0039_chat_attachment_sources.sql', import.meta.url), 'utf8');
        assert.equal(pg, pglite);
    } finally {
        await resetPgliteClient();
        await rm(directory, { recursive: true, force: true });
    }
});
