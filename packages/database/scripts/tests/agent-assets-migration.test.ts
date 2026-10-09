import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../src/postgres/migrations/0030_knowledge_and_agent_context.sql', import.meta.url);

test('consolidated Agent migration creates principals, activities, revisioned assets and finding presentation', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    assert.match(sql, /CREATE TABLE "agent_principals"/);
    assert.match(sql, /CREATE TABLE "agent_activities"/);
    assert.match(sql, /"revision" text NOT NULL/);
    assert.match(sql, /ALTER TABLE "findings" ADD COLUMN "presentation" jsonb/);
});
