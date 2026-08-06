import { and, asc, desc, eq, gt, inArray, lt, max, or } from 'drizzle-orm';

import { exportRunEvents, exportRuns } from '@dory/database/postgres/schemas/export-runs';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';

import { getClient } from '../../client';

export type ExportRunUpdateInput = Partial<Omit<typeof exportRuns.$inferInsert, 'id' | 'organizationId' | 'createdByUserId' | 'createdAt'>>;

export class PostgresExportRunsRepository {
    private db!: PostgresDBClient;

    async init() {
        const client = await getClient();
        if (!client) throw new DatabaseError('Failed to initialize export run storage', 500);
        this.db = client as PostgresDBClient;
    }

    async create(input: Omit<typeof exportRuns.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'phase'>) {
        const [run] = await this.db.insert(exportRuns).values(input).returning();
        if (!run) throw new DatabaseError('Failed to create export run', 500);
        return run;
    }

    async get(organizationId: string, runId: string) {
        const [run] = await this.db
            .select()
            .from(exportRuns)
            .where(and(eq(exportRuns.organizationId, organizationId), eq(exportRuns.id, runId)))
            .limit(1);
        return run ?? null;
    }

    async listTable(input: {
        organizationId: string;
        connectionId: string;
        databaseName: string;
        tableName: string;
        limit: number;
        cursor?: { createdAt: Date; id: string } | null;
    }) {
        const scope = [
            eq(exportRuns.organizationId, input.organizationId),
            eq(exportRuns.connectionId, input.connectionId),
            eq(exportRuns.databaseName, input.databaseName),
            eq(exportRuns.tableName, input.tableName),
        ];
        if (input.cursor) {
            scope.push(or(lt(exportRuns.createdAt, input.cursor.createdAt), and(eq(exportRuns.createdAt, input.cursor.createdAt), lt(exportRuns.id, input.cursor.id)))!);
        }
        return this.db
            .select()
            .from(exportRuns)
            .where(and(...scope))
            .orderBy(desc(exportRuns.createdAt), desc(exportRuns.id))
            .limit(input.limit);
    }

    async update(organizationId: string, runId: string, input: ExportRunUpdateInput) {
        const [run] = await this.db
            .update(exportRuns)
            .set({ ...input, updatedAt: new Date() })
            .where(and(eq(exportRuns.organizationId, organizationId), eq(exportRuns.id, runId)))
            .returning();
        if (!run) throw new DatabaseError('Export run not found', 404);
        return run;
    }

    async appendEvent(organizationId: string, runId: string, type: string, payload: unknown) {
        return this.db.transaction(async tx => {
            const [run] = await tx
                .select({ id: exportRuns.id })
                .from(exportRuns)
                .where(and(eq(exportRuns.organizationId, organizationId), eq(exportRuns.id, runId)))
                .for('update');
            if (!run) throw new DatabaseError('Export run not found', 404);
            const [last] = await tx
                .select({ sequence: max(exportRunEvents.sequence) })
                .from(exportRunEvents)
                .where(eq(exportRunEvents.runId, runId));
            const [event] = await tx
                .insert(exportRunEvents)
                .values({ runId, organizationId, sequence: (last?.sequence ?? 0) + 1, type, payload: payload ?? {} })
                .returning();
            return event;
        });
    }

    async claimQueued(limit = 1) {
        return this.db.transaction(async tx => {
            const rows = await tx
                .select()
                .from(exportRuns)
                .where(eq(exportRuns.status, 'queued'))
                .orderBy(asc(exportRuns.updatedAt))
                .limit(limit)
                .for('update', { skipLocked: true });
            if (!rows.length) return [];
            const ids = rows.map(row => row.id);
            const now = new Date();
            await tx.update(exportRuns).set({ status: 'running', phase: 'reading', startedAt: now, heartbeatAt: now, updatedAt: now }).where(inArray(exportRuns.id, ids));
            return rows.map(row => ({ ...row, status: 'running' as const, phase: 'reading', startedAt: now, heartbeatAt: now }));
        });
    }

    async listStaleRunning(before: Date) {
        return this.db
            .select()
            .from(exportRuns)
            .where(and(eq(exportRuns.status, 'running'), lt(exportRuns.heartbeatAt, before)));
    }

    async listExpiredArtifacts(before: Date, limit = 100) {
        return this.db
            .select()
            .from(exportRuns)
            .where(and(eq(exportRuns.status, 'completed'), lt(exportRuns.artifactExpiresAt, before)))
            .orderBy(asc(exportRuns.artifactExpiresAt))
            .limit(limit);
    }
}
