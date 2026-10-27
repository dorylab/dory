import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
const { resolveChatContext } = await import('@/lib/server/chat-context');
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
        await t.test('auto scope permits zero sources while manual scope and knowledge remain explicit', async () => {
            const { validateAnalysisScope } = await import('@/lib/server/work-documents');
            const scope = await validateAnalysisScope(db, owner, { connectionIds: [], connectionMode: 'auto', knowledgeMode: 'auto' });
            assert.deepEqual(scope.connectionIds, []);
            assert.equal(scope.connectionMode, 'auto');
            assert.equal(scope.knowledgeMode, 'auto');
            await assert.rejects(validateAnalysisScope(db, owner, { connectionIds: [], connectionMode: 'manual' }));
            await assert.rejects(validateAnalysisScope(db, owner, { connectionIds: ['unavailable'], connectionMode: 'manual' }), /unavailable/);
            assert.equal((await validateAnalysisScope(db, owner, { connectionIds: [], knowledgeMode: 'none' })).knowledgeMode, 'none');
            await assert.rejects(validateAnalysisScope(db, owner, { connectionIds: [], knowledgeMode: 'manual' }), /Select a Knowledge/);
            await assert.rejects(validateAnalysisScope(db, { ...owner, userId: 'outsider' }, { connectionIds: [], connectionMode: 'auto' }), /denied/);
        });
        await t.test('stored attachments retain full text, enforce conversation ownership and work in SDK and MCP tools', async () => {
            const { getDoryArtifactStore } = await import('@dory/artifacts');
            const { prepareStoredAttachments, bindChatAttachments, readChatAttachment } = await import('@/lib/server/chat-attachments');
            const { createChatAnalysis } = await import('@/lib/server/chat-analysis');
            const session = await db.chat.createGlobalSession({ ...owner, id: 'files-chat', connectionId: null });
            const content = '中文内容'.repeat(100000) + '\nUNIQUE_TAIL_42';
            const manifest = await getDoryArtifactStore().chatAttachments.put(owner, {
                filename: 'folder/large.csv',
                mediaType: 'text/csv',
                chatId: null,
                bytes: Buffer.from(content),
            });
            const file = { type: 'file' as const, filename: 'forged.txt', mediaType: 'text/plain', url: `/api/chat/attachments/${manifest.id}` };
            const messages = [{ id: 'file-message', role: 'user' as const, parts: [file] }];
            const prepared = await prepareStoredAttachments(owner, session.id, messages, false);
            assert.equal((prepared.canonical[0].parts[0] as typeof file).filename, 'folder/large.csv');
            assert.match(JSON.stringify(prepared.model), /previewOnly.*true/);
            assert.doesNotMatch(JSON.stringify(prepared.model), /UNIQUE_TAIL_42/);
            await bindChatAttachments(owner, session.id, prepared.canonical);
            await db.chat.appendMessage({
                ...owner,
                sessionId: session.id,
                message: { ...owner, id: 'file-message', sessionId: session.id, role: 'user', parts: prepared.canonical[0].parts.filter(part => part.type === 'file') },
            });
            const tail = await readChatAttachment(db, owner, session.id, { attachmentId: manifest.id, offset: content.indexOf('UNIQUE_TAIL_42') });
            assert.equal('content' in tail && tail.content, 'UNIQUE_TAIL_42');
            const search = await readChatAttachment(db, owner, session.id, { attachmentId: manifest.id, query: 'UNIQUE_TAIL_42' });
            assert.equal('matches' in search && search.matches?.length, 1);
            await assert.rejects(prepareStoredAttachments(owner, 'other-chat', messages, false), /unavailable/);
            await assert.rejects(prepareStoredAttachments({ ...owner, userId: 'other' }, session.id, messages, false), /unavailable/);
            await assert.rejects(readChatAttachment(db, owner, session.id, { attachmentId: crypto.randomUUID() }), /unavailable/);
            const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==', 'base64');
            const image = await getDoryArtifactStore().chatAttachments.put(owner, { filename: 'chart.png', mediaType: 'image/png', chatId: null, bytes: imageBytes });
            const imageMessages = [
                {
                    id: 'image-message',
                    role: 'user' as const,
                    parts: [{ type: 'file' as const, filename: image.filename, mediaType: image.mediaType, url: `/api/chat/attachments/${image.id}` }],
                },
            ];
            await assert.rejects(prepareStoredAttachments(owner, session.id, imageMessages, false), /imagesUnsupported/);
            const vision = await prepareStoredAttachments(owner, session.id, imageMessages, true);
            assert.equal((vision.model[0].parts[0] as typeof file).url, `data:image/png;base64,${imageBytes.toString('base64')}`);
            assert.equal(await getDoryArtifactStore().chatAttachments.discardDraft(owner, manifest.id), false);
            assert.equal(await getDoryArtifactStore().chatAttachments.discardDraft(owner, image.id), true);
            const work = await db.works.startChatTurn({
                ...owner,
                requestId: 'files-turn',
                externalSessionId: 'chat:files-chat',
                metadata: { source: 'internal_chat', chatId: session.id, analysisScope: { connectionIds: [], connectionMode: 'auto' } },
            });
            const ctx = {
                organizationId: owner.organizationId,
                userId: owner.userId,
                access: (await resolveOrganizationAccess(owner.organizationId, owner.userId))!,
                currentConnectionId: null,
                locale: 'en' as const,
                runtime: 'desktop' as const,
                actor: { type: 'agent' as const, id: owner.userId, scopes: ['assets:read'] },
                requestId: 'files-turn',
                services: { db, agentTurn: { workId: work.workId, requestId: 'files-turn', responseMessageId: 'file-response' } },
            };
            const mcp = getAgentExecutionTools().find(tool => tool.name === 'dory_search_attachment')!;
            const result = await mcp.execute(ctx, { workId: work.workId, requestId: 'files-turn', attachmentId: manifest.id, query: 'UNIQUE_TAIL_42' });
            assert.match(JSON.stringify(result), /UNIQUE_TAIL_42/);
            const analysis = createChatAnalysis({
                db,
                ...owner,
                chatId: session.id,
                requestId: 'files-turn',
                connectionId: null,
                analysisScope: { connectionIds: [], connectionMode: 'auto' },
                locale: 'en',
                requestOrigin: 'http://localhost',
                signal: new AbortController().signal,
                resolveWork: async () => work,
            });
            const sdk = await analysis.tools.readAttachment.execute!(
                { attachmentId: manifest.id, offset: content.indexOf('UNIQUE_TAIL_42') },
                { ...call, toolCallId: 'file-read' },
            );
            assert.match(JSON.stringify(sdk), /UNIQUE_TAIL_42/);
        });
        const start = (requestId: string, progressCheckpoints = false) =>
            db.works.startChatTurn({
                ...owner,
                requestId,
                externalSessionId: 'chat:reports',
                metadata: {
                    source: 'internal_chat',
                    progressCheckpoints,
                    chatId: 'reports',
                    reportCreationKey: 'reports:user-message',
                    analysisScope: { connectionIds: ['orders', 'ads'] },
                },
            });
        const run = await start('turn-1');
        const reports = createWorkDocumentTools({
            db,
            ...owner,
            chatId: 'reports',
            requestId: 'turn-1',
            creationKey: 'reports:user-message',
            scope: { connectionIds: ['orders', 'ads'], databasesByConnection: { orders: ['main', 'sales'] } },
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
        assert.equal(await reports.completionStatus(), 'draft');
        await assert.rejects(reports.assertReady(), /still a draft/);
        // The SDK validates tool outputs as JSON before sending the next model step.
        assert.deepEqual(created, JSON.parse(JSON.stringify(created)));
        let expired = false;
        t.mock.method(db.artifacts, 'get', async ({ artifactId }: { artifactId: string }) => {
            if (expired) throw new Error('Expired');
            return {
                id: artifactId,
                title: 'Query',
                status: 'ready',
                connectionId: artifactId === 'outside' ? 'private' : artifactId,
                connectionName: artifactId,
                workId: run.workId,
                createdAt: new Date(),
                rowCount: 1,
                resultSet: { id: artifactId, sourceDatabaseName: 'main', sql: `SELECT revenue FROM ${artifactId}` },
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
        await assert.rejects(
            saveWorkDraft(db, {
                ...owner,
                documentId: created.id,
                expectedRevision: 1,
                draft,
                source: 'user',
                scope: { connectionIds: ['orders', 'ads'], databasesByConnection: { orders: ['sales', 'analytics'] } },
            }),
            /outside the selected database/,
        );
        const ready = await reports.tools.updateWorkReport.execute!({ documentId: created.id, expectedRevision: 1, patch }, call);
        await reports.assertReady();
        assert.ok('id' in ready);
        assert.equal(ready.content.evidence.length, 2);
        assert.equal(ready.content.evidence[0].truncated, true);
        assert.deepEqual(ready.content.evidence[0].rows, [{ revenue: 42 }]);
        await t.test('report creation saves all chart series and rejects an invalid secondary evidence column', async t => {
            t.mock.method(db.resultSets, 'readRows', async () => ({
                columns: [{ name: 'month' }, { name: 'net_revenue' }, { name: 'order_count' }],
                rows: [{ month: '2026-06', net_revenue: 181273.27, order_count: 421 }],
                rowCount: 1,
                dataAvailability: 'full',
            }));
            const tools = createWorkDocumentTools({
                db,
                ...owner,
                chatId: 'reports',
                requestId: 'turn-1',
                creationKey: 'reports:multi-metric',
                scope: { connectionIds: ['orders'] },
                runId: async () => run.workId,
            });
            const { workDraftSchema } = await import('@/lib/work-documents/schema');
            const input = workDraftSchema.parse({
                title: 'Monthly trends',
                markdown: '![Trends](dory://visual/revenue_trend)',
                status: 'ready',
                visuals: [
                    {
                        id: 'revenue_trend',
                        type: 'chart',
                        title: 'Monthly trends',
                        evidenceId: 'orders',
                        chart: {
                            type: 'line',
                            xKey: 'month',
                            yKeys: [
                                { key: 'net_revenue', label: '净收入' },
                                { key: 'order_count', label: '订单数' },
                            ],
                        },
                    },
                ],
            });
            const invalid = structuredClone(input);
            const invalidChart = invalid.visuals[0].chart;
            assert.ok(invalidChart && 'yKeys' in invalidChart);
            invalidChart.yKeys[1].key = 'invented';
            await assert.rejects(tools.tools.createWorkReport.execute!(invalid, call) as Promise<unknown>, /Chart columns do not match/);
            const saved = await tools.tools.createWorkReport.execute!(input, call);
            assert.ok('id' in saved);
            assert.equal(saved.status, 'ready');
            assert.deepEqual(saved.content.visuals, input.visuals);
            assert.equal(saved.content.evidence[0].rows[0].order_count, 421);
            assert.equal(await tools.completionStatus(), 'ready');
            assert.deepEqual((await db.workDocuments.get({ ...owner, documentId: saved.id })).content.visuals, input.visuals);
            await db.workDocuments.archive({ ...owner, documentId: saved.id, archived: true });
        });
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
            metadata: {
                source: 'internal_chat',
                chatId: 'reports',
                reportCreationKey: 'reports:local-message',
                analysisScope: { connectionIds: ['orders', 'ads'] },
            },
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
        const reportTurn = (await db.works.getById({ ...owner, workId: localTurn.workId }))?.metadata?.chatTurn as { summarySaved?: boolean; summarySave?: unknown };
        assert.equal(reportTurn.summarySaved, undefined);
        assert.equal(reportTurn.summarySave, undefined);
        const reportReply = (await db.chat.listMessages({ ...owner, sessionId: 'reports' })).find(message => message.id === 'msg_local-turn-2');
        assert.equal(reportReply?.metadata?.reportSaved, true);
        assert.equal(reportReply?.metadata?.summarySaved, false);
        assert.equal(reportReply?.metadata?.reportDocumentId, partial.reportDocumentId);
        assert.equal((await db.works.listFindings({ ...owner, workId: localTurn.workId })).length, 0);
        assert.equal((await db.workDocuments.list(owner)).length, 2);
        const summaries = await db.workDocuments.list(owner);
        assert.equal(summaries.find(item => item.id === partial.reportDocumentId)?.sourceMessageId, 'local-message');
        assert.ok(summaries.find(item => item.id === partial.reportDocumentId)?.summary);
        assert.equal((await db.workDocuments.findByCreationKey({ ...owner, creationKey: 'reports:local-message' }))?.id, partial.reportDocumentId);
        assert.equal(await db.workDocuments.findByCreationKey({ ...owner, userId: 'someone-else', creationKey: 'reports:local-message' }), null);
        const referenced = await resolveChatContext(db, owner, { references: [{ kind: 'report', id: partial.reportDocumentId, title: 'forged name' }] }, { connectionIds: [] });
        assert.notEqual(referenced.references[0].title, 'forged name');
        assert.match(referenced.instruction, /revision/);
        assert.match(referenced.instruction, /do not expand/);
        await t.test('report mentions read the selected revision and reject missing or archived versions', async () => {
            const original = await db.workDocuments.get({ ...owner, documentId: partial.reportDocumentId });
            const pinned = await db.workDocuments.create({
                ...owner,
                creationKey: 'mention-versions',
                title: 'Pinned original',
                scope: original.scope,
                content: { ...original.content, markdown: 'Original revenue: 42' },
            });
            const ref = { kind: 'report' as const, id: pinned.id, title: pinned.title, revision: 1 };
            await db.workDocuments.update({
                ...owner,
                documentId: pinned.id,
                expectedRevision: 1,
                title: 'Updated title',
                scope: pinned.scope,
                status: 'ready',
                source: 'user',
                content: { ...original.content, markdown: 'Updated revenue: 99' },
            });
            const resolved = await resolveChatContext(db, owner, { references: [ref] }, { connectionIds: [] });
            assert.equal(resolved.references[0].title, 'Pinned original');
            assert.match(resolved.instruction, /Original revenue: 42/);
            assert.doesNotMatch(resolved.instruction, /Updated revenue: 99/);
            const legacy = await resolveChatContext(db, owner, { references: [{ ...ref, revision: undefined }] }, { connectionIds: [] });
            assert.match(legacy.instruction, /Updated revenue: 99/);
            assert.equal(legacy.references[0].kind === 'report' && legacy.references[0].revision, 2);
            await assert.rejects(resolveChatContext(db, owner, { references: [{ ...ref, revision: 999 }] }, { connectionIds: [] }), /Version not found/);
            await assert.rejects(resolveChatContext(db, { ...owner, userId: 'outsider' }, { references: [ref] }, { connectionIds: [] }));
            await assert.rejects(
                resolveChatContext(db, owner, { references: [ref], mentionSpans: [{ start: 0, end: 999, referenceKey: 'invalid' }] }, { connectionIds: [] }),
                /positions/,
            );
            await db.workDocuments.archive({ ...owner, documentId: pinned.id, archived: true });
            await assert.rejects(resolveChatContext(db, owner, { references: [ref] }, { connectionIds: [] }), /archived/);
        });

        await writeFile(join(directory, 'references.sqlite'), '');
        await database.insert(schema.connections).values({
            id: 'reference-source',
            organizationId: owner.organizationId,
            type: 'sqlite',
            engine: 'sqlite',
            name: 'References',
            path: join(directory, 'references.sqlite'),
        });
        const { ensureConnectionPoolForUser } = await import('@/lib/connection/utils');
        const { destroyDriverPool } = await import('@dory/drivers/core');
        const { entry } = await ensureConnectionPoolForUser(owner.userId, owner.organizationId, 'reference-source');
        const described: string[] = [];
        t.mock.method(entry.instance, 'describeTable', async (database: string) => {
            described.push(database);
            return [];
        });
        try {
            const multiReferences = await resolveChatContext(
                db,
                owner,
                { references: ['main', 'sales'].map(database => ({ kind: 'table', title: 'orders', table: 'orders', schema: null, connectionId: 'reference-source', database })) },
                { connectionIds: ['reference-source'], databasesByConnection: { 'reference-source': ['main', 'sales'] } },
            );
            assert.equal(multiReferences.references.length, 2);
            assert.deepEqual(described, ['main', 'sales']);
        } finally {
            await destroyDriverPool(entry.config.id);
        }
        const artifactReference = await resolveChatContext(db, owner, { references: [{ kind: 'artifact', id: 'outside', title: 'forged' }] }, { connectionIds: ['orders'] });
        assert.equal(artifactReference.references[0].title, 'Query');
        assert.match(artifactReference.instruction, /private/);
        await assert.rejects(
            resolveChatContext(
                db,
                owner,
                { references: [{ kind: 'table', title: 'orders', table: 'orders', schema: null, connectionId: 'outside', database: 'main' }] },
                { connectionIds: ['orders'] },
            ),
            /outside/,
        );
        await assert.rejects(
            resolveChatContext(db, { ...owner, userId: 'outsider' }, { references: [{ kind: 'report', id: partial.reportDocumentId, title: 'Report' }] }, { connectionIds: [] }),
            /denied/,
        );
        await assert.rejects(
            resolveChatContext(
                db,
                owner,
                { references: [{ kind: 'table', title: 'orders', table: 'orders', schema: null, connectionId: 'orders', database: 'analytics' }] },
                { connectionIds: ['orders'], databasesByConnection: { orders: ['main', 'sales'] } },
            ),
            /outside the selected data source\/database/,
        );
        dataAvailability = 'none';
        await assert.rejects(resolveChatContext(db, owner, { references: [{ kind: 'artifact', id: 'outside', title: 'Query' }] }, { connectionIds: [] }), /expired/);
        dataAvailability = 'full';
        const required = createWorkDocumentTools({
            db,
            ...owner,
            chatId: 'reports',
            requestId: 'local-turn-2',
            creationKey: 'reports:missing',
            scope: { connectionIds: ['orders'] },
            requireReport: true,
            runId: async () => localTurn.workId,
        });
        assert.equal(await required.completionStatus(), 'missing');
        await assert.rejects(required.assertReady(), /requested report/);
        await assert.rejects(required.tools.updateWorkReport.execute!({ documentId: created.id, expectedRevision: 1, patch }, call) as Promise<unknown>, /new report/);

        await db.works.startChatTurn({
            ...owner,
            requestId: 'missing-report',
            externalSessionId: 'chat:reports',
            metadata: { source: 'internal_chat', chatId: 'reports', outputIntent: 'report', reportCreationKey: 'reports:missing' },
        });
        context.services.agentTurn = { ...context.services.agentTurn, requestId: 'missing-report', responseMessageId: 'msg_missing-report' };
        await assert.rejects(finish.execute(context, { workId: localTurn.workId, status: 'completed', findings: [], steps: ['Finish'], finalAnswer: 'Done' }), /requested report/);
        await t.test('MCP transport preserves the advertised schema and guards malformed saves before validation', async () => {
            const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
            const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
            const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
            const { registerDoryMcpTools } = await import('@/lib/server/mcp/tools');
            const server = new McpServer({ name: 'conclusion-test', version: '1' });
            registerDoryMcpTools(server, { ...owner, tokenId: 'test-token', scopes: ['query:read', 'assets:read'], access });
            const client = new Client({ name: 'conclusion-client', version: '1' });
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            try {
                await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
                const advertised = (await client.listTools()).tools.find(tool => tool.name === 'dory_finish_work')!;
                assert.ok(advertised.inputSchema.required?.includes('findings'));
                await start('transport');
                const args = { workId: localTurn.workId, requestId: 'transport', status: 'completed', finalAnswer: 'Available answer', findings: 'invalid', steps: ['Read data'] };
                const first = await client.callTool({ name: 'dory_finish_work', arguments: args });
                assert.equal(first.isError, true);
                const retry = await client.callTool({ name: 'dory_finish_work', arguments: { ...args, findings: [] } });
                assert.equal(retry.isError, true);
                assert.match(JSON.stringify(retry.structuredContent), /CONCLUSION_SAVE_STOPPED/);
                assert.match(JSON.stringify(retry.structuredContent), /"retryable":false/);
                const events = await db.works.listEvents({ ...owner, workId: localTurn.workId });
                assert.equal(events.filter(event => event.toolName === 'dory_finish_work' && event.inputSummary?.requestId === 'transport').length, 1);
                await start('transport-next');
                const saved = await client.callTool({
                    name: 'dory_finish_work',
                    arguments: { ...args, requestId: 'transport-next', findings: [{ title: 'Explicitly saved conclusion' }] },
                });
                assert.notEqual(saved.isError, true);
                await db.works.finishChatTurn({ ...owner, workId: localTurn.workId, requestId: 'transport-next', outcome: 'completed' });
                const replay = await client.callTool({ name: 'dory_finish_work', arguments: { ...args, requestId: 'transport-next', findings: [] } });
                assert.notEqual(replay.isError, true);
                assert.deepEqual(replay.structuredContent, saved.structuredContent);
                await start('transport-progress', true);
                const progressArgs = { workId: localTurn.workId, requestId: 'transport-progress' };
                const malformed = await client.callTool({ name: 'dory_publish_progress', arguments: progressArgs });
                assert.notEqual(malformed.isError, true);
                assert.match(JSON.stringify(malformed.structuredContent), /"published":false/);
                const published = await client.callTool({
                    name: 'dory_publish_progress',
                    arguments: { ...progressArgs, checkpointId: 'transport-progress:0', text: '我先核对现有订单知识的口径，再确认需要查询的数据。', nextStage: 'reference' },
                });
                assert.match(JSON.stringify(published.structuredContent), /"published":true/);
                const duplicate = await client.callTool({
                    name: 'dory_publish_progress',
                    arguments: { ...progressArgs, checkpointId: 'transport-progress:0', text: '重复的发布不应显示第二次。', nextStage: 'reference' },
                });
                assert.match(JSON.stringify(duplicate.structuredContent), /"duplicate":true/);
                const gated = await client.callTool({ name: 'dory_list_connections', arguments: progressArgs });
                assert.equal(gated.isError, true);
                assert.doesNotMatch(JSON.stringify(gated.structuredContent), /progress_required/);
                const progressEvents = await db.works.listEvents({ ...owner, workId: localTurn.workId });
                assert.equal(progressEvents.filter(event => event.inputSummary?.requestId === 'transport-progress' && event.toolName !== 'chat_checkpoints').length, 1);
            } finally {
                await client.close();
                await server.close();
            }
        });
    } finally {
        await resetPgliteClient();
        await rm(directory, { recursive: true, force: true });
    }
});
