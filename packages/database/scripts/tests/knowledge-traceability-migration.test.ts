import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../src/postgres/migrations/0030_knowledge_and_agent_context.sql', import.meta.url);

test('consolidated Knowledge migration uses work_agent_assets as the only usage ledger', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /CREATE TABLE "knowledge_asset_sources"/);
    assert.match(sql, /CREATE TABLE "work_agent_assets"/);
    assert.doesNotMatch(sql, /work_knowledge_assets/);
});
