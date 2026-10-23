import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ToolExecutionOptions } from 'ai';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;
const directory = await mkdtemp(join(tmpdir(), 'dory-work-service-'));
process.env.DB_TYPE = 'pglite';
process.env.PGLITE_DB_PATH = join(directory, 'db');
process.env.DORY_ARTIFACTS_FILESYSTEM_DIR = join(directory, 'artifacts');
const { getClient } = await import('@dory/database/postgres/client');
const { resetPgliteClient } = await import('@dory/database/postgres/client/pglite');
const { getDBService } = await import('@dory/database');
const schema = await import('@dory/database/postgres/schemas');
const { saveWorkDraft } = await import('@/lib/server/work-documents');
const { getAgentExecutionTools } = await import('@/lib/server/agent-execution');
const { resolveOrganizationAccess } = await import('@/lib/server/authz');
const { createWorkDocumentTools } = await import('@/lib/server/work-document-tools');
const call: ToolExecutionOptions<Record<string, unknown>> = { toolCallId: 'report-test', messages: [], context: {} };

test('report tools preserve human edits, validate and retain evidence, reject incomplete refreshes and stale turns', async t => {
    try {
        const database = await getClient();
        await migrate(database as unknown as PgliteDatabase, { migrationsFolder: new URL('../../../../packages/database/src/pglite/migrations', import.meta.url).pathname });
        const db = await getDBService();
        const owner = { organizationId: 'reports-org', userId: 'reports-user' };
        await database.insert(schema.user).values({ id: owner.userId, name: 'Report user', email: 'reports@example.test' });
        await database.insert(schema.organizations).values({ id: owner.organizationId, name: 'Reports', ownerUserId: owner.userId });
        const start = (requestId: string) =>
            db.works.startChatTurn({
                ...owner,
                requestId,
                externalSessionId: 'chat:reports',
                metadata: { source: 'internal_chat', chatId: 'reports', reportCreationKey: 'reports:user-message', analysisScope: { connectionIds: ['orders', 'ads'] } },
            });
        const run = await start('turn-1');
        const reports = createWorkDocumentTools({
            db,
            ...owner,
            chatId: 'reports',
            requestId: 'turn-1',
            creationKey: 'reports:user-message',
            scope: { connectionIds: ['orders', 'ads'] },
            runId: async () => run.workId,
        });
        assert.deepEqual(await db.workDocuments.list(owner), []);
        await assert.rejects(
            reports.tools.createWorkReport.execute!(
                { title: 'Sales analysis', markdown: '[Knowledge](dory://knowledge/model/definition)', visuals: [], status: 'draft' },
                call,
            ) as Promise<unknown>,
            /WORK_REFERENCE_INVALID[\s\S]*Draft exists: documentId=.*revision=1/,
        );
        await assert.rejects(reports.tools.readWorkReport.execute!({ documentId: 'work-invented' }, call) as Promise<unknown>, /not found/i);
        const created = await reports.tools.createWorkReport.execute!({ title: 'Sales analysis', markdown: '', visuals: [], status: 'draft' }, call);
        const retry = await reports.tools.createWorkReport.execute!({ title: 'Sales analysis', markdown: '', visuals: [], status: 'draft' }, call);
        assert.ok('id' in created && 'id' in retry);
        assert.equal(created.id, retry.id);
        assert.equal(created.status, 'draft');
        await assert.rejects(reports.assertReady(), /still a draft/);
        // The SDK validates tool outputs as JSON before sending the next model step.
        assert.deepEqual(created, JSON.parse(JSON.stringify(created)));
        let expired = false;
        t.mock.method(db.artifacts, 'get', async ({ artifactId }: { artifactId: string }) => {
            if (expired) throw new Error('Expired');
            return {
                id: artifactId,
                title: 'Query',
                connectionId: artifactId === 'outside' ? 'private' : artifactId,
                connectionName: artifactId,
                workId: run.workId,
                createdAt: new Date(),
                rowCount: 1,
                resultSet: { id: artifactId, sql: `SELECT revenue FROM ${artifactId}` },
            };
        });
        let dataAvailability: 'full' | 'preview-only' | 'none' = 'preview-only';
        t.mock.method(db.resultSets, 'readRows', async () => ({ columns: [{ name: 'revenue' }], rows: [{ revenue: 42 }], rowCount: 1, dataAvailability }));
        const draft = {
            title: 'Sales analysis',
            markdown: '## October\n\n![Orders](dory://visual/orders)\n\n![Advertising](dory://visual/ads)',
            status: 'ready' as const,
            visuals: [
                { id: 'orders', title: 'Orders', type: 'metric' as const, metric: { column: 'revenue', rowIndex: 0 }, evidenceId: 'orders' },
                { id: 'ads', title: 'Advertising', type: 'table' as const, evidenceId: 'ads' },
            ],
        };
        const patch = { edits: [{ oldText: '', newText: draft.markdown }], visuals: draft.visuals, status: 'ready' as const };
        await assert.rejects(
            reports.tools.updateWorkReport.execute!(
                { documentId: created.id, expectedRevision: 1, patch: { ...patch, visuals: [{ ...draft.visuals[0], evidenceId: 'outside' }, draft.visuals[1]] } },
                call,
            ) as Promise<unknown>,
            /outside/,
        );
        const ready = await reports.tools.updateWorkReport.execute!({ documentId: created.id, expectedRevision: 1, patch }, call);
        await reports.assertReady();
        assert.ok('id' in ready);
        assert.equal(ready.content.evidence.length, 2);
        assert.equal(ready.content.evidence[0].truncated, true);
        assert.deepEqual(ready.content.evidence[0].rows, [{ revenue: 42 }]);
        expired = true;
        const human = await saveWorkDraft(db, {
            ...owner,
            documentId: created.id,
            expectedRevision: ready.revision,
            source: 'user',
            draft: { ...draft, title: 'Human reviewed', markdown: draft.markdown + '\n\nHuman note' },
        });
        assert.ok((await reports.instructions()).includes('Human reviewed'));
        await assert.rejects(
            reports.tools.updateWorkReport.execute!({ documentId: created.id, expectedRevision: ready.revision, patch }, call) as Promise<unknown>,
            /latest version/,
        );
        await assert.rejects(
            reports.tools.updateWorkReport.execute!({ documentId: created.id, expectedRevision: human.revision, patch: { edits: [], status: 'draft' } }, call) as Promise<unknown>,
            /previous report is preserved/,
        );
        const saved = await reports.tools.readWorkReport.execute!({ documentId: created.id }, call);
        assert.ok('id' in saved);
        assert.equal(saved.title, 'Human reviewed');
        assert.equal(saved.revision, human.revision);
        assert.equal(saved.content.evidence.length, 2);
        const edited = await reports.tools.updateWorkReport.execute!(
            {
                documentId: created.id,
                expectedRevision: human.revision,
                patch: { edits: [{ oldText: '## October', newText: '## October reviewed' }], visuals: [{ ...draft.visuals[0], title: 'Orders reviewed' }], status: 'ready' },
            },
            call,
        );
        assert.ok('content' in edited && edited.content.markdown.endsWith('Human note'));
        assert.equal(edited.content.visuals.length, 2);
        assert.equal(edited.content.visuals.find(item => item.id === 'orders')?.title, 'Orders reviewed');
        assert.deepEqual(
            edited.content.visuals.find(item => item.id === 'ads'),
            draft.visuals[1],
        );
        const next = await start('turn-2');
        assert.equal((next.metadata?.chatTurn as { reportCreationKey: string }).reportCreationKey, 'reports:user-message');
        await assert.rejects(
            reports.tools.updateWorkReport.execute!({ documentId: created.id, expectedRevision: human.revision, patch }, call) as Promise<unknown>,
            /no longer active/,
        );
        assert.equal((await db.workDocuments.list(owner)).length, 1);
        await db.chat.createGlobalSession({ ...owner, id: 'reports', connectionId: null });
        const localTurn = await start('local-turn');
        const access = await resolveOrganizationAccess(owner.organizationId, owner.userId);
        assert.ok(access);
        const context = {
            ...owner,
            access,
            currentConnectionId: null,
            actor: {
                type: 'agent' as const,
                id: owner.userId,
                scopes: ['connections:read', 'schema:read', 'query:read', 'tabs:read', 'tabs:write', 'knowledge:read', 'assets:read'],
            },
            audit: { record: () => undefined },
            services: { db, agentTurn: { workId: localTurn.workId, requestId: 'local-turn', responseMessageId: 'msg_local-turn' } },
        };
        const tools = getAgentExecutionTools();
        const finish = tools.find(tool => tool.name === 'dory_finish_work')!;
        // Another user message has its own stable report key.
        await db.works.startChatTurn({
            ...owner,
            requestId: 'local-turn-2',
            externalSessionId: 'chat:reports',
            metadata: { source: 'internal_chat', chatId: 'reports', reportCreationKey: 'reports:local-message', analysisScope: { connectionIds: ['orders', 'ads'] } },
        });
        context.services.agentTurn = { ...context.services.agentTurn, requestId: 'local-turn-2', responseMessageId: 'msg_local-turn-2' };
        const draftInput = {
            workId: localTurn.workId,
            status: 'active',
            findings: [],
            steps: ['Prepare report'],
            report: { draft: { ...draft, status: 'draft', markdown: '', visuals: [] } },
        };
        const partial = (await finish.execute(context, draftInput)) as { reportDocumentId: string; reportRevision: number; incomplete: boolean };
        assert.equal(partial.incomplete, true);
        assert.equal((await db.works.getById({ ...owner, workId: localTurn.workId }))?.status, 'active');
        assert.equal((await db.workDocuments.get({ ...owner, documentId: partial.reportDocumentId })).status, 'draft');
        const read = (await finish.execute(context, {
            workId: localTurn.workId,
            status: 'active',
            findings: [],
            steps: ['Read latest Work'],
            report: { documentId: partial.reportDocumentId, read: true },
        })) as { reportRevision: number; report: { markdown: string } };
        assert.equal(read.reportRevision, partial.reportRevision);
        assert.equal(read.report.markdown, '');
        assert.equal((await db.workDocuments.versions({ ...owner, documentId: partial.reportDocumentId })).length, 2);
        expired = false;
        dataAvailability = 'none';
        await assert.rejects(
            finish.execute(context, {
                ...draftInput,
                status: 'completed',
                finalAnswer: 'Ready',
                report: { documentId: partial.reportDocumentId, expectedRevision: partial.reportRevision, patch },
            }),
            /no longer available/,
        );
        dataAvailability = 'full';
        await finish.execute(context, {
            ...draftInput,
            status: 'completed',
            finalAnswer: 'The report is ready.',
            report: { documentId: partial.reportDocumentId, expectedRevision: partial.reportRevision, patch },
        });
        assert.equal((await db.workDocuments.get({ ...owner, documentId: partial.reportDocumentId })).status, 'ready');
        assert.equal((await db.workDocuments.list(owner)).length, 2);
    } finally {
        await resetPgliteClient();
        await rm(directory, { recursive: true, force: true });
    }
});
