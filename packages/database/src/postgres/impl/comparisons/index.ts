import { and, count, desc, eq, lt, lte } from 'drizzle-orm';

import { getDoryArtifactStore, type DoryArtifactStore } from '@dory/artifacts';
import { getClient } from '@dory/database/postgres/client';
import { comparisonJobs, type ComparisonAiReview, type ComparisonJob, type NewComparisonJob } from '@dory/database/postgres/schemas';
import type { PostgresResultSetsRepository } from '@dory/database/postgres/impl/result-sets';
import type { ComparisonEndpoint, SchemaComparisonResult, SchemaDialectFamily } from '@dory/schema-compare';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import type { PostgresDBClient } from '@dory/shared';

export type CreateComparisonJobInput = {
    organizationId: string;
    userId: string;
    currentEndpoint: ComparisonEndpoint;
    desiredEndpoint: ComparisonEndpoint;
    dialectFamily: SchemaDialectFamily;
    workId?: string | null;
    previousComparisonId?: string | null;
    expiresAt?: Date | null;
};

export class PostgresComparisonsRepository {
    private db!: PostgresDBClient;

    constructor(
        private readonly resultSets: PostgresResultSetsRepository,
        private readonly artifacts: DoryArtifactStore = getDoryArtifactStore(),
    ) {}

    async init() {
        const client = await getClient();
        if (!client) throw new DatabaseError('Database connection failed', 500);
        this.db = client as PostgresDBClient;
    }

    async create(input: CreateComparisonJobInput): Promise<ComparisonJob> {
        this.assertInited();
        const now = new Date();
        const id = `cmp_${newEntityId()}`;
        const [record] = await this.db
            .insert(comparisonJobs)
            .values({
                id,
                organizationId: input.organizationId,
                createdByUserId: input.userId,
                workId: input.workId ?? null,
                kind: 'schema',
                status: 'running',
                currentEndpoint: input.currentEndpoint,
                desiredEndpoint: input.desiredEndpoint,
                dialectFamily: input.dialectFamily,
                aiReviewStatus: 'pending',
                previousComparisonId: input.previousComparisonId ?? null,
                expiresAt: input.expiresAt ?? null,
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        if (!record) throw new DatabaseError('Unable to create comparison', 500);
        return record;
    }

    async complete(input: {
        organizationId: string;
        comparisonId: string;
        comparison: SchemaComparisonResult;
        snapshotArtifactRef: NonNullable<ComparisonJob['snapshotArtifactRef']>;
        resultSetId: string;
        expiresAt: Date;
    }): Promise<ComparisonJob> {
        this.assertInited();
        const now = new Date();
        const [record] = await this.db
            .update(comparisonJobs)
            .set({
                status: 'success',
                coverage: input.comparison.coverage,
                summary: input.comparison.summary,
                currentSnapshotHash: input.comparison.currentHash,
                desiredSnapshotHash: input.comparison.desiredHash,
                snapshotArtifactRef: input.snapshotArtifactRef,
                resultSetId: input.resultSetId,
                expiresAt: input.expiresAt,
                completedAt: now,
                updatedAt: now,
                failureCode: null,
                failureMessage: null,
            })
            .where(and(eq(comparisonJobs.organizationId, input.organizationId), eq(comparisonJobs.id, input.comparisonId)))
            .returning();
        if (!record) throw new DatabaseError('Comparison not found', 404);
        return record;
    }

    async setArtifacts(input: {
        organizationId: string;
        comparisonId: string;
        snapshotArtifactRef?: NonNullable<ComparisonJob['snapshotArtifactRef']>;
        currentSnapshotHash?: string;
        desiredSnapshotHash?: string;
        resultSetId?: string;
    }): Promise<void> {
        this.assertInited();
        await this.db
            .update(comparisonJobs)
            .set({
                ...(input.snapshotArtifactRef ? { snapshotArtifactRef: input.snapshotArtifactRef } : {}),
                ...(input.currentSnapshotHash ? { currentSnapshotHash: input.currentSnapshotHash } : {}),
                ...(input.desiredSnapshotHash ? { desiredSnapshotHash: input.desiredSnapshotHash } : {}),
                ...(input.resultSetId ? { resultSetId: input.resultSetId } : {}),
                updatedAt: new Date(),
            })
            .where(and(eq(comparisonJobs.organizationId, input.organizationId), eq(comparisonJobs.id, input.comparisonId)));
    }

    async fail(input: { organizationId: string; comparisonId: string; code: string; message: string }): Promise<ComparisonJob> {
        this.assertInited();
        const now = new Date();
        const [record] = await this.db
            .update(comparisonJobs)
            .set({
                status: 'failed',
                failureCode: input.code,
                failureMessage: input.message,
                completedAt: now,
                updatedAt: now,
                snapshotArtifactRef: null,
                resultSetId: null,
            })
            .where(and(eq(comparisonJobs.organizationId, input.organizationId), eq(comparisonJobs.id, input.comparisonId)))
            .returning();
        if (!record) throw new DatabaseError('Comparison not found', 404);
        return record;
    }

    async get(organizationId: string, comparisonId: string): Promise<ComparisonJob> {
        this.assertInited();
        const [record] = await this.db
            .select()
            .from(comparisonJobs)
            .where(and(eq(comparisonJobs.organizationId, organizationId), eq(comparisonJobs.id, comparisonId)))
            .limit(1);
        if (!record) throw new DatabaseError('Comparison not found', 404);
        return record;
    }

    async list(organizationId: string, options: { limit?: number; offset?: number } = {}) {
        this.assertInited();
        await this.cleanupExpired(new Date()).catch(() => undefined);
        const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
        const offset = Math.max(0, options.offset ?? 0);
        const [rows, totals] = await Promise.all([
            this.db.select().from(comparisonJobs).where(eq(comparisonJobs.organizationId, organizationId)).orderBy(desc(comparisonJobs.createdAt)).limit(limit).offset(offset),
            this.db.select({ count: count() }).from(comparisonJobs).where(eq(comparisonJobs.organizationId, organizationId)),
        ]);
        return { rows, total: Number(totals[0]?.count ?? 0) };
    }

    async setAiReviewRunning(organizationId: string, comparisonId: string) {
        return this.updateAiReview(organizationId, comparisonId, {
            aiReviewStatus: 'running',
            aiReview: null,
            aiReviewError: null,
        });
    }

    async setAiReviewSuccess(organizationId: string, comparisonId: string, review: ComparisonAiReview) {
        return this.updateAiReview(organizationId, comparisonId, {
            aiReviewStatus: 'success',
            aiReview: review,
            aiReviewError: null,
        });
    }

    async setAiReviewFailure(organizationId: string, comparisonId: string, status: 'failed' | 'unavailable', message: string) {
        return this.updateAiReview(organizationId, comparisonId, {
            aiReviewStatus: status,
            aiReview: null,
            aiReviewError: message,
        });
    }

    async markStaleRunningFailed(before: Date): Promise<number> {
        this.assertInited();
        const rows = await this.db
            .select()
            .from(comparisonJobs)
            .where(and(eq(comparisonJobs.status, 'running'), lt(comparisonJobs.updatedAt, before)));
        for (const row of rows) {
            if (row.resultSetId) {
                await this.resultSets
                    .deleteResultSet({
                        organizationId: row.organizationId,
                        resultSetId: row.resultSetId,
                    })
                    .catch(() => undefined);
            }
            if (row.snapshotArtifactRef) {
                await this.artifacts.comparisons.deleteComparison(row.snapshotArtifactRef).catch(() => undefined);
            }
            await this.db
                .update(comparisonJobs)
                .set({
                    status: 'failed',
                    failureCode: 'comparison_timeout',
                    failureMessage: 'Schema comparison timed out before completion.',
                    snapshotArtifactRef: null,
                    resultSetId: null,
                    completedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(comparisonJobs.id, row.id));
        }
        return rows.length;
    }

    async delete(organizationId: string, comparisonId: string): Promise<void> {
        this.assertInited();
        const record = await this.get(organizationId, comparisonId);
        if (record.resultSetId) {
            await this.resultSets
                .deleteResultSet({
                    organizationId,
                    resultSetId: record.resultSetId,
                })
                .catch(() => undefined);
        }
        if (record.snapshotArtifactRef) {
            await this.artifacts.comparisons.deleteComparison(record.snapshotArtifactRef).catch(() => undefined);
        }
        await this.db.delete(comparisonJobs).where(and(eq(comparisonJobs.organizationId, organizationId), eq(comparisonJobs.id, comparisonId)));
    }

    async cleanupExpired(now = new Date()): Promise<number> {
        this.assertInited();
        const rows = await this.db.select({ id: comparisonJobs.id, organizationId: comparisonJobs.organizationId }).from(comparisonJobs).where(lte(comparisonJobs.expiresAt, now));
        for (const row of rows) {
            await this.delete(row.organizationId, row.id).catch(() => undefined);
        }
        return rows.length;
    }

    private async updateAiReview(organizationId: string, comparisonId: string, values: Pick<NewComparisonJob, 'aiReviewStatus' | 'aiReview' | 'aiReviewError'>) {
        this.assertInited();
        const [record] = await this.db
            .update(comparisonJobs)
            .set({ ...values, updatedAt: new Date() })
            .where(and(eq(comparisonJobs.organizationId, organizationId), eq(comparisonJobs.id, comparisonId)))
            .returning();
        if (!record) throw new DatabaseError('Comparison not found', 404);
        return record;
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError('Database not initialized', 500);
    }
}
