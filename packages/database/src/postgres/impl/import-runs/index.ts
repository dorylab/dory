import { and, asc, count, desc, eq, gt, inArray, lt, max } from 'drizzle-orm';

import { importRunEvents, importRuns } from '@dory/database/postgres/schemas/import-runs';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';

import { getClient } from '../../client';

export type ImportRunCreateInput = {
    organizationId: string;
    createdByUserId: string;
    connectionId?: string | null;
    artifactsExpireAt: Date;
};

export type ImportRunUpdateInput = Partial<Omit<typeof importRuns.$inferInsert, 'id' | 'organizationId' | 'createdByUserId' | 'createdAt'>>;

export class PostgresImportRunsRepository {
    private db!: PostgresDBClient;

    async init() {
        const client = await getClient();
        if (!client) throw new DatabaseError('Failed to initialize import run storage', 500);
        this.db = client as PostgresDBClient;
    }

    async create(input: ImportRunCreateInput) {
        const [run] = await this.db
            .insert(importRuns)
            .values({
                organizationId: input.organizationId,
                createdByUserId: input.createdByUserId,
                connectionId: input.connectionId ?? null,
                artifactsExpireAt: input.artifactsExpireAt,
            })
            .returning();
        if (!run) throw new DatabaseError('Failed to create import run', 500);
        return run;
    }

    async get(organizationId: string, runId: string) {
        const [run] = await this.db
            .select()
            .from(importRuns)
            .where(and(eq(importRuns.organizationId, organizationId), eq(importRuns.id, runId)))
            .limit(1);
        return run ?? null;
    }

    async listPage(input: { organizationId: string; connectionId: string; limit: number; offset: number }) {
        const scope = and(eq(importRuns.organizationId, input.organizationId), eq(importRuns.connectionId, input.connectionId));
        const [rows, totals] = await Promise.all([
            this.db.select().from(importRuns).where(scope).orderBy(desc(importRuns.createdAt), desc(importRuns.id)).limit(input.limit).offset(input.offset),
            this.db.select({ total: count() }).from(importRuns).where(scope),
        ]);
        return { rows, total: totals[0]?.total ?? 0 };
    }

    async update(organizationId: string, runId: string, input: ImportRunUpdateInput) {
        const [run] = await this.db
            .update(importRuns)
            .set({ ...input, updatedAt: new Date() })
            .where(and(eq(importRuns.organizationId, organizationId), eq(importRuns.id, runId)))
            .returning();
        if (!run) throw new DatabaseError('Import run not found', 404);
        return run;
    }

    async appendEvent(organizationId: string, runId: string, type: string, payload: unknown) {
        return this.db.transaction(async tx => {
            const [run] = await tx
                .select({ id: importRuns.id })
                .from(importRuns)
                .where(and(eq(importRuns.organizationId, organizationId), eq(importRuns.id, runId)))
                .for('update');
            if (!run) throw new DatabaseError('Import run not found', 404);
            const [last] = await tx
                .select({ sequence: max(importRunEvents.sequence) })
                .from(importRunEvents)
                .where(eq(importRunEvents.runId, runId));
            const sequence = (last?.sequence ?? 0) + 1;
            const [event] = await tx
                .insert(importRunEvents)
                .values({ runId, organizationId, sequence, type, payload: payload ?? {} })
                .returning();
            if (!event) throw new DatabaseError('Failed to append import event', 500);
            return event;
        });
    }

    async listEvents(organizationId: string, runId: string, after = 0) {
        return this.db
            .select()
            .from(importRunEvents)
            .where(and(eq(importRunEvents.organizationId, organizationId), eq(importRunEvents.runId, runId), gt(importRunEvents.sequence, after)))
            .orderBy(asc(importRunEvents.sequence));
    }

    async claimQueued(limit: number) {
        return this.db.transaction(async tx => {
            const rows = await tx
                .select()
                .from(importRuns)
                .where(eq(importRuns.status, 'queued'))
                .orderBy(asc(importRuns.updatedAt))
                .limit(limit)
                .for('update', { skipLocked: true });
            if (!rows.length) return [];
            const ids = rows.map(row => row.id);
            await tx
                .update(importRuns)
                .set({ status: 'running', phase: 'preparing', startedAt: new Date(), heartbeatAt: new Date(), updatedAt: new Date() })
                .where(inArray(importRuns.id, ids));
            return rows.map(row => ({ ...row, status: 'running' as const, phase: 'preparing', startedAt: new Date(), heartbeatAt: new Date() }));
        });
    }

    async listStaleRunning(before: Date) {
        return this.db
            .select()
            .from(importRuns)
            .where(and(eq(importRuns.status, 'running'), lt(importRuns.heartbeatAt, before)));
    }

    async listExpiredArtifacts(before: Date, limit = 100) {
        return this.db
            .select()
            .from(importRuns)
            .where(and(inArray(importRuns.status, ['completed', 'failed', 'canceled', 'commit_unknown']), lt(importRuns.artifactsExpireAt, before)))
            .orderBy(asc(importRuns.artifactsExpireAt))
            .limit(limit);
    }
}
