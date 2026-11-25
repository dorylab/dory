import { createHash } from 'node:crypto';
import type { CreatedDocument, DocumentTopic } from '@dory/shared/types/knowledge-document-draft';
import { getClient } from '@dory/database/postgres/client';
import {
    connections,
    knowledgeQuerySources,
    knowledgeConnectorItems,
    knowledgeConnectors,
    knowledgeConnectorSyncJobs,
    knowledgeDocumentBatches,
    knowledgeDocumentGenerationTasks,
    knowledgeFolders,
    knowledgeDriveAuthorizations,
    knowledgeLinearCredentials,
    knowledgeModels,
    knowledgeModelSources,
    knowledgeSources,
    knowledgeVerifiedQueries,
    user,
    type KnowledgeSourceFormat,
} from '@dory/database/postgres/schemas';
import type { PostgresDBClient } from '@dory/shared';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import { knowledgeSourceDisplayName } from '@dory/shared/utils/knowledge-source-name';
import { and, asc, desc, eq, getTableColumns, ilike, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';

import { assertDestination, KnowledgeDirectory, localDocument, lockDirectory } from './directory';
import { KnowledgeDocumentGenerationStore } from './document-generation';
import { LinearKnowledgeStore } from './linear';

export const KNOWLEDGE_SOURCE_MAX_BYTES = 10_000_000;
export const LINEAR_SYNC_INTERVAL_MS = 3600_000;

// Keep the GitHub snapshot wire names while treating paths as provider-stable IDs
// and SHAs as opaque content fingerprints for every provider.
export type KnowledgeConnectorSnapshot = {
    commitSha?: string;
    folders?: { id: string; parent: string; name: string }[];
    rootName?: string;
    files: Array<{
        path: string;
        sha: string;
        contentText: string;
        format?: KnowledgeSourceFormat;
        title?: string;
        sourceUrl?: string;
        projectId?: string;
        projectName?: string;
        folderTrail?: { id: string; name: string }[];
    }>;
};
export type KnowledgeModelDataSourceDetail = { connectionId: string; name: string; type: string; engine: string };
export type KnowledgeModelDetail = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    businessContextMd: string;
    dataSources: KnowledgeModelDataSourceDetail[];
    verifiedQueryCount: number;
    knowledgeSourceCount: number;
    createdAt: Date;
    updatedAt: Date;
};

export function validateKnowledgeSource(fileName: string, contentText: string) {
    const normalizedName = fileName.trim();
    if (!normalizedName || normalizedName.includes('/') || normalizedName.includes('\\') || normalizedName.includes('\0')) throw new Error('Enter a valid file name.');
    const extension = normalizedName.split('.').pop()?.toLowerCase();
    const format: KnowledgeSourceFormat | undefined =
        extension === 'md' || extension === 'markdown' ? 'markdown' : extension === 'yaml' || extension === 'yml' ? 'yaml' : extension === 'txt' ? 'text' : undefined;
    if (!format) throw new Error('Only Markdown, YAML, and TXT files are supported.');
    const byteSize = Buffer.byteLength(contentText, 'utf8');
    if (byteSize > KNOWLEDGE_SOURCE_MAX_BYTES) throw new Error('Knowledge source files must be 10 MB or smaller.');
    return { fileName: normalizedName, format, contentText, byteSize };
}

async function recordDocumentUse(db: Pick<PostgresDBClient, 'select' | 'update'>, knowledgeModelId: string, userId: string, sourceIds: string[]) {
    await db
        .update(knowledgeDocumentBatches)
        .set({ firstPeerUseAt: new Date() })
        .where(
            and(
                eq(knowledgeDocumentBatches.knowledgeModelId, knowledgeModelId),
                ne(knowledgeDocumentBatches.createdBy, userId),
                isNull(knowledgeDocumentBatches.firstPeerUseAt),
                inArray(
                    knowledgeDocumentBatches.id,
                    db.select({ batch: knowledgeSources.generationBatchId }).from(knowledgeSources).where(inArray(knowledgeSources.id, sourceIds)),
                ),
            ),
        );
}

export class PostgresKnowledgeRepository {
    private db!: PostgresDBClient;

    get directory() {
        return new KnowledgeDirectory(this.db);
    }

    get linear() {
        return new LinearKnowledgeStore(this.db);
    }

    get documentGeneration() {
        return new KnowledgeDocumentGenerationStore(this.db);
    }

    async init(db?: PostgresDBClient) {
        const client = db ?? (await getClient());
        if (!client) throw new DatabaseError('Database connection failed', 500);
        this.db = client as PostgresDBClient;
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError('Database connection failed', 500);
    }

    private async assertConnections(organizationId: string, connectionIds: string[]) {
        const uniqueIds = [...new Set(connectionIds)];
        if (!uniqueIds.length) throw new Error('Select at least one data source.');
        const rows = await this.db
            .select({ id: connections.id })
            .from(connections)
            .where(and(eq(connections.organizationId, organizationId), inArray(connections.id, uniqueIds)));
        if (rows.length !== uniqueIds.length) throw new Error('One or more data sources are unavailable.');
        return uniqueIds;
    }

    private async sourceDetails(modelIds: string[]) {
        if (!modelIds.length) return [];
        const rows = await this.db
            .select({
                knowledgeModelId: knowledgeModelSources.knowledgeModelId,
                connectionId: connections.id,
                name: connections.name,
                type: connections.type,
                engine: connections.engine,
            })
            .from(knowledgeModelSources)
            .innerJoin(connections, eq(connections.id, knowledgeModelSources.connectionId))
            .where(inArray(knowledgeModelSources.knowledgeModelId, modelIds));
        return rows;
    }

    private async touchModel(knowledgeModelId: string) {
        await this.db.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, knowledgeModelId));
    }

    async listModels(input: { organizationId: string; query?: string | null; connectionId?: string | null }): Promise<KnowledgeModelDetail[]> {
        this.assertInited();
        let rows = await this.db.select().from(knowledgeModels).where(eq(knowledgeModels.organizationId, input.organizationId)).orderBy(desc(knowledgeModels.updatedAt));
        const dataSources = await this.sourceDetails(rows.map(row => row.id));
        if (input.connectionId) {
            const allowed = new Set(dataSources.filter(source => source.connectionId === input.connectionId).map(source => source.knowledgeModelId));
            rows = rows.filter(row => allowed.has(row.id));
        }
        const query = input.query?.trim().toLowerCase();
        if (query)
            rows = rows.filter(row =>
                `${row.name} ${row.description ?? ''} ${dataSources
                    .filter(source => source.knowledgeModelId === row.id)
                    .map(source => `${source.name} ${source.engine}`)
                    .join(' ')}`
                    .toLowerCase()
                    .includes(query),
            );
        const ids = rows.map(row => row.id);
        const verified = ids.length
            ? await this.db
                  .select({ knowledgeModelId: knowledgeVerifiedQueries.knowledgeModelId })
                  .from(knowledgeVerifiedQueries)
                  .where(inArray(knowledgeVerifiedQueries.knowledgeModelId, ids))
            : [];
        const sourceRows = ids.length
            ? await this.db.select({ knowledgeModelId: knowledgeSources.knowledgeModelId }).from(knowledgeSources).where(inArray(knowledgeSources.knowledgeModelId, ids))
            : [];
        return rows.map(row => {
            const modelDataSources = dataSources.filter(source => source.knowledgeModelId === row.id).map(({ knowledgeModelId: _, ...source }) => source);
            const verifiedQueryCount = verified.filter(queryRow => queryRow.knowledgeModelId === row.id).length;
            return {
                ...row,
                dataSources: modelDataSources,
                verifiedQueryCount,
                knowledgeSourceCount: sourceRows.filter(source => source.knowledgeModelId === row.id).length,
            };
        });
    }

    async getModel(input: { organizationId: string; knowledgeModelId: string }) {
        const models = await this.listModels({ organizationId: input.organizationId });
        const found = models.find(item => item.id === input.knowledgeModelId);
        if (!found) throw new Error('Knowledge base not found.');
        return found;
    }

    async createModel(input: { organizationId: string; name: string; description?: string | null; connectionIds: string[] }) {
        const connectionIds = await this.assertConnections(input.organizationId, input.connectionIds);
        const knowledgeModelId = await this.db.transaction(async tx => {
            const [model] = await tx
                .insert(knowledgeModels)
                .values({
                    organizationId: input.organizationId,
                    name: input.name.trim(),
                    description: input.description?.trim() || null,
                })
                .returning({ id: knowledgeModels.id });
            const knowledgeModelId = model!.id;
            await tx.insert(knowledgeModelSources).values(connectionIds.map(connectionId => ({ knowledgeModelId, connectionId })));
            const rules = validateKnowledgeSource(
                'RULES.md',
                [
                    '- 分析指标时优先查阅本知识库 Markdown 文档中的口径。如果多个口径都适用且会影响结论，先向用户确认。',
                    '- 编写 SQL 前先查找相关的已验证查询，复用时核对数据源、时间范围和筛选条件。',
                ].join('\n'),
            );
            await tx.insert(knowledgeSources).values({ organizationId: input.organizationId, knowledgeModelId, systemRole: 'analysis_rules', ...rules });
            return knowledgeModelId;
        });
        return this.getModel({ organizationId: input.organizationId, knowledgeModelId });
    }

    async listAnalysisRuleCandidates(organizationId: string, connectionIds: string[]) {
        if (!connectionIds.length) return [];
        return this.db
            .select({ modelId: knowledgeModels.id, name: knowledgeModels.name, connectionId: knowledgeModelSources.connectionId, sourceId: knowledgeSources.id })
            .from(knowledgeModels)
            .innerJoin(knowledgeModelSources, eq(knowledgeModelSources.knowledgeModelId, knowledgeModels.id))
            .leftJoin(knowledgeSources, and(eq(knowledgeSources.knowledgeModelId, knowledgeModels.id), eq(knowledgeSources.systemRole, 'analysis_rules')))
            .where(and(eq(knowledgeModels.organizationId, organizationId), inArray(knowledgeModelSources.connectionId, connectionIds)));
    }

    async getAnalysisRules(organizationId: string, knowledgeModelId: string): Promise<{ id: string; contentText: string } | null> {
        const [document] = await this.db
            .select({ id: knowledgeSources.id, contentText: knowledgeSources.contentText })
            .from(knowledgeSources)
            .where(
                and(
                    eq(knowledgeSources.organizationId, organizationId),
                    eq(knowledgeSources.knowledgeModelId, knowledgeModelId),
                    eq(knowledgeSources.systemRole, 'analysis_rules'),
                ),
            );
        return document ?? null;
    }

    async updateModel(input: { organizationId: string; knowledgeModelId: string; name?: string; description?: string | null; businessContextMd?: string }) {
        await this.db
            .update(knowledgeModels)
            .set({
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
                businessContextMd: input.businessContextMd,
            })
            .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)));
        return this.getModel(input);
    }

    async deleteModel(input: { organizationId: string; knowledgeModelId: string }) {
        await this.getModel(input);
        await this.db.delete(knowledgeModels).where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)));
    }

    async listQuerySources(input: { organizationId: string; knowledgeModelId: string; queryId: string }) {
        return this.db
            .select({ sourceId: knowledgeQuerySources.knowledgeSourceId, relationType: knowledgeQuerySources.relationType, connectionId: knowledgeSources.connectionId })
            .from(knowledgeQuerySources)
            .innerJoin(knowledgeSources, eq(knowledgeQuerySources.knowledgeSourceId, knowledgeSources.id))
            .where(
                and(
                    eq(knowledgeQuerySources.queryId, input.queryId),
                    eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId),
                    eq(knowledgeSources.organizationId, input.organizationId),
                ),
            );
    }

    async listSourceQueries(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        return this.db
            .select({ queryId: knowledgeQuerySources.queryId, connectionId: knowledgeVerifiedQueries.sourceConnectionId })
            .from(knowledgeQuerySources)
            .innerJoin(knowledgeVerifiedQueries, eq(knowledgeVerifiedQueries.id, knowledgeQuerySources.queryId))
            .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeQuerySources.knowledgeSourceId))
            .where(
                and(
                    eq(knowledgeQuerySources.knowledgeSourceId, input.id),
                    eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId),
                    eq(knowledgeSources.organizationId, input.organizationId),
                ),
            );
    }

    async replaceQuerySources(input: { organizationId: string; knowledgeModelId: string; queryId: string; sourceIds: string[]; createdBy?: string | null }) {
        return this.db.transaction(async tx => {
            await lockDirectory(tx, input);
            const [query] = await tx
                .select({ id: knowledgeVerifiedQueries.id })
                .from(knowledgeVerifiedQueries)
                .where(and(eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId), eq(knowledgeVerifiedQueries.id, input.queryId)))
                .for('update');
            if (!query) throw new Error('Verified query not found.');
            await this.writeQuerySources(tx, input);
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, input.knowledgeModelId));
        });
    }

    private async writeQuerySources(
        tx: Pick<PostgresDBClient, 'select' | 'update' | 'insert' | 'delete'>,
        input: {
            knowledgeModelId: string;
            queryId: string;
            sourceIds: string[];
            createdBy?: string | null;
        },
    ) {
        const sourceIds = [...new Set(input.sourceIds)];
        if (sourceIds.length) {
            const sources = await tx
                .select({ id: knowledgeSources.id })
                .from(knowledgeSources)
                .where(and(eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId), inArray(knowledgeSources.id, sourceIds)));
            if (sources.length !== sourceIds.length) throw new Error('One or more knowledge sources are unavailable.');
        }
        const previous = await tx.select().from(knowledgeQuerySources).where(eq(knowledgeQuerySources.queryId, input.queryId));
        await tx.delete(knowledgeQuerySources).where(eq(knowledgeQuerySources.queryId, input.queryId));
        if (sourceIds.length) {
            const byId = new Map(previous.map(row => [row.knowledgeSourceId, row]));
            await tx.insert(knowledgeQuerySources).values(
                sourceIds.map(
                    id =>
                        byId.get(id) ?? {
                            knowledgeSourceId: id,
                            queryId: input.queryId,
                            relationType: 'provided' as const,
                            createdBy: input.createdBy,
                        },
                ),
            );
            if (input.createdBy) await recordDocumentUse(tx, input.knowledgeModelId, input.createdBy, sourceIds);
        }
    }

    async addDataSource(input: { organizationId: string; knowledgeModelId: string; connectionId: string }) {
        await this.getModel(input);
        await this.assertConnections(input.organizationId, [input.connectionId]);
        await this.db.insert(knowledgeModelSources).values({ knowledgeModelId: input.knowledgeModelId, connectionId: input.connectionId }).onConflictDoNothing();
        await this.touchModel(input.knowledgeModelId);
        return this.getModel(input);
    }

    async removeDataSource(input: { organizationId: string; knowledgeModelId: string; connectionId: string }) {
        const model = await this.getModel(input);
        if (model.dataSources.length <= 1) throw new Error('A knowledge base must have at least one data source.');
        const [query] = await this.db
            .select({ id: knowledgeVerifiedQueries.id })
            .from(knowledgeVerifiedQueries)
            .where(and(eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId), eq(knowledgeVerifiedQueries.sourceConnectionId, input.connectionId)))
            .limit(1);
        if (query) throw new Error('Remove verified queries that use this data source first.');
        const [knowledgeSource] = await this.db
            .select({ id: knowledgeSources.id })
            .from(knowledgeSources)
            .where(and(eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId), eq(knowledgeSources.connectionId, input.connectionId)))
            .limit(1);
        if (knowledgeSource) throw new Error('Reassign knowledge sources that use this data source first.');
        await this.db
            .delete(knowledgeModelSources)
            .where(and(eq(knowledgeModelSources.knowledgeModelId, input.knowledgeModelId), eq(knowledgeModelSources.connectionId, input.connectionId)));
        await this.touchModel(input.knowledgeModelId);
        return this.getModel(input);
    }

    async replaceDataSources(input: { organizationId: string; knowledgeModelId: string; connectionIds: string[] }) {
        const model = await this.getModel(input);
        const connectionIds = await this.assertConnections(input.organizationId, input.connectionIds);
        const nextIds = new Set(connectionIds);
        const removedIds = model.dataSources.map(source => source.connectionId).filter(connectionId => !nextIds.has(connectionId));

        for (const connectionId of removedIds) {
            const [query] = await this.db
                .select({ id: knowledgeVerifiedQueries.id })
                .from(knowledgeVerifiedQueries)
                .where(and(eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId), eq(knowledgeVerifiedQueries.sourceConnectionId, connectionId)))
                .limit(1);
            if (query) throw new Error('Remove verified queries that use this data source first.');
            const [knowledgeSource] = await this.db
                .select({ id: knowledgeSources.id })
                .from(knowledgeSources)
                .where(and(eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId), eq(knowledgeSources.connectionId, connectionId)))
                .limit(1);
            if (knowledgeSource) throw new Error('Reassign knowledge sources that use this data source first.');
        }

        await this.db
            .insert(knowledgeModelSources)
            .values(connectionIds.map(connectionId => ({ knowledgeModelId: input.knowledgeModelId, connectionId })))
            .onConflictDoNothing();
        if (removedIds.length) {
            await this.db
                .delete(knowledgeModelSources)
                .where(and(eq(knowledgeModelSources.knowledgeModelId, input.knowledgeModelId), inArray(knowledgeModelSources.connectionId, removedIds)));
        }
        await this.touchModel(input.knowledgeModelId);
        return this.getModel(input);
    }

    async listKnowledgeSources(input: { organizationId: string; knowledgeModelId: string; connectionId?: string | null }) {
        await this.getModel(input);
        const conditions = [eq(knowledgeSources.organizationId, input.organizationId), eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId)];
        if (input.connectionId) conditions.push(or(isNull(knowledgeSources.connectionId), eq(knowledgeSources.connectionId, input.connectionId))!);
        const rows = await this.db
            .select({
                id: knowledgeSources.id,
                organizationId: knowledgeSources.organizationId,
                knowledgeModelId: knowledgeSources.knowledgeModelId,
                connectionId: knowledgeSources.connectionId,
                folderId: knowledgeSources.folderId,
                projectId: knowledgeConnectorItems.projectId,
                projectName: knowledgeConnectorItems.projectName,
                systemRole: knowledgeSources.systemRole,
                fileName: knowledgeSources.fileName,
                format: knowledgeSources.format,
                byteSize: knowledgeSources.byteSize,
                createdBy: knowledgeSources.createdBy,
                createdAt: knowledgeSources.createdAt,
                updatedAt: knowledgeSources.updatedAt,
                connectorId: knowledgeConnectorItems.connectorId,
                connectorProvider: knowledgeConnectors.provider,
                remotePath: knowledgeConnectorItems.remotePath,
                remoteTitle: knowledgeConnectorItems.remoteTitle,
                folderTrail: knowledgeConnectorItems.folderTrail,
                sourceUrl: knowledgeConnectorItems.sourceUrl,
            })
            .from(knowledgeSources)
            .leftJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
            .leftJoin(knowledgeConnectors, eq(knowledgeConnectors.id, knowledgeConnectorItems.connectorId))
            .where(and(...conditions))
            .orderBy(desc(knowledgeSources.updatedAt));
        return rows.map(source => ({ ...source, fileName: knowledgeSourceDisplayName(source) }));
    }

    async searchKnowledgeSources(input: { organizationId: string; knowledgeModelId: string; connectionId?: string; query: string }) {
        const model = await this.getModel(input);
        if (input.connectionId && !model.dataSources.some(source => source.connectionId === input.connectionId))
            throw new Error('This data source is not linked to the selected knowledge base.');
        const conditions = [eq(knowledgeSources.organizationId, input.organizationId), eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId)];
        if (input.connectionId) conditions.push(or(isNull(knowledgeSources.connectionId), eq(knowledgeSources.connectionId, input.connectionId))!);
        const rows = await this.db
            .select({
                ...getTableColumns(knowledgeSources),
                sourceUrl: knowledgeConnectorItems.sourceUrl,
                connectorId: knowledgeConnectorItems.connectorId,
                connectorProvider: knowledgeConnectors.provider,
                remotePath: knowledgeConnectorItems.remotePath,
                remoteTitle: knowledgeConnectorItems.remoteTitle,
                folderTrail: knowledgeConnectorItems.folderTrail,
            })
            .from(knowledgeSources)
            .leftJoin(knowledgeConnectorItems, eq(knowledgeSources.id, knowledgeConnectorItems.knowledgeSourceId))
            .leftJoin(knowledgeConnectors, eq(knowledgeConnectors.id, knowledgeConnectorItems.connectorId))
            .where(and(...conditions))
            .orderBy(desc(knowledgeSources.updatedAt));
        const needle = input.query.trim().toLowerCase();
        return rows
            .map(source => {
                const displayName = knowledgeSourceDisplayName(source);
                const haystack = `${displayName}\n${source.contentText}`.toLowerCase();
                const matchIndex = haystack.indexOf(needle);
                if (matchIndex < 0) return null;
                const contentIndex = source.contentText.toLowerCase().indexOf(needle);
                const start = Math.max(0, contentIndex < 0 ? 0 : contentIndex - 240);
                const excerpt = source.contentText.slice(start, start + 800).trim();
                return { id: source.id, fileName: displayName, format: source.format, connectionId: source.connectionId, sourceUrl: source.sourceUrl, excerpt };
            })
            .filter((source): source is NonNullable<typeof source> => Boolean(source))
            .slice(0, 10);
    }

    async getKnowledgeSource(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        await this.getModel(input);
        const [source] = await this.db
            .select({
                id: knowledgeSources.id,
                organizationId: knowledgeSources.organizationId,
                knowledgeModelId: knowledgeSources.knowledgeModelId,
                connectionId: knowledgeSources.connectionId,
                folderId: knowledgeSources.folderId,
                projectId: knowledgeConnectorItems.projectId,
                projectName: knowledgeConnectorItems.projectName,
                generationBatchId: knowledgeSources.generationBatchId,
                systemRole: knowledgeSources.systemRole,
                fileName: knowledgeSources.fileName,
                format: knowledgeSources.format,
                contentText: knowledgeSources.contentText,
                byteSize: knowledgeSources.byteSize,
                createdBy: knowledgeSources.createdBy,
                createdAt: knowledgeSources.createdAt,
                updatedAt: knowledgeSources.updatedAt,
                connectorId: knowledgeConnectorItems.connectorId,
                connectorProvider: knowledgeConnectors.provider,
                remotePath: knowledgeConnectorItems.remotePath,
                remoteTitle: knowledgeConnectorItems.remoteTitle,
                folderTrail: knowledgeConnectorItems.folderTrail,
                remoteRevision: knowledgeConnectorItems.remoteSha,
                sourceUrl: knowledgeConnectorItems.sourceUrl,
            })
            .from(knowledgeSources)
            .leftJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
            .leftJoin(knowledgeConnectors, eq(knowledgeConnectors.id, knowledgeConnectorItems.connectorId))
            .where(and(eq(knowledgeSources.id, input.id), eq(knowledgeSources.organizationId, input.organizationId), eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId)))
            .limit(1);
        if (!source) throw new Error('Knowledge source not found.');
        return { ...source, fileName: knowledgeSourceDisplayName(source) };
    }

    private async assertKnowledgeSourceConnection(model: KnowledgeModelDetail, connectionId?: string | null) {
        if (connectionId && !model.dataSources.some(source => source.connectionId === connectionId)) {
            throw new Error('The selected data source is not linked to this knowledge base.');
        }
    }

    async documentGenerationContext(input: { organizationId: string; knowledgeModelId: string; connectionId: string; documentIds: string[]; queryIds: string[] }) {
        const [source] = await this.db
            .select({ engine: connections.engine, name: connections.name })
            .from(knowledgeModelSources)
            .innerJoin(knowledgeModels, eq(knowledgeModelSources.knowledgeModelId, knowledgeModels.id))
            .innerJoin(connections, eq(knowledgeModelSources.connectionId, connections.id))
            .where(
                and(
                    eq(knowledgeModels.organizationId, input.organizationId),
                    eq(connections.organizationId, input.organizationId),
                    eq(knowledgeModels.id, input.knowledgeModelId),
                    eq(connections.id, input.connectionId),
                ),
            );
        if (!source) throw new Error('Choose a linked data source.');
        const [documents, queries] = await Promise.all([
            input.documentIds.length
                ? this.db
                      .select({
                          id: knowledgeSources.id,
                          fileName: knowledgeSources.fileName,
                          content: sql<string>`left(${knowledgeSources.contentText}, 150001)`,
                          remoteTitle: knowledgeConnectorItems.remoteTitle,
                          remotePath: knowledgeConnectorItems.remotePath,
                          connectorProvider: knowledgeConnectors.provider,
                          connectorId: knowledgeConnectorItems.connectorId,
                      })
                      .from(knowledgeSources)
                      .leftJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
                      .leftJoin(knowledgeConnectors, eq(knowledgeConnectors.id, knowledgeConnectorItems.connectorId))
                      .where(
                          and(
                              eq(knowledgeSources.organizationId, input.organizationId),
                              eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId),
                              inArray(knowledgeSources.id, input.documentIds),
                          ),
                      )
                : [],
            input.queryIds.length
                ? this.db
                      .select({
                          id: knowledgeVerifiedQueries.id,
                          title: knowledgeVerifiedQueries.title,
                          content: sql<string>`left(concat_ws(E'\n', ${knowledgeVerifiedQueries.question}, ${knowledgeVerifiedQueries.description}, ${knowledgeVerifiedQueries.sql}), 150001)`,
                          connectionName: connections.name,
                      })
                      .from(knowledgeVerifiedQueries)
                      .innerJoin(connections, eq(knowledgeVerifiedQueries.sourceConnectionId, connections.id))
                      .where(and(eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId), inArray(knowledgeVerifiedQueries.id, input.queryIds)))
                : [],
        ]);
        if (documents.length !== new Set(input.documentIds).size || queries.length !== new Set(input.queryIds).size)
            throw new Error('A selected reference is no longer available.');
        return {
            source,
            references: [
                ...documents.map(d => ({ id: d.id, kind: 'document' as const, title: knowledgeSourceDisplayName(d), text: d.content })),
                ...queries.map(q => ({ id: q.id, kind: 'query' as const, title: q.title + ' · ' + q.connectionName, text: q.content })),
            ],
        };
    }

    async createDocumentBatch(input: {
        organizationId: string;
        knowledgeModelId: string;
        connectionId: string;
        folderId: string | null;
        batchId: string;
        taskId?: string;
        createdBy: string;
        elapsedMs: number;
        topics: DocumentTopic[];
    }) {
        const started = Date.now();
        return this.db.transaction(async tx => {
            await lockDirectory(tx, input);
            const { knowledgeModelId, organizationId, connectionId, createdBy } = input;
            if (input.taskId) {
                const [task] = await tx
                    .select()
                    .from(knowledgeDocumentGenerationTasks)
                    .where(
                        and(
                            eq(knowledgeDocumentGenerationTasks.id, input.taskId),
                            eq(knowledgeDocumentGenerationTasks.organizationId, organizationId),
                            eq(knowledgeDocumentGenerationTasks.createdBy, createdBy),
                            eq(knowledgeDocumentGenerationTasks.knowledgeModelId, knowledgeModelId),
                        ),
                    )
                    .for('update');
                if (!task || task.id !== input.batchId || task.input.connectionId !== connectionId || !['ready', 'saved'].includes(task.status))
                    throw new Error('Invalid document generation task.');
            }
            const [existing] = await tx.select().from(knowledgeDocumentBatches).where(eq(knowledgeDocumentBatches.id, input.batchId));
            if (existing) {
                if (existing.knowledgeModelId !== knowledgeModelId || existing.createdBy !== createdBy) throw new Error('Invalid batch.');
                return existing.documents;
            }
            const [link] = await tx
                .select()
                .from(knowledgeModelSources)
                .where(and(eq(knowledgeModelSources.knowledgeModelId, knowledgeModelId), eq(knowledgeModelSources.connectionId, connectionId)))
                .for('share');
            if (!link) throw new Error('The data source is no longer linked to this knowledge base.');
            const documents: CreatedDocument[] = [];
            await tx.insert(knowledgeDocumentBatches).values({ id: input.batchId, knowledgeModelId, createdBy, elapsedMs: input.elapsedMs });
            for (const topic of input.topics) {
                const name = topic.name.trim();
                if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name) || !topic.documents.length) throw new Error('Invalid topic folder.');
                const [existingFolder] = await tx
                    .select({ id: knowledgeFolders.id })
                    .from(knowledgeFolders)
                    .where(
                        and(
                            eq(knowledgeFolders.knowledgeModelId, knowledgeModelId),
                            eq(knowledgeFolders.name, name),
                            input.folderId === null ? isNull(knowledgeFolders.parentId) : eq(knowledgeFolders.parentId, input.folderId),
                        ),
                    );
                await assertDestination(tx, knowledgeModelId, input.folderId, name, existingFolder?.id);
                const folder =
                    existingFolder ?? (await tx.insert(knowledgeFolders).values({ knowledgeModelId, parentId: input.folderId, name }).returning({ id: knowledgeFolders.id }))[0];
                for (const doc of topic.documents) {
                    const value = validateKnowledgeSource(doc.fileName, doc.contentText);
                    if (value.format !== 'markdown') throw new Error('Choose a Markdown file name.');
                    await assertDestination(tx, knowledgeModelId, folder.id, value.fileName);
                    const [file] = await tx
                        .insert(knowledgeSources)
                        .values({
                            ...value,
                            organizationId,
                            knowledgeModelId,
                            connectionId,
                            createdBy,
                            folderId: folder.id,
                            generationBatchId: input.batchId,
                            schemaEvidence: { ...doc.evidence, connectionId },
                        })
                        .returning({ id: knowledgeSources.id });
                    documents.push({ id: file.id, folderId: folder.id });
                }
            }
            if (!documents.length) throw new Error('Select a document.');
            if (input.taskId)
                await tx
                    .update(knowledgeDocumentGenerationTasks)
                    .set({
                        status: 'saved',
                        phase: 'saved',
                        documents,
                        folderId: input.folderId,
                        updatedAt: new Date(),
                    })
                    .where(eq(knowledgeDocumentGenerationTasks.id, input.taskId));
            const citations = input.topics.flatMap(topic => topic.documents.flatMap(doc => doc.evidence.references.filter(ref => ref.kind === 'document').map(ref => ref.id)));
            if (citations.length) await recordDocumentUse(tx, knowledgeModelId, createdBy, citations);
            const elapsedMs = Math.min(2147483647, input.elapsedMs + Math.max(0, Date.now() - started));
            await tx.update(knowledgeDocumentBatches).set({ documents, elapsedMs }).where(eq(knowledgeDocumentBatches.id, input.batchId));
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, knowledgeModelId));
            return documents;
        });
    }

    async recordDocumentUse(knowledgeModelId: string, userId: string, sourceIds: string[]) {
        return recordDocumentUse(this.db, knowledgeModelId, userId, sourceIds);
    }

    async createKnowledgeSource(input: {
        organizationId: string;
        knowledgeModelId: string;
        fileName: string;
        contentText: string;
        connectionId?: string | null;
        folderId?: string | null;
        createdBy?: string | null;
    }) {
        const model = await this.getModel(input);
        await this.assertKnowledgeSourceConnection(model, input.connectionId);
        const value = validateKnowledgeSource(input.fileName, input.contentText);
        const id = await this.db.transaction(async tx => {
            await lockDirectory(tx, input);
            const folderId = input.folderId ?? null;
            if (folderId && value.format !== 'markdown') throw new Error('Choose a Markdown document for this folder.');
            await assertDestination(tx, model.id, folderId, value.fileName);
            const [source] = await tx
                .insert(knowledgeSources)
                .values({
                    organizationId: input.organizationId,
                    knowledgeModelId: model.id,
                    folderId,
                    connectionId: input.connectionId || null,
                    createdBy: input.createdBy || null,
                    ...value,
                })
                .returning({ id: knowledgeSources.id });
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, model.id));
            return source.id;
        });
        return this.getKnowledgeSource({ ...input, id });
    }

    async updateKnowledgeSource(input: {
        organizationId: string;
        knowledgeModelId: string;
        id: string;
        contentText: string;
        connectionId?: string | null;
        folderId?: string | null;
    }) {
        const model = await this.getModel(input);
        await this.assertKnowledgeSourceConnection(model, input.connectionId);
        await this.db.transaction(async tx => {
            await lockDirectory(tx, input);
            const existing = await localDocument(tx, model.id, input.id);
            if (existing.format !== 'markdown') throw new Error('This knowledge source is read-only.');
            if (existing.systemRole && (input.folderId || input.connectionId)) throw new Error('Analysis rules apply to the entire knowledge base and must stay in its root.');
            const value = validateKnowledgeSource(existing.fileName, input.contentText);
            if (input.folderId !== undefined) {
                if (input.folderId && value.format !== 'markdown') throw new Error('Choose a Markdown document for this folder.');
                await assertDestination(tx, model.id, input.folderId, existing.fileName, existing.id);
            }
            await tx
                .update(knowledgeSources)
                .set({ contentText: value.contentText, byteSize: value.byteSize, format: value.format, connectionId: input.connectionId || null, folderId: input.folderId })
                .where(eq(knowledgeSources.id, existing.id));
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, model.id));
        });
        return this.getKnowledgeSource(input);
    }

    async deleteKnowledgeSource(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        await this.db.transaction(async tx => {
            await lockDirectory(tx, input);
            const source = await localDocument(tx, input.knowledgeModelId, input.id);
            if (source.systemRole) throw new Error('Analysis rules cannot be deleted individually.');
            await tx.delete(knowledgeSources).where(eq(knowledgeSources.id, source.id));
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, input.knowledgeModelId));
        });
    }

    async beginDriveAuthorization(input: typeof knowledgeDriveAuthorizations.$inferInsert) {
        await this.getModel(input);
        await this.db.transaction(async tx => {
            await tx.delete(knowledgeDriveAuthorizations).where(lte(knowledgeDriveAuthorizations.expiresAt, new Date()));
            await tx.insert(knowledgeDriveAuthorizations).values(input);
        });
    }

    async clearExpiredDriveAuthorizations() {
        await this.db.delete(knowledgeDriveAuthorizations).where(lte(knowledgeDriveAuthorizations.expiresAt, new Date()));
    }

    async claimDriveCallback(state: string) {
        const [session] = await this.db
            .update(knowledgeDriveAuthorizations)
            .set({ state: null })
            .where(and(eq(knowledgeDriveAuthorizations.state, state), sql`${knowledgeDriveAuthorizations.expiresAt} > now()`))
            .returning();
        if (!session) throw new Error('Google authorization expired. Start again.');
        return session;
    }

    async finishDriveCallback(id: string, refreshTokenEncrypted: string | null) {
        await this.db.update(knowledgeDriveAuthorizations).set({ refreshTokenEncrypted, verifier: '' }).where(eq(knowledgeDriveAuthorizations.id, id));
    }

    async getDriveAuthorization(input: { id: string; organizationId: string; knowledgeModelId: string; userId: string }) {
        const table = knowledgeDriveAuthorizations;
        const [session] = await this.db
            .select()
            .from(table)
            .where(
                and(
                    eq(table.id, input.id),
                    eq(table.organizationId, input.organizationId),
                    eq(table.knowledgeModelId, input.knowledgeModelId),
                    eq(table.userId, input.userId),
                    sql`${table.expiresAt} > now()`,
                ),
            );
        if (!session) throw new Error('Google authorization expired. Start again.');
        return session;
    }

    async connectDriveFolder(input: { id: string; organizationId: string; knowledgeModelId: string; userId: string; folderId: string; name: string; connectorId?: string }) {
        const table = knowledgeDriveAuthorizations;
        return this.db.transaction(async tx => {
            const [session] = await tx
                .delete(table)
                .where(
                    and(
                        eq(table.id, input.id),
                        eq(table.organizationId, input.organizationId),
                        eq(table.knowledgeModelId, input.knowledgeModelId),
                        eq(table.userId, input.userId),
                        sql`${table.expiresAt} > now()`,
                    ),
                )
                .returning();
            if (!session?.refreshTokenEncrypted) throw new Error('Google authorization expired. Start again.');
            if (input.connectorId) {
                const [connector] = await tx
                    .update(knowledgeConnectors)
                    .set({
                        driveRefreshTokenEncrypted: session.refreshTokenEncrypted,
                        displayName: input.name,
                        configRevision: sql`${knowledgeConnectors.configRevision} + 1`,
                        status: 'pending',
                        lastError: null,
                    })
                    .where(
                        and(
                            eq(knowledgeConnectors.id, input.connectorId),
                            eq(knowledgeConnectors.organizationId, input.organizationId),
                            eq(knowledgeConnectors.knowledgeModelId, input.knowledgeModelId),
                            eq(knowledgeConnectors.provider, 'drive'),
                            eq(knowledgeConnectors.driveFolderId, input.folderId),
                        ),
                    )
                    .returning({ id: knowledgeConnectors.id });
                if (!connector) throw new Error('The original Drive folder must be accessible to reconnect.');
                await tx
                    .update(knowledgeConnectorSyncJobs)
                    .set({ status: 'failed', leaseToken: null, error: 'Google authorization changed.' })
                    .where(and(eq(knowledgeConnectorSyncJobs.connectorId, connector.id), inArray(knowledgeConnectorSyncJobs.status, ['queued', 'running'])));
                await tx.insert(knowledgeConnectorSyncJobs).values({ connectorId: connector.id });
                return connector;
            }
            const [connector] = await tx
                .insert(knowledgeConnectors)
                .values({
                    provider: 'drive',
                    nextSyncAt: new Date(Date.now() + LINEAR_SYNC_INTERVAL_MS),
                    driveFolderId: input.folderId,
                    displayName: input.name,
                    driveRefreshTokenEncrypted: session.refreshTokenEncrypted,
                    knowledgeModelId: input.knowledgeModelId,
                    organizationId: input.organizationId,
                    createdBy: input.userId,
                })
                .returning({ id: knowledgeConnectors.id });
            await tx.insert(knowledgeConnectorSyncJobs).values({ connectorId: connector.id });
            return connector;
        });
    }

    async listConnectors(input: { organizationId: string; knowledgeModelId: string }) {
        await this.getModel(input);
        const { driveRefreshTokenEncrypted: _token, syncedFolders: _folders, ...columns } = getTableColumns(knowledgeConnectors);
        const rows = await this.db
            .select(columns)
            .from(knowledgeConnectors)
            .where(and(eq(knowledgeConnectors.organizationId, input.organizationId), eq(knowledgeConnectors.knowledgeModelId, input.knowledgeModelId)))
            .orderBy(desc(knowledgeConnectors.updatedAt));
        const linearIds = rows.filter(row => row.provider === 'linear').map(row => row.id);
        if (!linearIds.length) return rows;
        const projects = await this.db
            .selectDistinct({ connectorId: knowledgeConnectorItems.connectorId, id: knowledgeConnectorItems.projectId, name: knowledgeConnectorItems.projectName })
            .from(knowledgeConnectorItems)
            .where(inArray(knowledgeConnectorItems.connectorId, linearIds));
        const labels = new Map(projects.map(project => [project.connectorId + '/' + project.id, project.name]));
        return rows.map(row => (row.provider === 'linear' ? { ...row, projectNames: row.projectIds.map(id => labels.get(row.id + '/' + id) ?? id) } : row));
    }

    async getConnector(input: { organizationId: string; connectorId: string }) {
        const [connector] = await this.db
            .select()
            .from(knowledgeConnectors)
            .where(and(eq(knowledgeConnectors.organizationId, input.organizationId), eq(knowledgeConnectors.id, input.connectorId)))
            .limit(1);
        if (!connector) throw new Error('Knowledge connector not found.');
        return connector;
    }

    async getConnectorById(connectorId: string) {
        const [connector] = await this.db.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, connectorId)).limit(1);
        if (!connector) throw new Error('Knowledge connector not found.');
        return connector;
    }

    async createConnector(input: {
        organizationId: string;
        knowledgeModelId: string;
        installationId: string;
        repositoryId: string;
        repositoryFullName: string;
        defaultBranch: string;
        rootPath: string;
        createdBy: string;
    }) {
        await this.getModel(input);
        const [connector] = await this.db
            .insert(knowledgeConnectors)
            .values({ ...input, provider: 'github', rootPath: input.rootPath.replace(/^\/+|\/+$/g, '') })
            .returning();
        return connector!;
    }

    async deleteConnector(input: { organizationId: string; connectorId: string }) {
        const connector = await this.getConnector(input);
        await this.db.transaction(async tx => {
            const [locked] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, connector.id)).for('update');
            if (!locked) return;
            await tx.select({ id: knowledgeModels.id }).from(knowledgeModels).where(eq(knowledgeModels.id, connector.knowledgeModelId)).for('update');
            const items = await tx
                .select({ sourceId: knowledgeConnectorItems.knowledgeSourceId })
                .from(knowledgeConnectorItems)
                .where(eq(knowledgeConnectorItems.connectorId, connector.id));
            await tx.delete(knowledgeConnectors).where(eq(knowledgeConnectors.id, connector.id));
            if (items.length)
                await tx.delete(knowledgeSources).where(
                    inArray(
                        knowledgeSources.id,
                        items.map(item => item.sourceId),
                    ),
                );
        });
        await this.touchModel(connector.knowledgeModelId);
    }

    async createLinearConnector(input: { organizationId: string; knowledgeModelId: string; credentialId: string; projectIds: string[]; createdBy: string }) {
        await this.getModel(input);
        return this.db.transaction(async tx => {
            const [credential] = await tx
                .select()
                .from(knowledgeLinearCredentials)
                .where(and(eq(knowledgeLinearCredentials.id, input.credentialId), eq(knowledgeLinearCredentials.organizationId, input.organizationId)))
                .for('update');
            if (!credential || credential.status !== 'active') throw new Error('Update the Linear API Key before syncing.');
            const [connector] = await tx
                .insert(knowledgeConnectors)
                .values({
                    ...input,
                    provider: 'linear',
                    linearWorkspaceId: credential.workspaceId,
                    linearWorkspaceName: credential.workspaceName,
                    projectIds: [...new Set(input.projectIds)],
                    nextSyncAt: new Date(),
                })
                .onConflictDoNothing({ target: [knowledgeConnectors.knowledgeModelId, knowledgeConnectors.provider, knowledgeConnectors.linearWorkspaceId] })
                .returning();
            if (!connector) throw new Error('A Linear connector already exists for this workspace. Edit its project selection instead.');
            await tx.insert(knowledgeConnectorSyncJobs).values({ connectorId: connector.id });
            return connector;
        });
    }

    async updateLinearProjects(input: { organizationId: string; connectorId: string; projectIds: string[] }) {
        return this.db.transaction(async tx => {
            const [connector] = await tx
                .select()
                .from(knowledgeConnectors)
                .where(and(eq(knowledgeConnectors.id, input.connectorId), eq(knowledgeConnectors.organizationId, input.organizationId)))
                .for('update');
            if (!connector || connector.provider !== 'linear') throw new Error('Linear connector not found.');
            const [updated] = await tx
                .update(knowledgeConnectors)
                .set({
                    projectIds: [...new Set(input.projectIds)],
                    nextSyncAt: new Date(),
                    configRevision: connector.configRevision + 1,
                    status: connector.status === 'disabled' ? 'disabled' : 'pending',
                })
                .where(eq(knowledgeConnectors.id, connector.id))
                .returning();
            await tx
                .update(knowledgeConnectorSyncJobs)
                .set({ status: 'failed', leaseToken: null, error: 'Project selection changed.' })
                .where(and(eq(knowledgeConnectorSyncJobs.connectorId, connector.id), inArray(knowledgeConnectorSyncJobs.status, ['running', 'queued'])));
            if (updated.status !== 'disabled') await tx.insert(knowledgeConnectorSyncJobs).values({ connectorId: connector.id });
            return updated;
        });
    }

    async queueConnectorSync(input: { connectorId: string; targetSha?: string | null }) {
        return this.db.transaction(async tx => {
            const [connector] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, input.connectorId)).for('update');
            if (!connector || connector.status === 'disabled') throw new Error('Knowledge connector is unavailable.');
            const [existing] = await tx
                .select()
                .from(knowledgeConnectorSyncJobs)
                .where(and(eq(knowledgeConnectorSyncJobs.connectorId, input.connectorId), eq(knowledgeConnectorSyncJobs.status, 'queued')))
                .limit(1);
            if (existing) {
                if (input.targetSha) await tx.update(knowledgeConnectorSyncJobs).set({ targetSha: input.targetSha }).where(eq(knowledgeConnectorSyncJobs.id, existing.id));
                return existing;
            }
            const [job] = await tx
                .insert(knowledgeConnectorSyncJobs)
                .values({ connectorId: input.connectorId, targetSha: input.targetSha ?? null })
                .returning();
            return job;
        });
    }

    async recoverConnectorSyncJobs() {
        const staleBefore = new Date(Date.now() - 5 * 60_000);
        const stale = await this.db
            .select({ connectorId: knowledgeConnectorSyncJobs.connectorId })
            .from(knowledgeConnectorSyncJobs)
            .where(and(eq(knowledgeConnectorSyncJobs.status, 'running'), lt(knowledgeConnectorSyncJobs.updatedAt, staleBefore)));
        for (const connectorId of new Set(stale.map(job => job.connectorId)))
            await this.db.transaction(async tx => {
                const [connector] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, connectorId)).for('update');
                if (!connector) return;
                const recovered = await tx
                    .update(knowledgeConnectorSyncJobs)
                    .set({ status: connector.status === 'disabled' ? 'failed' : 'queued', leaseToken: null, availableAt: new Date() })
                    .where(
                        and(
                            eq(knowledgeConnectorSyncJobs.connectorId, connectorId),
                            eq(knowledgeConnectorSyncJobs.status, 'running'),
                            lt(knowledgeConnectorSyncJobs.updatedAt, staleBefore),
                        ),
                    )
                    .returning();
                const [active] = await tx
                    .select({ id: knowledgeConnectorSyncJobs.id })
                    .from(knowledgeConnectorSyncJobs)
                    .where(and(eq(knowledgeConnectorSyncJobs.connectorId, connectorId), eq(knowledgeConnectorSyncJobs.status, 'running')))
                    .limit(1);
                if (recovered.length && !active && connector.status === 'syncing')
                    await tx.update(knowledgeConnectors).set({ status: 'pending' }).where(eq(knowledgeConnectors.id, connectorId));
            });
    }

    async queueDueConnectors(provider: 'linear' | 'drive') {
        const due = await this.db
            .select({ id: knowledgeConnectors.id })
            .from(knowledgeConnectors)
            .where(and(eq(knowledgeConnectors.provider, provider), ne(knowledgeConnectors.status, 'disabled'), lte(knowledgeConnectors.nextSyncAt, new Date())));
        for (const connector of due)
            await this.db.transaction(async tx => {
                const [claimed] = await tx
                    .select()
                    .from(knowledgeConnectors)
                    .where(and(eq(knowledgeConnectors.id, connector.id), lte(knowledgeConnectors.nextSyncAt, new Date()), ne(knowledgeConnectors.status, 'disabled')))
                    .for('update');
                if (!claimed) return;
                const [existing] = await tx
                    .select({ id: knowledgeConnectorSyncJobs.id })
                    .from(knowledgeConnectorSyncJobs)
                    .where(and(eq(knowledgeConnectorSyncJobs.connectorId, connector.id), eq(knowledgeConnectorSyncJobs.status, 'queued')))
                    .limit(1);
                if (!existing) await tx.insert(knowledgeConnectorSyncJobs).values({ connectorId: connector.id });
                await tx
                    .update(knowledgeConnectors)
                    .set({ nextSyncAt: new Date(Date.now() + LINEAR_SYNC_INTERVAL_MS) })
                    .where(eq(knowledgeConnectors.id, connector.id));
            });
    }

    async claimConnectorSyncJob() {
        // Scan candidates so a busy connector cannot block unrelated work.
        const candidates = await this.db
            .select({ job: knowledgeConnectorSyncJobs })
            .from(knowledgeConnectorSyncJobs)
            .innerJoin(knowledgeConnectors, eq(knowledgeConnectors.id, knowledgeConnectorSyncJobs.connectorId))
            .where(
                and(
                    eq(knowledgeConnectorSyncJobs.status, 'queued'),
                    lte(knowledgeConnectorSyncJobs.availableAt, new Date()),
                    ne(knowledgeConnectors.status, 'disabled'),
                    ne(knowledgeConnectors.status, 'syncing'),
                ),
            )
            .orderBy(asc(knowledgeConnectorSyncJobs.createdAt))
            .limit(20);
        for (const { job } of candidates) {
            const claimed = await this.db.transaction(async tx => {
                const [connector] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, job.connectorId)).for('update');
                if (!connector || connector.status === 'disabled' || connector.status === 'syncing') return null;
                const [current] = await tx
                    .select()
                    .from(knowledgeConnectorSyncJobs)
                    .where(and(eq(knowledgeConnectorSyncJobs.id, job.id), eq(knowledgeConnectorSyncJobs.status, 'queued')));
                if (!current) return null;
                if (current.attempts >= 5) {
                    await tx
                        .update(knowledgeConnectorSyncJobs)
                        .set({ status: 'failed', error: 'Synchronization exhausted five attempts.' })
                        .where(eq(knowledgeConnectorSyncJobs.id, job.id));
                    await tx
                        .update(knowledgeConnectors)
                        .set({ status: 'error', lastError: 'Synchronization exhausted five attempts.' })
                        .where(eq(knowledgeConnectors.id, connector.id));
                    return null;
                }
                const [result] = await tx
                    .update(knowledgeConnectorSyncJobs)
                    .set({ status: 'running', attempts: current.attempts + 1, leaseToken: newEntityId(), updatedAt: new Date() })
                    .where(eq(knowledgeConnectorSyncJobs.id, job.id))
                    .returning();
                await tx.update(knowledgeConnectors).set({ status: 'syncing', lastError: null, updatedAt: new Date() }).where(eq(knowledgeConnectors.id, connector.id));
                return { ...result, configRevision: connector.configRevision };
            });
            if (claimed) return claimed;
        }
        return null;
    }

    async heartbeatConnectorSyncJob(jobId: string, connectorId: string, leaseToken: string) {
        await this.db.transaction(async tx => {
            // The connector lock fences recovery against a heartbeat.
            await tx.select({ id: knowledgeConnectors.id }).from(knowledgeConnectors).where(eq(knowledgeConnectors.id, connectorId)).for('update');
            const [job] = await tx
                .update(knowledgeConnectorSyncJobs)
                .set({ updatedAt: new Date() })
                .where(and(eq(knowledgeConnectorSyncJobs.id, jobId), eq(knowledgeConnectorSyncJobs.leaseToken, leaseToken), eq(knowledgeConnectorSyncJobs.status, 'running')))
                .returning();
            if (job) await tx.update(knowledgeConnectors).set({ updatedAt: new Date() }).where(eq(knowledgeConnectors.id, connectorId));
        });
    }

    async finishConnectorSyncJob(input: { jobId: string; connectorId: string; leaseToken?: string; error?: string | null; retryAt?: Date; authorizationRevoked?: boolean }) {
        await this.db.transaction(async tx => {
            const [connector] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, input.connectorId)).for('update');
            if (!connector) return;
            if (input.retryAt) {
                const [owned] = await tx
                    .select({ id: knowledgeConnectorSyncJobs.id })
                    .from(knowledgeConnectorSyncJobs)
                    .where(
                        and(
                            eq(knowledgeConnectorSyncJobs.id, input.jobId),
                            eq(knowledgeConnectorSyncJobs.status, 'running'),
                            input.leaseToken ? eq(knowledgeConnectorSyncJobs.leaseToken, input.leaseToken) : undefined,
                        ),
                    );
                if (!owned) return;
                await tx
                    .update(knowledgeConnectorSyncJobs)
                    .set({ status: 'failed', error: 'Coalesced into the pending retry.' })
                    .where(and(eq(knowledgeConnectorSyncJobs.connectorId, connector.id), eq(knowledgeConnectorSyncJobs.status, 'queued')));
            }
            const [job] = await tx
                .update(knowledgeConnectorSyncJobs)
                .set({
                    status: input.retryAt ? 'queued' : input.error ? 'failed' : 'completed',
                    error: input.error ?? null,
                    availableAt: input.retryAt ?? new Date(),
                    leaseToken: null,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(knowledgeConnectorSyncJobs.id, input.jobId),
                        eq(knowledgeConnectorSyncJobs.status, 'running'),
                        input.leaseToken ? eq(knowledgeConnectorSyncJobs.leaseToken, input.leaseToken) : undefined,
                    ),
                )
                .returning();
            if (job && input.error && connector.status !== 'disabled')
                await tx
                    .update(knowledgeConnectors)
                    .set({ status: input.authorizationRevoked ? 'disabled' : input.retryAt ? 'pending' : 'error', lastError: input.error.slice(0, 2000) })
                    .where(eq(knowledgeConnectors.id, connector.id));
        });
    }

    async applyConnectorSnapshot(
        input: KnowledgeConnectorSnapshot & {
            connectorId: string;
            configRevision?: number;
            jobId?: string;
            leaseToken?: string;
            newLocal?: { organizationId: string; knowledgeModelId: string; displayName: string; createdBy: string };
        },
    ) {
        const validated = input.files.map(file => ({
            ...file,
            value: validateKnowledgeSource(
                file.format ? `source.${file.format === 'markdown' ? 'md' : file.format === 'text' ? 'txt' : 'yaml'}` : (file.path.split('/').pop() ?? file.path),
                file.contentText,
            ),
        }));
        if (new Set(input.files.map(file => file.path)).size !== input.files.length) throw new Error('Duplicate remote knowledge item.');
        await this.db.transaction(async tx => {
            if (input.newLocal) await tx.insert(knowledgeConnectors).values({ ...input.newLocal, id: input.connectorId, provider: 'local' });
            const [connector] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, input.connectorId)).for('update');
            if (!connector || connector.status === 'disabled') throw new Error('Knowledge connector is unavailable.');
            await tx.select({ id: knowledgeModels.id }).from(knowledgeModels).where(eq(knowledgeModels.id, connector.knowledgeModelId)).for('update');
            if (input.configRevision !== undefined && connector.configRevision !== input.configRevision) throw new Error('Connector selection changed during synchronization.');
            if (input.jobId && input.leaseToken) {
                const [job] = await tx
                    .select()
                    .from(knowledgeConnectorSyncJobs)
                    .where(
                        and(
                            eq(knowledgeConnectorSyncJobs.id, input.jobId),
                            eq(knowledgeConnectorSyncJobs.leaseToken, input.leaseToken),
                            eq(knowledgeConnectorSyncJobs.status, 'running'),
                        ),
                    );
                if (!job) throw new Error('Synchronization lease expired.');
            }
            const existing = await tx.select().from(knowledgeConnectorItems).where(eq(knowledgeConnectorItems.connectorId, connector.id));
            const byPath = new Map(existing.map(item => [item.remotePath, item]));
            for (const file of validated) {
                const baseName = file.title ?? `${connector.repositoryFullName} · ${file.path.replaceAll('/', ' › ')}`;
                const suffix = ` · ${connector.id.slice(-8)} · ${file.path.split('/').pop()}`;
                const fileName =
                    connector.provider === 'drive' || connector.provider === 'local'
                        ? `managed · ${connector.id} · ${createHash('sha256').update(file.path).digest('hex')}`
                        : file.title
                          ? `${baseName.slice(0, Math.max(20, 240 - suffix.length))}${suffix}`
                          : `${baseName.slice(0, 240 - ` · ${connector.id.slice(-8)}`.length)} · ${connector.id.slice(-8)}`;
                const item = byPath.get(file.path);
                if (item) {
                    if (item.remoteSha !== file.sha) {
                        await tx
                            .update(knowledgeSources)
                            .set({ contentText: file.value.contentText, byteSize: file.value.byteSize, format: file.value.format, fileName })
                            .where(eq(knowledgeSources.id, item.knowledgeSourceId));
                    }
                    if (
                        item.remoteSha !== file.sha ||
                        item.sourceUrl !== (file.sourceUrl ?? null) ||
                        item.remoteTitle !== (file.title ?? null) ||
                        JSON.stringify(item.folderTrail) !== JSON.stringify(file.folderTrail ?? null) ||
                        item.projectId !== (file.projectId ?? null) ||
                        item.projectName !== (file.projectName ?? null)
                    )
                        await tx
                            .update(knowledgeConnectorItems)
                            .set({
                                remoteTitle: file.title ?? null,
                                folderTrail: file.folderTrail ?? null,
                                projectId: file.projectId ?? null,
                                projectName: file.projectName ?? null,
                                remoteSha: file.sha,
                                sourceUrl: file.sourceUrl ?? null,
                                updatedAt: new Date(),
                            })
                            .where(and(eq(knowledgeConnectorItems.connectorId, connector.id), eq(knowledgeConnectorItems.remotePath, file.path)));
                    byPath.delete(file.path);
                    continue;
                }
                const [source] = await tx
                    .insert(knowledgeSources)
                    .values({
                        organizationId: connector.organizationId,
                        knowledgeModelId: connector.knowledgeModelId,
                        fileName,
                        format: file.value.format,
                        contentText: file.value.contentText,
                        byteSize: file.value.byteSize,
                        createdBy: connector.createdBy,
                    })
                    .returning();
                await tx.insert(knowledgeConnectorItems).values({
                    connectorId: connector.id,
                    knowledgeSourceId: source.id,
                    remotePath: file.path,
                    remoteTitle: file.title ?? null,
                    folderTrail: file.folderTrail ?? null,
                    projectId: file.projectId ?? null,
                    projectName: file.projectName ?? null,
                    remoteSha: file.sha,
                    sourceUrl: file.sourceUrl ?? null,
                });
            }
            const removed = [...byPath.values()].map(item => item.knowledgeSourceId);
            if (removed.length) await tx.delete(knowledgeSources).where(inArray(knowledgeSources.id, removed));
            await tx
                .update(knowledgeConnectors)
                .set({
                    status: 'ready',
                    ...(input.folders ? { syncedFolders: input.folders } : {}),
                    ...(input.rootName ? { displayName: input.rootName } : {}),
                    lastCommitSha: input.commitSha ?? null,
                    ...(connector.provider === 'local' ? { configRevision: connector.configRevision + 1 } : {}),
                    ...(connector.provider === 'linear' || connector.provider === 'drive' ? { nextSyncAt: new Date(Date.now() + LINEAR_SYNC_INTERVAL_MS) } : {}),
                    lastSyncedAt: new Date(),
                    lastError: null,
                    updatedAt: new Date(),
                })
                .where(eq(knowledgeConnectors.id, connector.id));
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, connector.knowledgeModelId));
        });
    }

    async findConnectorsByGitHubRepository(input: { installationId: string; repositoryId?: string }) {
        const conditions = [eq(knowledgeConnectors.installationId, input.installationId), eq(knowledgeConnectors.provider, 'github' as const)];
        if (input.repositoryId) conditions.push(eq(knowledgeConnectors.repositoryId, input.repositoryId));
        return this.db
            .select()
            .from(knowledgeConnectors)
            .where(and(...conditions));
    }

    async disableConnectors(input: { installationId: string; repositoryIds?: string[] }) {
        const conditions = [eq(knowledgeConnectors.provider, 'github'), eq(knowledgeConnectors.installationId, input.installationId)];
        if (input.repositoryIds?.length) conditions.push(inArray(knowledgeConnectors.repositoryId, input.repositoryIds));
        await this.db
            .update(knowledgeConnectors)
            .set({ status: 'disabled', lastError: 'GitHub App access was removed.' })
            .where(and(...conditions));
    }

    async listVerifiedQueries(input: { organizationId: string; knowledgeModelId: string; query?: string | null; connectionId?: string | null }) {
        await this.getModel(input);
        const conditions = [eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId)];
        if (input.connectionId) conditions.push(eq(knowledgeVerifiedQueries.sourceConnectionId, input.connectionId));
        if (input.query?.trim())
            conditions.push(
                or(
                    ilike(knowledgeVerifiedQueries.title, `%${input.query.trim()}%`),
                    ilike(knowledgeVerifiedQueries.question, `%${input.query.trim()}%`),
                    ilike(knowledgeVerifiedQueries.description, `%${input.query.trim()}%`),
                )!,
            );
        return this.db
            .select({ ...getTableColumns(knowledgeVerifiedQueries), updatedByName: user.name })
            .from(knowledgeVerifiedQueries)
            .leftJoin(user, eq(user.id, sql`COALESCE(${knowledgeVerifiedQueries.updatedBy}, ${knowledgeVerifiedQueries.createdBy})`))
            .where(and(...conditions))
            .orderBy(desc(knowledgeVerifiedQueries.updatedAt));
    }

    async createVerifiedQuery(input: {
        organizationId: string;
        knowledgeModelId: string;
        sourceConnectionId: string;
        title: string;
        question: string;
        sql: string;
        description?: string | null;
        knowledgeSourceIds?: string[];
        sourceType?: string | null;
        sourceId?: string | null;
        createdBy?: string | null;
    }) {
        const model = await this.getModel(input);
        if (!model.dataSources.some(source => source.connectionId === input.sourceConnectionId)) throw new Error('This data source is not linked to the selected knowledge base.');
        const queryId = await this.db.transaction(async tx => {
            await lockDirectory(tx, input);
            const [row] = await tx
                .insert(knowledgeVerifiedQueries)
                .values({
                    knowledgeModelId: input.knowledgeModelId,
                    sourceConnectionId: input.sourceConnectionId,
                    title: input.title.trim(),
                    question: input.question.trim(),
                    sql: input.sql.trim(),
                    description: input.description?.trim() || null,
                    sourceType: input.sourceType?.trim() || 'manual',
                    sourceId: input.sourceId?.trim() || null,
                    createdBy: input.createdBy ?? null,
                    updatedBy: input.createdBy ?? null,
                })
                .returning();
            await this.writeQuerySources(tx, { ...input, queryId: row!.id, sourceIds: input.knowledgeSourceIds ?? [] });
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, input.knowledgeModelId));
            return row!.id;
        });
        return this.getVerifiedQuery({ organizationId: input.organizationId, knowledgeModelId: input.knowledgeModelId, id: queryId });
    }

    async updateVerifiedQuery(input: {
        organizationId: string;
        knowledgeModelId: string;
        id: string;
        title: string;
        question: string;
        sql: string;
        description?: string | null;
        knowledgeSourceIds?: string[];
        updatedBy?: string | null;
    }) {
        await this.db.transaction(async tx => {
            await lockDirectory(tx, input);
            const [row] = await tx
                .update(knowledgeVerifiedQueries)
                .set({
                    title: input.title.trim(),
                    question: input.question.trim(),
                    sql: input.sql.trim(),
                    description: input.description === undefined ? undefined : input.description?.trim() || null,
                    updatedBy: input.updatedBy ?? null,
                })
                .where(and(eq(knowledgeVerifiedQueries.id, input.id), eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId)))
                .returning();
            if (!row) throw new Error('Verified query not found.');
            if (input.knowledgeSourceIds) await this.writeQuerySources(tx, { ...input, queryId: input.id, sourceIds: input.knowledgeSourceIds, createdBy: input.updatedBy });
            await tx.update(knowledgeModels).set({ updatedAt: new Date() }).where(eq(knowledgeModels.id, input.knowledgeModelId));
        });
        return this.getVerifiedQuery(input);
    }

    async getVerifiedQuery(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        await this.getModel(input);
        const [row] = await this.db
            .select({ ...getTableColumns(knowledgeVerifiedQueries), updatedByName: user.name })
            .from(knowledgeVerifiedQueries)
            .leftJoin(user, eq(user.id, sql`COALESCE(${knowledgeVerifiedQueries.updatedBy}, ${knowledgeVerifiedQueries.createdBy})`))
            .where(and(eq(knowledgeVerifiedQueries.id, input.id), eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId)))
            .limit(1);
        if (!row) throw new Error('Verified query not found.');
        return row;
    }

    async deleteVerifiedQuery(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        await this.getModel(input);
        await this.db.delete(knowledgeVerifiedQueries).where(and(eq(knowledgeVerifiedQueries.id, input.id), eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId)));
        await this.touchModel(input.knowledgeModelId);
    }
}
