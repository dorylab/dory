import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { buildSqlFallbackName, cleanSqlName, isDefaultSqlName } from '@dory/shared/utils/sql-name';
import type { ActionContext } from '@dory/actions';
import type { WebActionServices } from '@/lib/actions/server/types';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;
const directory = await mkdtemp(join(tmpdir(), 'dory-sql-names-'));
process.env.DB_TYPE = 'pglite';
process.env.PGLITE_DB_PATH = join(directory, 'db');
process.env.DORY_ARTIFACTS_FILESYSTEM_DIR = join(directory, 'artifacts');
const { getClient } = await import('@dory/database/postgres/client');
const { resetPgliteClient } = await import('@dory/database/postgres/client/pglite');
const { getDBService } = await import('@dory/database');
const schema = await import('@dory/database/postgres/schemas');
const { createSqlNamer } = await import('@/lib/server/sql-naming');
const { savedQueryCreateAction } = await import('@/lib/actions/server/domains/saved-query/create');

const owner = { organizationId: 'names-org', userId: 'names-user' };
const connectionId = 'names-connection';

test('SQL fallback names preserve semantics, languages, quoted identifiers and Unicode limits', () => {
    assert.equal(buildSqlFallbackName('select * from users', 'en'), 'users list');
    assert.equal(buildSqlFallbackName('select count(*) from orders', 'zh'), 'orders数量');
    assert.equal(buildSqlFallbackName('select status, count(*) from orders group by status', 'zh'), 'orders汇总');
    assert.equal(buildSqlFallbackName('WITH cte AS (select * from "sales"."Order Items") select count(*) from cte', 'en'), 'Order Items count');
    assert.equal(buildSqlFallbackName("select '-- from fake' as value from `sales`.`real_orders`", 'en'), 'real orders list');
    assert.equal(buildSqlFallbackName('/* from fake */ select * from [sales].[Order Items]', 'en'), 'Order Items list');
    assert.equal(buildSqlFallbackName('insert into "my.schema"."a.b" values (1)', 'en'), 'Insert a.b');
    assert.equal(buildSqlFallbackName('select * from users', 'ja'), 'users一覧');
    assert.equal(buildSqlFallbackName('select * from users', 'es'), 'users lista');
    assert.equal(buildSqlFallbackName('update "users" set name = \'-- test\'', 'zh'), 'users更新');
    assert.equal(Array.from(cleanSqlName('😀'.repeat(45))).length, 40);
    assert.equal(cleanSqlName('"  Monthly\n orders  "'), 'Monthly orders');
    for (const title of ['New Query', '新查询', '新規クエリ', 'Nueva consulta 2']) assert.ok(isDefaultSqlName(title));
    assert.equal(isDefaultSqlName('New Query for customers'), false);
});

test('Postgres and PGlite readable-name migrations match', async () => {
    const root = new URL('../../../../packages/database/src/', import.meta.url);
    assert.equal(
        await readFile(new URL('postgres/migrations/0040_sql_readable_names.sql', root), 'utf8'),
        await readFile(new URL('pglite/migrations/0040_sql_readable_names.sql', root), 'utf8'),
    );
});

test('new SQL objects name once, persist titles and protect concurrent human edits', async t => {
    try {
        const database = await getClient();
        await migrate(database as unknown as PgliteDatabase, { migrationsFolder: new URL('../../../../packages/database/src/pglite/migrations', import.meta.url).pathname });
        const db = await getDBService();
        await writeFile(join(directory, 'source.sqlite'), '');
        await database.insert(schema.user).values({ id: owner.userId, name: 'Names', email: 'names@example.test' });
        await database.insert(schema.organizations).values({ id: owner.organizationId, name: 'Names', ownerUserId: owner.userId });
        await database
            .insert(schema.connections)
            .values({ id: connectionId, ...{ organizationId: owner.organizationId }, type: 'sqlite', engine: 'sqlite', name: 'Names', path: join(directory, 'source.sqlite') });
        const tasks: Array<() => Promise<void> | void> = [];
        const { resolveOrganizationAccess } = await import('@/lib/server/authz');
        const access = await resolveOrganizationAccess(owner.organizationId, owner.userId);
        assert.ok(access);
        const ctx: ActionContext<WebActionServices> = {
            ...owner,
            actor: { type: 'user', id: owner.userId, scopes: ['*'] },
            access,
            locale: 'zh',
            services: {
                db,
                defer: task => {
                    tasks.push(task);
                },
            },
        };
        let calls = 0;
        const namer = createSqlNamer(ctx, null, async () => {
            calls++;
            return { title: '订单数量', source: 'ai' };
        });
        const sql = 'select count(*) from orders';
        const saveTab = (tabId: string, content = sql, tabName = '新查询', extra = {}) =>
            db.tabState.saveTabState({ tabId, userId: owner.userId, connectionId, state: { tabType: 'sql', content, tabName, ...extra } });
        const getTab = (id: string) => db.tabState.loadTabState(id, owner.userId, connectionId);
        const drain = async () => {
            const batch = tasks.splice(0);
            await Promise.all(batch.map(task => task()));
        };
        await t.test('historical and explicit names stay untouched, including identical default-looking names', async () => {
            await database.insert(schema.tabs).values({ tabId: 'historical', userId: owner.userId, connectionId, content: sql, tabName: 'New Query' });
            assert.equal(await namer.tab('historical', connectionId), null);
            await saveTab('manual-default', sql, '新查询', { nameEdited: true });
            assert.equal(await namer.tab('manual-default', connectionId), null);
            await saveTab('explicit', sql, 'My orders');
            assert.equal(await namer.tab('explicit', connectionId), null);
        });
        await t.test('one model call for identical SQL; first names survive later execution and stale saves', async () => {
            await saveTab('first');
            await saveTab('second');
            const first = await namer.tab('first', connectionId);
            assert.equal(first?.title, 'orders数量');
            assert.equal(first?.namingSource, 'pending');
            await namer.tab('second', connectionId);
            assert.equal(calls, 0, 'generation must be deferred');
            await drain();
            assert.equal(calls, 1);
            assert.equal((await getTab('first'))?.tabName, '订单数量');
            assert.equal(await namer.tab('first', connectionId), null);
            await saveTab('first'); // An old browser autosave must not revert the name.
            assert.equal((await getTab('first'))?.tabName, '订单数量');
            await saveTab('first', 'select 2');
            assert.equal(await namer.tab('first', connectionId), null);
        });
        await t.test('manual rename, SQL edit and deletion invalidate an in-flight tab name', async () => {
            await saveTab('renamed');
            await namer.tab('renamed', connectionId);
            await db.tabState.updateTabName({ tabId: 'renamed', userId: owner.userId, connectionId, newName: 'My name' });
            await saveTab('changed');
            await namer.tab('changed', connectionId);
            await saveTab('changed', 'select 2');
            await saveTab('deleted');
            await namer.tab('deleted', connectionId);
            await db.tabState.deleteTabState('deleted', owner.userId, connectionId);
            await drain();
            assert.equal((await getTab('renamed'))?.tabName, 'My name');
            await saveTab('renamed', sql, 'orders数量', { namingSource: 'pending', namingRequestId: 'stale-request' });
            assert.equal((await getTab('renamed'))?.tabName, 'My name');
            assert.equal((await getTab('changed'))?.tabName, 'orders数量');
            assert.equal(await getTab('deleted'), null);
        });
        await t.test('no scheduler and failed generation retain the fallback without retries', async () => {
            await saveTab('no-scheduler');
            const syncNamer = createSqlNamer({ ...ctx, services: { db } });
            const named = await syncNamer.tab('no-scheduler', connectionId);
            assert.equal(named?.namingSource, 'rule');
            assert.equal(named?.title, 'orders数量');
            await saveTab('failed');
            const failing = createSqlNamer(ctx, null, async () => {
                throw new Error('provider unavailable');
            });
            await failing.tab('failed', connectionId);
            await drain();
            assert.equal((await getTab('failed'))?.namingSource, 'rule');
            assert.equal((await getTab('failed'))?.tabName, 'orders数量');
            assert.equal(await failing.tab('failed', connectionId), null);
            await saveTab('empty-output');
            const empty = createSqlNamer(ctx, null, async () => ({ title: '  ', source: 'ai' }));
            await empty.tab('empty-output', connectionId);
            await drain();
            assert.equal((await getTab('empty-output'))?.tabName, 'orders数量');
            assert.equal((await getTab('empty-output'))?.namingSource, 'rule');
        });
        await t.test('saved query creation accepts blank titles, preserves explicit titles and cancels on edits', async () => {
            assert.ok(savedQueryCreateAction.inputSchema.safeParse({ sqlText: sql, connectionId }).success);
            const actionCtx = { ...ctx, currentConnectionId: connectionId };
            const recordSchema = z.object({ id: z.string(), title: z.string(), namingSource: z.string(), namingRequestId: z.string().nullable() });
            const record = recordSchema.parse(await savedQueryCreateAction.handler(actionCtx, { sqlText: sql, title: '  ', connectionId }));
            assert.equal(record.title, 'orders数量');
            assert.equal(record.namingSource, 'pending');
            // Do not run the real model; emulate a completion arriving after a manual rename.
            await db.savedQueries.update({ ...owner, connectionId, id: record.id, patch: { title: 'Human name' } });
            await db.sqlNaming.complete({ type: 'savedQuery', id: record.id, ...owner }, { requestId: record.namingRequestId!, sql, title: 'Late AI name', source: 'ai' });
            assert.equal((await db.savedQueries.getById({ ...owner, connectionId, id: record.id }))?.title, 'Human name');
            tasks.splice(0);
            const manual = recordSchema.parse(await savedQueryCreateAction.handler(actionCtx, { sqlText: sql, title: ' Explicit title ', connectionId }));
            assert.equal(manual.title, ' Explicit title ');
            assert.equal(manual.namingSource, 'manual');
        });
        await t.test('ResultSet names are canonical after restore and manual artifact renames win', async () => {
            const persisted = await db.resultSets.persistQueryResultSet({
                ...owner,
                connectionId,
                sessionId: 'names-session',
                sessionSqlText: sql,
                rows: [{ count: 3 }],
                resultSet: {
                    sessionId: 'names-session',
                    setIndex: 0,
                    sqlText: sql,
                    status: 'success',
                    title: 'orders数量',
                    namingSource: 'rule',
                    columns: [{ name: 'count', type: 'integer' }],
                },
            });
            const target = { type: 'artifact' as const, id: `artifact_${persisted.resultSetId}`, organizationId: owner.organizationId };
            const name = await namer.queue(target, sql);
            await drain();
            assert.ok(name?.namingRequestId);
            const restored = await db.resultSets.listSessionResultSets({ ...owner, sessionId: 'names-session' });
            assert.equal(restored[0]?.title, '订单数量');
            assert.equal(restored[0]?.namingSource, 'ai');
            await db.artifacts.rename({ ...owner, artifactId: target.id, title: 'Hand-written result' });
            await db.sqlNaming.complete(target, { sql, requestId: name.namingRequestId!, title: 'Stale result', source: 'ai' });
            assert.equal((await db.resultSets.listSessionResultSets({ ...owner, sessionId: 'names-session' }))[0]?.title, 'Hand-written result');
            assert.equal(await namer.queue(target, sql), null);
            // Organization scope applies even when a valid artifact id is supplied.
            assert.equal(await db.sqlNaming.claim({ ...target, organizationId: 'other-org' }, { sql, title: 'Wrong scope', requestId: 'wrong', pending: true }), false);
        });
        await t.test('normal and streamed execution name each statement and persist the same initial names', async () => {
            const { ensureConnectionPoolForUser } = await import('@/lib/connection/utils');
            const { executeSqlAction, executeSqlActionStream } = await import('@/lib/actions/server/domains/query/execute-operation');
            const { destroyDriverPool } = await import('@dory/drivers/core');
            const { entry } = await ensureConnectionPoolForUser(owner.userId, owner.organizationId, connectionId);
            try {
                await entry.instance.queryWithContext('CREATE TABLE orders (id INTEGER, status TEXT)');
                await entry.instance.queryWithContext("INSERT INTO orders VALUES (1, 'paid'), (2, 'new')");
                const sqlText = 'select * from orders; select count(*) as total from orders';
                await saveTab('execution', sqlText);
                const context: ActionContext<WebActionServices> = { ...ctx, services: { db }, currentConnectionId: connectionId };
                const normal = await executeSqlAction(context, { connectionId, tabId: 'execution', sql: sqlText, sessionId: 'normal-execution' });
                assert.equal(normal.queryResultSets.length, 2);
                assert.deepEqual(
                    normal.queryResultSets.map(set => set.title),
                    ['orders列表', 'orders数量'],
                );
                const restored = await db.resultSets.listSessionResultSets({ ...owner, sessionId: 'normal-execution', includeProfile: false });
                assert.deepEqual(
                    restored.map(set => set.title),
                    normal.queryResultSets.map(set => set.title),
                );
                assert.equal((await getTab('execution'))?.namingSource, 'rule');
                const events: Array<{ type: string; payload: unknown }> = [];
                const streamed = await executeSqlActionStream(
                    context,
                    { connectionId, sql: sqlText, sessionId: 'stream-execution' },
                    {
                        onEvent: event => {
                            events.push(event);
                        },
                    },
                );
                assert.deepEqual(
                    streamed.queryResultSets.map(set => set.title),
                    ['orders列表', 'orders数量'],
                );
                assert.ok(events.some(event => event.type === 'result-completed'));
                assert.equal(events.at(-1)?.type, 'session-finished');
            } finally {
                await destroyDriverPool(connectionId);
            }
        });
        await t.test('Agent/MCP read-only snapshots keep readable titles across work hydration', async () => {
            const { runReadonlySqlOperation } = await import('@/lib/ai/tools/dory-tool-operations');
            const { destroyDriverPool } = await import('@dory/drivers/core');
            try {
                for (const source of ['ai', 'mcp']) {
                    const output = await runReadonlySqlOperation(
                        { ...owner, currentConnectionId: connectionId, locale: 'zh' },
                        { connectionId, sql: 'select count(*) as total from orders', source },
                    );
                    const resultSetSchema = z
                        .object({ sessionId: z.string(), setIndex: z.number(), sqlText: z.string(), title: z.string(), namingSource: z.string() })
                        .passthrough();
                    const queryResultSets = output.queryResultSets.map(set => resultSetSchema.parse(set));
                    assert.equal(queryResultSets[0]?.title, 'orders数量');
                    const work = await db.works.create({ ...owner, connectionId, title: 'Naming run' });
                    const artifacts = await db.works.saveSqlSnapshot(work.workId, { ...output, queryResultSets });
                    assert.equal(artifacts.length, 1);
                    const artifactId = artifacts[0]!.artifactId;
                    await namer.queue({ type: 'artifact', id: artifactId, organizationId: owner.organizationId }, queryResultSets[0]!.sqlText);
                    await drain();
                    const hydrated = await db.works.getSnapshot({ ...owner, workId: work.workId });
                    assert.equal(hydrated?.sessions[0]?.queryResultSets[0]?.title, '订单数量');
                }
            } finally {
                await destroyDriverPool(connectionId);
            }
        });
        await t.test('model completion cannot cross a new SQL version even before cancellation is saved', async () => {
            await saveTab('sql-version');
            const name = await namer.tab('sql-version', connectionId);
            await database.update(schema.tabs).set({ content: 'select 9' }).where(eq(schema.tabs.tabId, 'sql-version'));
            await drain();
            assert.equal((await getTab('sql-version'))?.tabName, name?.title);
        });
    } finally {
        await resetPgliteClient();
        await rm(directory, { recursive: true, force: true });
    }
});
