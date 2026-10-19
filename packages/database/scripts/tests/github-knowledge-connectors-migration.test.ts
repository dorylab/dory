import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../src/postgres/migrations/0030_knowledge_and_agent_context.sql', import.meta.url);

test('consolidated Knowledge migration directly creates final GitHub connector structures', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /CREATE TABLE "knowledge_connectors"/);
    assert.match(sql, /CREATE TABLE "knowledge_connector_items"/);
    assert.match(sql, /CREATE TABLE "knowledge_connector_sync_jobs"/);
    assert.match(sql, /ON DELETE cascade/);
});
