import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ChatMessagePart } from '@dory/shared/types/chat';
import type { ChartPresentation } from '@dory/shared/types/chat-chart';
import { effectiveChart, readStoredChart } from '@dory/shared/utils/chat-chart';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Pool } from 'pg';

const require = createRequire(import.meta.url);
const serverOnly = require.resolve('server-only');
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as NodeJS.Module;
const directory = await mkdtemp(join(tmpdir(), 'dory-chart-edit-'));
const postgres = process.env.CHAT_CHART_TEST_POSTGRES === '1';
process.env.DB_TYPE = postgres ? 'postgres' : 'pglite';
process.env.PGLITE_DB_PATH = join(directory, 'db');
process.env.DORY_ARTIFACTS_FILESYSTEM_DIR = join(directory, 'artifacts');
const { getClient } = await import('@dory/database/postgres/client');
const { getDBService } = await import('@dory/database');
const { resetPgliteClient } = await import('@dory/database/postgres/client/pglite');
const schema = await import('@dory/database/postgres/schemas');
const { listAgentWorks } = await import('@/lib/server/agent-works');

test('chart edits persist in metadata, enforce ownership and revisions, and preserve original evidence', async () => {
    const database = await getClient();
    try {
        if (postgres)
            await migratePostgres(database as unknown as NodePgDatabase, {
                migrationsFolder: new URL('../../../../packages/database/src/postgres/migrations', import.meta.url).pathname,
            });
        else await migrate(database as unknown as PgliteDatabase, { migrationsFolder: new URL('../../../../packages/database/src/pglite/migrations', import.meta.url).pathname });
        const db = await getDBService();
        const owner = { organizationId: 'chart-org', userId: 'chart-user' };
        await database.insert(schema.user).values({ id: owner.userId, name: 'Chart tester', email: 'chart@example.test' });
        await database.insert(schema.organizations).values({ id: owner.organizationId, name: 'Charts', ownerUserId: owner.userId });
        await db.chat.createGlobalSession({ ...owner, id: 'chart-chat', title: 'Test charts' });
        const output = {
            type: 'chart',
            chartType: 'line',
            dataState: 'ready',
            xKey: 'year',
            yKeys: [{ key: 'revenue' }],
            title: 'Original',
            data: [
                { year: 2025, revenue: 42 },
                { year: 2024, revenue: 30 },
            ],
        };
        const parts: ChatMessagePart[] = [{ type: 'tool-chartBuilder', toolCallId: 'chart', state: 'output-available', input: {}, output }];
        await db.chat.appendMessage({
            ...owner,
            sessionId: 'chart-chat',
            message: {
                ...owner,
                id: 'chart-answer',
                sessionId: 'chart-chat',
                role: 'assistant',
                parts,
                metadata: { responseStatus: 'completed', requestId: 'request', existing: 'preserved' },
            },
        });
        const input = { ...owner, sessionId: 'chart-chat', messageId: 'chart-answer', toolCallId: 'chart', expectedVersion: 0 };
        const presentation: ChartPresentation = {
            chartType: 'bar',
            title: 'Edited title',
            xKey: 'year',
            yKeys: [{ key: 'revenue', label: 'Revenue' }],
            options: { sortDirection: 'asc', valueFormat: { suffix: '元' } },
        };
        await assert.rejects(db.chat.updateChartPresentation({ ...input, userId: 'outsider', presentation }));
        await assert.rejects(db.chat.updateChartPresentation({ ...input, organizationId: 'other-org', presentation }));
        await assert.rejects(db.chat.updateChartPresentation({ ...input, toolCallId: 'missing', presentation }));
        await assert.rejects(db.chat.updateChartPresentation({ ...input, presentation: { ...presentation, xKey: 'fabricated' } }));
        const first = await db.chat.updateChartPresentation({ ...input, presentation });
        assert.equal(first.version, 1);
        const [message] = await db.chat.listMessages({ ...owner, sessionId: 'chart-chat' });
        assert.deepEqual(message.parts, parts);
        assert.equal(message.metadata?.existing, 'preserved');
        assert.equal(effectiveChart(readStoredChart(message.parts[0])!, message.metadata, 'chart').title, 'Edited title');
        const work = (await listAgentWorks(db, owner, await db.chat.listSessions({ ...owner, type: 'global' })))[0];
        assert.equal(work.outputs[0].title, 'Edited title');
        await assert.rejects(db.chat.updateChartPresentation({ ...input, presentation }), /another window/);
        const reset = await db.chat.updateChartPresentation({ ...input, expectedVersion: 1, presentation: null });
        assert.deepEqual(reset, { version: 2, presentation: null });
        await assert.rejects(db.chat.updateChartPresentation({ ...input, expectedVersion: 1, presentation }), /another window/);
        const concurrent = await Promise.allSettled([
            db.chat.updateChartPresentation({ ...input, expectedVersion: 2, presentation }),
            db.chat.updateChartPresentation({ ...input, expectedVersion: 2, presentation: { ...presentation, title: 'Another window' } }),
        ]);
        assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);
    } finally {
        if (postgres) await (database as unknown as { $client: Pool }).$client.end();
        else await resetPgliteClient();
        await rm(directory, { recursive: true, force: true });
    }
});
