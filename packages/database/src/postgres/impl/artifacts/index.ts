import { and, count, desc, eq, gt, ilike, inArray, isNull, or } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import { artifacts, comparisons, connections, resultSets, works, type ArtifactChartState, type ArtifactType, type NewArtifact } from '@dory/database/postgres/schemas';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import type { PostgresDBClient } from '@dory/shared';

export type ArtifactSummary = {
    id: string;
    type: ArtifactType;
    title: string;
    status: string;
    resourceId: string;
    parentArtifactId: string | null;
    sourceResultSetId: string | null;
    connectionId: string | null;
    connectionName: string | null;
    workId: string | null;
    agentRunId: string | null;
    runTitle: string | null;
    comparisonId: string | null;
    comparisonName: string | null;
    sourceType: string | null;
    createdByActorType: string;
    createdByActorId: string | null;
    rowCount: number | null;
    byteSize: number | null;
    fileName: string | null;
    fileFormat: 'csv' | 'parquet' | null;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date | null;
};

export type ArtifactDetail = ArtifactSummary & {
    chartState: ArtifactChartState | null;
    resultSet: {
        id: string;
        columns: unknown[];
        dataAvailability: string;
        sql: string | null;
        previewRowCount: number;
    } | null;
    downloadUrl: string | null;
};

function defaultTitle(type: ArtifactType, resourceId: string) {
    const label = type === 'result_set' ? 'Result Set' : type === 'chart' ? 'Chart' : 'File';
    return `${label} ${resourceId.replace(/^[^_]+_/, '').slice(0, 8)}`;
}

export class PostgresArtifactsRepository {
    private db!: PostgresDBClient;

    async init() {
        const client = await getClient();
        if (!client) throw new DatabaseError('Database connection failed', 500);
        this.db = client as PostgresDBClient;
    }

    async register(input: Omit<NewArtifact, 'id' | 'title'> & { id?: string; title?: string | null }) {
        this.assertInited();
        const id = input.id ?? `art_${newEntityId()}`;
        const title = input.title?.trim() || defaultTitle(input.type, input.resourceId);
        const [row] = await this.db
            .insert(artifacts)
            .values({ ...input, id, title })
            .onConflictDoUpdate({
                target: [artifacts.organizationId, artifacts.type, artifacts.resourceId],
                set: {
                    status: input.status ?? 'ready',
                    byteSize: input.byteSize ?? null,
                    expiresAt: input.expiresAt ?? null,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return row;
    }

    async list(input: { organizationId: string; query?: string | null; types?: ArtifactType[]; offset?: number; limit?: number }) {
        this.assertInited();
        const query = input.query?.trim();
        const conditions = [eq(artifacts.organizationId, input.organizationId), or(isNull(artifacts.expiresAt), gt(artifacts.expiresAt, new Date()))!];
        if (input.types?.length) conditions.push(inArray(artifacts.type, input.types));
        if (query) {
            const match = `%${query.replace(/[%_]/g, value => `\\${value}`)}%`;
            conditions.push(or(ilike(artifacts.title, match), ilike(connections.name, match), ilike(works.title, match), ilike(comparisons.name, match))!);
        }
        const where = and(...conditions);
        const base = this.db
            .select({
                artifact: artifacts,
                connectionName: connections.name,
                runTitle: works.title,
                comparisonName: comparisons.name,
                rowCount: resultSets.rowCount,
            })
            .from(artifacts)
            .leftJoin(connections, and(eq(connections.organizationId, artifacts.organizationId), eq(connections.id, artifacts.connectionId)))
            .leftJoin(works, eq(works.workId, artifacts.workId))
            .leftJoin(comparisons, and(eq(comparisons.organizationId, artifacts.organizationId), eq(comparisons.id, artifacts.comparisonId)))
            .leftJoin(resultSets, and(eq(resultSets.organizationId, artifacts.organizationId), eq(resultSets.id, artifacts.sourceResultSetId)))
            .where(where);
        const [rows, totals] = await Promise.all([
            base
                .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
                .limit(Math.min(input.limit ?? 50, 100))
                .offset(input.offset ?? 0),
            this.db
                .select({ total: count() })
                .from(artifacts)
                .leftJoin(connections, and(eq(connections.organizationId, artifacts.organizationId), eq(connections.id, artifacts.connectionId)))
                .leftJoin(works, eq(works.workId, artifacts.workId))
                .leftJoin(comparisons, and(eq(comparisons.organizationId, artifacts.organizationId), eq(comparisons.id, artifacts.comparisonId)))
                .where(where),
        ]);
        return { rows: rows.map(row => this.toSummary(row)), total: Number(totals[0]?.total ?? 0) };
    }

    async get(input: { organizationId: string; artifactId: string }): Promise<ArtifactDetail> {
        this.assertInited();
        const [row] = await this.db
            .select({
                artifact: artifacts,
                connectionName: connections.name,
                runTitle: works.title,
                comparisonName: comparisons.name,
                resultSet: resultSets,
            })
            .from(artifacts)
            .leftJoin(connections, and(eq(connections.organizationId, artifacts.organizationId), eq(connections.id, artifacts.connectionId)))
            .leftJoin(works, eq(works.workId, artifacts.workId))
            .leftJoin(comparisons, and(eq(comparisons.organizationId, artifacts.organizationId), eq(comparisons.id, artifacts.comparisonId)))
            .leftJoin(resultSets, and(eq(resultSets.organizationId, artifacts.organizationId), eq(resultSets.id, artifacts.sourceResultSetId)))
            .where(and(eq(artifacts.organizationId, input.organizationId), eq(artifacts.id, input.artifactId)))
            .limit(1);
        if (!row) throw new DatabaseError('Artifact not found', 404);
        if (row.artifact.expiresAt && row.artifact.expiresAt.getTime() <= Date.now()) throw new DatabaseError('Artifact is no longer available', 404);
        return {
            ...this.toSummary({ ...row, rowCount: row.resultSet?.rowCount ?? null }),
            chartState: row.artifact.chartState,
            resultSet: row.resultSet
                ? {
                      id: row.resultSet.id,
                      columns: row.resultSet.schemaJson,
                      dataAvailability: row.resultSet.dataAvailability,
                      sql: row.resultSet.sql,
                      previewRowCount: row.resultSet.previewRowCount,
                  }
                : null,
            downloadUrl: row.artifact.type === 'file' ? `/api/result-set-exports/${encodeURIComponent(row.artifact.resourceId)}` : null,
        };
    }

    async rename(input: { organizationId: string; artifactId: string; title: string }) {
        this.assertInited();
        const title = input.title.trim();
        if (!title) throw new DatabaseError('Artifact title is required', 400);
        const [row] = await this.db
            .update(artifacts)
            .set({ title: title.slice(0, 160), updatedAt: new Date() })
            .where(and(eq(artifacts.organizationId, input.organizationId), eq(artifacts.id, input.artifactId)))
            .returning();
        if (!row) throw new DatabaseError('Artifact not found', 404);
        return row;
    }

    async createChart(input: {
        organizationId: string;
        sourceArtifactId: string;
        title?: string | null;
        chartState: ArtifactChartState;
        createdByActorType: string;
        createdByActorId?: string | null;
    }) {
        const source = await this.get({ organizationId: input.organizationId, artifactId: input.sourceArtifactId });
        if (!source.sourceResultSetId) throw new DatabaseError('Chart source result set is unavailable', 409);
        const resourceId = `chart_${newEntityId()}`;
        return this.register({
            organizationId: input.organizationId,
            type: 'chart',
            title: input.title ?? `${source.title} chart`,
            status: 'ready',
            resourceId,
            parentArtifactId: source.id,
            sourceResultSetId: source.sourceResultSetId,
            connectionId: source.connectionId,
            workId: source.workId,
            agentRunId: source.agentRunId,
            comparisonId: source.comparisonId,
            sourceType: source.sourceType,
            createdByActorType: input.createdByActorType,
            createdByActorId: input.createdByActorId ?? null,
            chartState: input.chartState,
            expiresAt: source.expiresAt,
        });
    }

    async updateChart(input: { organizationId: string; artifactId: string; chartState: ArtifactChartState }) {
        this.assertInited();
        const [row] = await this.db
            .update(artifacts)
            .set({ chartState: input.chartState, updatedAt: new Date() })
            .where(and(eq(artifacts.organizationId, input.organizationId), eq(artifacts.id, input.artifactId), eq(artifacts.type, 'chart')))
            .returning();
        if (!row) throw new DatabaseError('Chart artifact not found', 404);
        return row;
    }

    async deleteForResultSet(organizationId: string, resultSetId: string) {
        this.assertInited();
        await this.db.delete(artifacts).where(and(eq(artifacts.organizationId, organizationId), eq(artifacts.sourceResultSetId, resultSetId)));
    }

    async deleteByResource(organizationId: string, type: ArtifactType, resourceId: string) {
        this.assertInited();
        await this.db.delete(artifacts).where(and(eq(artifacts.organizationId, organizationId), eq(artifacts.type, type), eq(artifacts.resourceId, resourceId)));
    }

    private toSummary(row: {
        artifact: typeof artifacts.$inferSelect;
        connectionName: string | null;
        runTitle: string | null;
        comparisonName: string | null;
        rowCount: number | null;
    }): ArtifactSummary {
        return {
            ...row.artifact,
            connectionName: row.connectionName,
            runTitle: row.runTitle,
            comparisonName: row.comparisonName,
            rowCount: row.rowCount,
        };
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError('Artifacts repository is not initialized', 500);
    }
}
