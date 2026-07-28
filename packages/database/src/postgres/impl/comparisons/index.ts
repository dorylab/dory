import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';

import { getDoryArtifactStore, type ComparisonRunArtifactRef, type DoryArtifactStore } from '@dory/artifacts';
import { getClient } from '@dory/database/postgres/client';
import type { PostgresResultSetsRepository } from '@dory/database/postgres/impl/result-sets';
import {
    comparisonRuns,
    comparisons,
    type Comparison,
    type ComparisonAiReview,
    type ComparisonAiReviewStatus,
    type ComparisonConfigurationSnapshot,
    type ComparisonEndpointConfiguration,
    type ComparisonRun,
    type ComparisonRunActorType,
    type NewComparisonRun,
} from '@dory/database/postgres/schemas';
import type { SchemaComparisonObjectType, SchemaComparisonResult, SchemaDialectFamily } from '@dory/schema-compare';
import type { PostgresDBClient } from '@dory/shared';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';

export type CreateComparisonInput = {
    organizationId: string;
    userId: string;
    name: string;
    source: ComparisonEndpointConfiguration;
    target: ComparisonEndpointConfiguration;
    schemaFilter: string[];
    objectTypes: SchemaComparisonObjectType[];
    dialectFamily: SchemaDialectFamily;
};

export type UpdateComparisonInput = Omit<CreateComparisonInput, 'organizationId' | 'userId'> & {
    organizationId: string;
    comparisonId: string;
    configurationVersion: number;
};

export type CreateComparisonRunInput = {
    organizationId: string;
    comparisonId: string;
    userId: string;
    actorType: ComparisonRunActorType;
    workId?: string | null;
    configurationSnapshot: ComparisonConfigurationSnapshot;
};

export type ComparisonWithLatestRuns = Comparison & {
    latestRun: ComparisonRun | null;
    latestSuccessfulRun: ComparisonRun | null;
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

    async createComparison(input: CreateComparisonInput): Promise<Comparison> {
        this.assertInited();
        const now = new Date();
        const [record] = await this.db
            .insert(comparisons)
            .values({
                id: `cmp_${newEntityId()}`,
                organizationId: input.organizationId,
                createdByUserId: input.userId,
                name: input.name,
                kind: 'schema',
                sourceEndpoint: input.source,
                targetEndpoint: input.target,
                schemaFilter: input.schemaFilter,
                objectTypes: input.objectTypes,
                dialectFamily: input.dialectFamily,
                configurationVersion: 1,
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        if (!record) throw new DatabaseError('Unable to create comparison', 500);
        return record;
    }

    async updateComparison(input: UpdateComparisonInput): Promise<Comparison> {
        this.assertInited();
        const [record] = await this.db
            .update(comparisons)
            .set({
                name: input.name,
                sourceEndpoint: input.source,
                targetEndpoint: input.target,
                schemaFilter: input.schemaFilter,
                objectTypes: input.objectTypes,
                dialectFamily: input.dialectFamily,
                configurationVersion: input.configurationVersion,
                updatedAt: new Date(),
            })
            .where(and(eq(comparisons.organizationId, input.organizationId), eq(comparisons.id, input.comparisonId)))
            .returning();
        if (!record) throw new DatabaseError('Comparison not found', 404);
        return record;
    }

    async createRun(input: CreateComparisonRunInput): Promise<ComparisonRun> {
        this.assertInited();
        const now = new Date();
        try {
            const [record] = await this.db
                .insert(comparisonRuns)
                .values({
                    id: `cmprun_${newEntityId()}`,
                    organizationId: input.organizationId,
                    comparisonId: input.comparisonId,
                    createdByUserId: input.userId,
                    actorType: input.actorType,
                    workId: input.workId ?? null,
                    status: 'running',
                    configurationSnapshot: input.configurationSnapshot,
                    aiReviewStatus: 'pending',
                    startedAt: now,
                    updatedAt: now,
                })
                .returning();
            if (!record) throw new DatabaseError('Unable to create comparison run', 500);
            await this.db
                .update(comparisons)
                .set({ latestRunId: record.id, updatedAt: now })
                .where(and(eq(comparisons.organizationId, input.organizationId), eq(comparisons.id, input.comparisonId)));
            return record;
        } catch (error) {
            if (error instanceof DatabaseError) throw error;
            const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null;
            const details = `${error instanceof Error ? error.message : String(error)} ${cause instanceof Error ? cause.message : String(cause ?? '')}`;
            if (/uidx_comparison_runs_active|duplicate key|unique constraint/i.test(details)) {
                throw new DatabaseError('A comparison run is already in progress.', 409);
            }
            throw error;
        }
    }

    async completeRun(input: {
        organizationId: string;
        comparisonId: string;
        runId: string;
        comparison: SchemaComparisonResult;
        artifactRef: ComparisonRunArtifactRef;
        resultSetId: string;
    }): Promise<ComparisonRun> {
        this.assertInited();
        const now = new Date();
        const aiReviewStatus: ComparisonAiReviewStatus = input.comparison.summary.totalChanges === 0 ? 'not_needed' : 'pending';
        const [record] = await this.db
            .update(comparisonRuns)
            .set({
                status: 'success',
                coverage: input.comparison.coverage,
                summary: input.comparison.summary,
                sourceSnapshotHash: input.comparison.currentHash,
                targetSnapshotHash: input.comparison.desiredHash,
                artifactRef: input.artifactRef,
                resultSetId: input.resultSetId,
                aiReviewStatus,
                completedAt: now,
                updatedAt: now,
                failureCode: null,
                failureMessage: null,
            })
            .where(and(eq(comparisonRuns.organizationId, input.organizationId), eq(comparisonRuns.comparisonId, input.comparisonId), eq(comparisonRuns.id, input.runId)))
            .returning();
        if (!record) throw new DatabaseError('Comparison run not found', 404);
        await this.db
            .update(comparisons)
            .set({
                latestRunId: record.id,
                latestSuccessfulRunId: record.id,
                updatedAt: now,
            })
            .where(and(eq(comparisons.organizationId, input.organizationId), eq(comparisons.id, input.comparisonId)));
        return record;
    }

    async failRun(input: { organizationId: string; comparisonId: string; runId: string; code: string; message: string }): Promise<ComparisonRun> {
        this.assertInited();
        const now = new Date();
        const [record] = await this.db
            .update(comparisonRuns)
            .set({
                status: 'failed',
                failureCode: input.code,
                failureMessage: input.message,
                completedAt: now,
                updatedAt: now,
                artifactRef: null,
                resultSetId: null,
                aiReviewStatus: 'not_needed',
            })
            .where(and(eq(comparisonRuns.organizationId, input.organizationId), eq(comparisonRuns.comparisonId, input.comparisonId), eq(comparisonRuns.id, input.runId)))
            .returning();
        if (!record) throw new DatabaseError('Comparison run not found', 404);
        return record;
    }

    async get(organizationId: string, comparisonId: string): Promise<ComparisonWithLatestRuns> {
        this.assertInited();
        const [record] = await this.db
            .select()
            .from(comparisons)
            .where(and(eq(comparisons.organizationId, organizationId), eq(comparisons.id, comparisonId)))
            .limit(1);
        if (!record) throw new DatabaseError('Comparison not found', 404);
        const runIds = [record.latestRunId, record.latestSuccessfulRunId].filter((value): value is string => Boolean(value));
        const runRows = runIds.length
            ? await this.db
                  .select()
                  .from(comparisonRuns)
                  .where(and(eq(comparisonRuns.organizationId, organizationId), inArray(comparisonRuns.id, runIds)))
            : [];
        const runsById = new Map(runRows.map(run => [run.id, run]));
        return {
            ...record,
            latestRun: record.latestRunId ? (runsById.get(record.latestRunId) ?? null) : null,
            latestSuccessfulRun: record.latestSuccessfulRunId ? (runsById.get(record.latestSuccessfulRunId) ?? null) : null,
        };
    }

    async list(organizationId: string, options: { limit?: number; offset?: number } = {}) {
        this.assertInited();
        const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
        const offset = Math.max(0, options.offset ?? 0);
        const [records, totals] = await Promise.all([
            this.db.select().from(comparisons).where(eq(comparisons.organizationId, organizationId)).orderBy(desc(comparisons.updatedAt)).limit(limit).offset(offset),
            this.db.select({ count: count() }).from(comparisons).where(eq(comparisons.organizationId, organizationId)),
        ]);
        const runIds = [...new Set(records.flatMap(record => [record.latestRunId, record.latestSuccessfulRunId]).filter((value): value is string => Boolean(value)))];
        const runRows = runIds.length
            ? await this.db
                  .select()
                  .from(comparisonRuns)
                  .where(and(eq(comparisonRuns.organizationId, organizationId), inArray(comparisonRuns.id, runIds)))
            : [];
        const runsById = new Map(runRows.map(run => [run.id, run]));
        return {
            rows: records.map(record => ({
                ...record,
                latestRun: record.latestRunId ? (runsById.get(record.latestRunId) ?? null) : null,
                latestSuccessfulRun: record.latestSuccessfulRunId ? (runsById.get(record.latestSuccessfulRunId) ?? null) : null,
            })),
            total: Number(totals[0]?.count ?? 0),
        };
    }

    async getRun(organizationId: string, comparisonId: string, runId: string): Promise<ComparisonRun> {
        this.assertInited();
        const [record] = await this.db
            .select()
            .from(comparisonRuns)
            .where(and(eq(comparisonRuns.organizationId, organizationId), eq(comparisonRuns.comparisonId, comparisonId), eq(comparisonRuns.id, runId)))
            .limit(1);
        if (!record) throw new DatabaseError('Comparison run not found', 404);
        return record;
    }

    async getRunById(organizationId: string, runId: string): Promise<ComparisonRun> {
        this.assertInited();
        const [record] = await this.db
            .select()
            .from(comparisonRuns)
            .where(and(eq(comparisonRuns.organizationId, organizationId), eq(comparisonRuns.id, runId)))
            .limit(1);
        if (!record) throw new DatabaseError('Comparison run not found', 404);
        return record;
    }

    async listRuns(organizationId: string, comparisonId: string, options: { limit?: number; offset?: number } = {}) {
        this.assertInited();
        await this.get(organizationId, comparisonId);
        const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
        const offset = Math.max(0, options.offset ?? 0);
        const condition = and(eq(comparisonRuns.organizationId, organizationId), eq(comparisonRuns.comparisonId, comparisonId));
        const [rows, totals] = await Promise.all([
            this.db.select().from(comparisonRuns).where(condition).orderBy(desc(comparisonRuns.startedAt)).limit(limit).offset(offset),
            this.db.select({ count: count() }).from(comparisonRuns).where(condition),
        ]);
        return { rows, total: Number(totals[0]?.count ?? 0) };
    }

    async claimAiReview(organizationId: string, comparisonId: string, runId: string): Promise<ComparisonRun | null> {
        this.assertInited();
        const [record] = await this.db
            .update(comparisonRuns)
            .set({
                aiReviewStatus: 'running',
                aiReview: null,
                aiReviewError: null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(comparisonRuns.organizationId, organizationId),
                    eq(comparisonRuns.comparisonId, comparisonId),
                    eq(comparisonRuns.id, runId),
                    inArray(comparisonRuns.aiReviewStatus, ['pending', 'failed', 'unavailable']),
                ),
            )
            .returning();
        return record ?? null;
    }

    async setAiReviewSuccess(organizationId: string, comparisonId: string, runId: string, review: ComparisonAiReview) {
        return this.updateAiReview(organizationId, comparisonId, runId, {
            aiReviewStatus: 'success',
            aiReview: review,
            aiReviewError: null,
        });
    }

    async setAiReviewFailure(organizationId: string, comparisonId: string, runId: string, status: Extract<ComparisonAiReviewStatus, 'failed' | 'unavailable'>, message: string) {
        return this.updateAiReview(organizationId, comparisonId, runId, {
            aiReviewStatus: status,
            aiReview: null,
            aiReviewError: message,
        });
    }

    async markStaleRunningFailed(organizationId: string, before: Date): Promise<number> {
        this.assertInited();
        const rows = await this.db
            .select()
            .from(comparisonRuns)
            .where(and(eq(comparisonRuns.organizationId, organizationId), eq(comparisonRuns.status, 'running'), lt(comparisonRuns.updatedAt, before)));
        for (const row of rows) {
            await this.failRun({
                organizationId: row.organizationId,
                comparisonId: row.comparisonId,
                runId: row.id,
                code: 'comparison_timeout',
                message: 'Schema comparison timed out before completion.',
            }).catch(() => undefined);
        }
        return rows.length;
    }

    async delete(organizationId: string, comparisonId: string): Promise<void> {
        this.assertInited();
        await this.get(organizationId, comparisonId);
        const runs = await this.db
            .select()
            .from(comparisonRuns)
            .where(and(eq(comparisonRuns.organizationId, organizationId), eq(comparisonRuns.comparisonId, comparisonId)));
        for (const run of runs) {
            if (run.resultSetId) {
                await this.resultSets.deleteResultSet({ organizationId, resultSetId: run.resultSetId }).catch(() => undefined);
            }
            if (run.artifactRef) {
                await this.artifacts.comparisons.deleteRun(run.artifactRef).catch(() => undefined);
            }
        }
        await this.artifacts.comparisons.deleteComparisonById(organizationId, comparisonId).catch(() => undefined);
        await this.db.delete(comparisonRuns).where(and(eq(comparisonRuns.organizationId, organizationId), eq(comparisonRuns.comparisonId, comparisonId)));
        await this.db.delete(comparisons).where(and(eq(comparisons.organizationId, organizationId), eq(comparisons.id, comparisonId)));
    }

    private async updateAiReview(organizationId: string, comparisonId: string, runId: string, values: Pick<NewComparisonRun, 'aiReviewStatus' | 'aiReview' | 'aiReviewError'>) {
        this.assertInited();
        const [record] = await this.db
            .update(comparisonRuns)
            .set({ ...values, updatedAt: new Date() })
            .where(and(eq(comparisonRuns.organizationId, organizationId), eq(comparisonRuns.comparisonId, comparisonId), eq(comparisonRuns.id, runId)))
            .returning();
        if (!record) throw new DatabaseError('Comparison run not found', 404);
        return record;
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError('Database not initialized', 500);
    }
}
