import assert from 'node:assert/strict';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import { PostgresActionAuditRepository } from '@dory/database/postgres/impl/action-audit';
import { schema } from '@dory/database/postgres/schemas';
import type { PostgresDBClient } from '@dory/shared';
import { drizzle } from 'drizzle-orm/pglite';

async function createRepository() {
    const client = new PGlite();
    await client.exec(`
        CREATE TABLE "action_audit" (
            "id" text PRIMARY KEY NOT NULL,
            "action_run_id" text NOT NULL,
            "request_id" text,
            "action_id" text NOT NULL,
            "action_version" integer NOT NULL,
            "status" text NOT NULL,
            "risk" text NOT NULL,
            "effects" jsonb,
            "organization_id" text NOT NULL,
            "user_id" text NOT NULL,
            "actor_type" text NOT NULL,
            "actor_id" text,
            "projection" text NOT NULL,
            "source" text,
            "resource" jsonb,
            "input_hash" text,
            "redacted_input_summary" jsonb,
            "redacted_output_summary" jsonb,
            "error_code" text,
            "error_message" text,
            "duration_ms" integer NOT NULL,
            "created_at" timestamp with time zone DEFAULT now() NOT NULL
        );
        CREATE INDEX "idx_action_audit_org_created" ON "action_audit" USING btree ("organization_id","created_at");
        CREATE INDEX "idx_action_audit_run" ON "action_audit" USING btree ("action_run_id");
        CREATE INDEX "idx_action_audit_action_created" ON "action_audit" USING btree ("action_id","created_at");
        CREATE INDEX "idx_action_audit_actor_created" ON "action_audit" USING btree ("actor_type","created_at");
    `);

    const db = drizzle({ client, schema }) as unknown as PostgresDBClient;
    (db as any).$client = client;

    return {
        client,
        repository: new PostgresActionAuditRepository(db),
    };
}

test('actionAudit persists event createdAt and reads execution logs by organization-scoped filters', async () => {
    const { client, repository } = await createRepository();

    try {
        await repository.log({
            actionRunId: 'run-1',
            requestId: 'request-1',
            actionId: 'connection.list',
            version: 1,
            status: 'success',
            risk: 'read',
            effects: null,
            organizationId: 'org-1',
            userId: 'user-1',
            actorType: 'user',
            actorId: 'user-1',
            projection: 'ui',
            source: 'dory_schema_metadata',
            resource: { type: 'connection', id: 'conn-1' },
            inputHash: 'hash-1',
            redactedInputSummary: { id: 'conn-1' },
            redactedOutputSummary: { count: 1 },
            durationMs: 12,
            createdAt: '2026-06-01T01:00:00.000Z',
        });
        await repository.log({
            actionRunId: 'run-2',
            actionId: 'connection.list',
            version: 1,
            status: 'error',
            risk: 'read',
            organizationId: 'org-1',
            userId: 'user-1',
            actorType: 'agent',
            projection: 'agent',
            source: 'ai_schema_metadata',
            durationMs: 8,
            createdAt: '2026-06-01T02:00:00.000Z',
        });
        await repository.log({
            actionRunId: 'run-3',
            actionId: 'connection.list',
            version: 1,
            status: 'success',
            risk: 'read',
            organizationId: 'org-2',
            userId: 'user-2',
            actorType: 'user',
            projection: 'ui',
            source: 'dory_schema_metadata',
            durationMs: 5,
            createdAt: '2026-06-01T03:00:00.000Z',
        });

        const result = await repository.search({
            organizationId: 'org-1',
            statuses: ['success'],
            sources: ['dory_schema_metadata'],
            actorTypes: ['user'],
            actionIds: ['connection.list'],
            limit: 10,
        });

        assert.equal(result.total, 1);
        assert.equal(result.hasMore, false);
        assert.equal(result.items[0]?.actionRunId, 'run-1');
        assert.equal(result.items[0]?.createdAt, '2026-06-01T01:00:00.000Z');
        assert.deepEqual(result.items[0]?.resource, { type: 'connection', id: 'conn-1' });
        assert.deepEqual(result.items[0]?.redactedInputSummary, { id: 'conn-1' });

        assert.equal((await repository.getByRunId('org-1', 'run-1'))?.actionRunId, 'run-1');
        assert.equal(await repository.getByRunId('org-2', 'run-1'), null);
        assert.equal((await repository.search({ organizationId: 'org-1', actionRunId: 'run-2' })).items[0]?.actorType, 'agent');
    } finally {
        await client.close();
    }
});
