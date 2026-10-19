import assert from 'node:assert/strict';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { PostgresWorksRepository } from '@dory/database/postgres/impl/works';
import type { PostgresDBClient } from '@dory/shared';
import { createChatAgentRunLifecycle } from '@/lib/server/chat-agent-run';

test('Chat Run lifecycle persists terminal states and isolates overlapping turns', async t => {
    const client = new PGlite();
    await client.exec(`CREATE TABLE works (
        work_id text PRIMARY KEY, organization_id text NOT NULL, user_id text NOT NULL,
        principal_type text NOT NULL DEFAULT 'user', principal_id text, token_id text,
        connection_id text, external_session_id text, title text NOT NULL, status text NOT NULL,
        metadata jsonb, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
        last_active_at timestamptz NOT NULL, archived_at timestamptz
    )`);
    const works = new PostgresWorksRepository();
    await works.init(drizzle(client) as unknown as PostgresDBClient);
    const scope = { organizationId: 'org', userId: 'user' };
    const lifecycle = (requestId: string, signal = new AbortController().signal) =>
        createChatAgentRunLifecycle({ works, ...scope, requestId, chatId: 'chat', connectionId: 'connection', signal });
    const first = lifecycle('turn-1');

    try {
        const [work, duplicate] = await Promise.all([first.resolve(), first.resolve()]);
        assert.equal(work.workId, duplicate.workId);
        const owned = { ...scope, workId: work.workId };

        await t.test('successful completion preserves summary and context metadata', async () => {
            await client.query(`UPDATE works SET metadata = metadata || '{"agentRunSummary":{"findings":["existing finding"]}}'::jsonb`);
            await first.finish({ outcome: { status: 'completed' }, finishReason: 'stop' });
            const saved = await works.getById(owned);
            assert.equal(saved?.status, 'completed');
            assert.equal(saved?.metadata?.source, 'internal_chat');
            assert.deepEqual(saved?.metadata?.agentRunSummary, { findings: ['existing finding'] });
            assert.equal((saved?.metadata?.chatTurn as { outcome: string }).outcome, 'completed');
        });

        await t.test('a later turn reopens the same Run and cancellation closes it as an error', async () => {
            const controller = new AbortController();
            const next = lifecycle('turn-2', controller.signal);
            assert.equal((await next.resolve()).workId, work.workId);
            assert.equal((await works.getById(owned))?.status, 'active');
            controller.abort();
            await next.finish({ outcome: { status: 'completed' } });
            const saved = await works.getById(owned);
            assert.equal(saved?.status, 'error');
            assert.equal((saved?.metadata?.chatTurn as { outcome: string }).outcome, 'aborted');
        });

        await t.test('a stream error cannot be overwritten by a later completion callback', async () => {
            const next = lifecycle('turn-3');
            await next.resolve();
            await Promise.all([next.fail(), next.finish({ outcome: { status: 'completed' } })]);
            assert.equal((await works.getById(owned))?.status, 'error');
        });

        await t.test('an old turn cannot finish a newer turn in the same conversation', async () => {
            const old = lifecycle('turn-4');
            const current = lifecycle('turn-5');
            await old.resolve();
            await current.resolve();
            await old.finish({ outcome: { status: 'completed' } });
            assert.equal((await works.getById(owned))?.status, 'active');
            await current.finish({ outcome: { status: 'completed' } });
            assert.equal((await works.getById(owned))?.status, 'completed');
        });

        await t.test('interrupted streams without a final outcome are not marked successful', async () => {
            const next = lifecycle('turn-6');
            await next.resolve();
            await next.finish({ outcome: { status: 'unknown' } });
            assert.equal((await works.getById(owned))?.status, 'error');
        });

        await t.test('finishing is scoped to the owner and never revives archived Runs', async () => {
            const next = lifecycle('turn-7');
            await next.resolve();
            assert.equal(await works.finishChatTurn({ ...owned, userId: 'other', requestId: 'turn-7', outcome: 'completed' }), null);
            assert.equal(await works.finishChatTurn({ ...owned, organizationId: 'other', requestId: 'turn-7', outcome: 'completed' }), null);
            await client.query(`UPDATE works SET status = 'archived', archived_at = now()`);
            await next.finish({ outcome: { status: 'completed' } });
            assert.equal((await works.getById(owned))?.status, 'archived');
        });

        await t.test('ending a request with no Run does not create an empty Run', async () => {
            await lifecycle('unused').finish({ outcome: { status: 'completed' } });
            const result = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM works');
            assert.equal(result.rows[0].count, 1);
        });
    } finally {
        await client.close();
    }
});
