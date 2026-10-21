import { getClient } from '@dory/database/postgres/client';
import {
    connections,
    knowledgeAssetSources,
    knowledgeConnectorItems,
    knowledgeConnectors,
    knowledgeConnectorSyncJobs,
    knowledgeLinearCredentials,
    knowledgeMetricRules,
    knowledgeModels,
    knowledgeModelSources,
    knowledgeSources,
    knowledgeVerifiedQueries,
    OSSIE_VERSION,
    user,
    type KnowledgeAssetType,
    type KnowledgeDefinition,
    type KnowledgeModelDocument,
    type KnowledgeSourceFormat,
    type KnowledgeSourceRelationType,
    type OssieDocument,
} from '@dory/database/postgres/schemas';
import type { PostgresDBClient } from '@dory/shared';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import { OSSIE_DATA_TYPES, OSSIE_DIALECTS } from '@dory/shared/types/ossie';
import { and, asc, desc, eq, getTableColumns, ilike, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { parseDocument } from 'yaml';

import { enqueueSourceExtraction, invalidateSourceEvidence, KnowledgeExtractionStore } from './extraction';
import { LinearKnowledgeStore } from './linear';
import { migrateLegacyOssieModels } from './migrate-ossie';
import {
    applyKnowledgeDefinitions,
    createOssieDocument,
    markOssieDefinitionsUnverified,
    ossieBusinessContext,
    ossieRevision,
    parseOssieYaml,
    projectOssieDocument,
    serializeOssieDocument,
    updateOssieMetadata,
    validateOssieDocument,
} from './ossie';

export { ossieRevision, parseOssieYaml, serializeOssieDocument, validateOssieDocument } from './ossie';
export { knowledgeHash } from './extraction';

export const KNOWLEDGE_SOURCE_MAX_BYTES = 10_000_000;
export const LINEAR_SYNC_INTERVAL_MS = 3600_000;

// Keep the GitHub snapshot wire names while treating paths as provider-stable IDs
// and SHAs as opaque content fingerprints for every provider.
export type KnowledgeConnectorSnapshot = {
    commitSha?: string;
    files: Array<{ path: string; sha: string; contentText: string; format?: KnowledgeSourceFormat; title?: string; sourceUrl?: string }>;
};
export type KnowledgeModelDataSourceDetail = { connectionId: string; name: string; type: string; engine: string };
export type KnowledgeModelDetail = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    businessContextMd: string;
    modelYaml: string;
    model: KnowledgeModelDocument;
    ossieVersion: typeof OSSIE_VERSION;
    modelRevision: string;
    ossieDocument: OssieDocument;
    dataSources: KnowledgeModelDataSourceDetail[];
    verifiedQueryCount: number;
    knowledgeSourceCount: number;
    readiness: KnowledgeReadiness;
    agentUnderstands: Array<{ id: string; name: string; kind: KnowledgeDefinition['kind'] }>;
    createdAt: Date;
    updatedAt: Date;
};

export type KnowledgeReadiness = {
    status: 'ready' | 'not_ready';
    requirements: { dataSource: boolean; verifiedDefinition: boolean };
};

export type KnowledgeGraph = {
    metricRuleEdges: Array<{ metricId: string; ruleId: string }>;
    queryDefinitionEdges: Array<{ queryId: string; definitionId: string }>;
    sourceAssetEdges: Array<{
        sourceId: string;
        assetType: KnowledgeAssetType;
        assetId: string;
        relationType: KnowledgeSourceRelationType;
    }>;
};

export type KnowledgeSourceVerifiedQueryImport = {
    id?: string;
    sourceConnectionId?: string;
    title: string;
    question: string;
    sql: string;
    description?: string;
    definitionIds: string[];
};

export function getKnowledgeReadiness(definitions: KnowledgeDefinition[], dataSourceCount: number): KnowledgeReadiness {
    const requirements = {
        dataSource: dataSourceCount > 0,
        verifiedDefinition: definitions.some(definition => definition.status === 'verified' && definition.kind !== 'relationship'),
    };
    return {
        status: requirements.dataSource && requirements.verifiedDefinition ? 'ready' : 'not_ready',
        requirements,
    };
}

export function validateKnowledgeSource(fileName: string, contentText: string) {
    const normalizedName = fileName.trim();
    if (!normalizedName || normalizedName.includes('/') || normalizedName.includes('\\') || normalizedName.includes('\0')) throw new Error('Enter a valid file name.');
    const extension = normalizedName.split('.').pop()?.toLowerCase();
    const format: KnowledgeSourceFormat | undefined =
        extension === 'md' || extension === 'markdown' ? 'markdown' : extension === 'yaml' || extension === 'yml' ? 'yaml' : extension === 'txt' ? 'text' : undefined;
    if (!format) throw new Error('Only Markdown, YAML, and TXT files are supported.');
    const byteSize = Buffer.byteLength(contentText, 'utf8');
    if (byteSize > KNOWLEDGE_SOURCE_MAX_BYTES) throw new Error('Knowledge source files must be 10 MB or smaller.');
    if (format === 'yaml') {
        const document = parseDocument(contentText);
        if (document.errors.length) throw new Error(document.errors[0]?.message ?? 'Invalid YAML.');
    }
    return { fileName: normalizedName, format, contentText, byteSize };
}

function normalizeDefinition(value: unknown): KnowledgeDefinition {
    const input = value as Record<string, unknown>;
    const kind = String(input.kind ?? '');
    if (!['entity', 'metric', 'measure', 'dimension', 'relationship'].includes(kind)) throw new Error('Unsupported knowledge definition type.');
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const sourceConnectionId = typeof input.sourceConnectionId === 'string' ? input.sourceConnectionId.trim() : '';
    if (!name) throw new Error('A knowledge definition name is required.');
    if (!sourceConnectionId) throw new Error(`A data source is required for "${name}".`);
    const list = (key: string) =>
        Array.isArray(input[key]) ? input[key].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : undefined;
    const optional = (key: string) => (typeof input[key] === 'string' && input[key].trim() ? input[key].trim() : undefined);
    if (input.datatype !== undefined && !OSSIE_DATA_TYPES.some(value => value === input.datatype)) throw new Error('Unsupported Ossie data type.');
    if (input.dialect !== undefined && !OSSIE_DIALECTS.some(value => value === input.dialect)) throw new Error('Unsupported Ossie dialect.');
    return {
        id: optional('id') ?? `${kind}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name,
        kind: kind as KnowledgeDefinition['kind'],
        status: input.status === 'unverified' ? 'unverified' : 'verified',
        sourceConnectionId,
        ...(optional('description') ? { description: optional('description') } : {}),
        ...(list('aliases') ? { aliases: list('aliases') } : {}),
        ...(optional('source') ? { source: optional('source') } : {}),
        ...(optional('expression') ? { expression: optional('expression') } : {}),
        ...(list('filters') ? { filters: list('filters') } : {}),
        ...(optional('timeDimension') ? { timeDimension: optional('timeDimension') } : {}),
        ...(list('dimensions') ? { dimensions: list('dimensions') } : {}),
        ...(optional('from') ? { from: optional('from') } : {}),
        ...(optional('to') ? { to: optional('to') } : {}),
        ...(list('fromColumns') ? { fromColumns: list('fromColumns') } : {}),
        ...(list('toColumns') ? { toColumns: list('toColumns') } : {}),
        ...(input.aiContext ? { aiContext: input.aiContext as KnowledgeDefinition['aiContext'] } : {}),
        ...(optional('dialect') ? { dialect: optional('dialect') as KnowledgeDefinition['dialect'] } : {}),
        ...(optional('datatype') ? { datatype: optional('datatype') as KnowledgeDefinition['datatype'] } : {}),
    };
}

export function validateKnowledgeModelDocument(value: unknown, sourceIds?: ReadonlySet<string>): KnowledgeModelDocument {
    const raw = value as { definitions?: unknown };
    const definitions = Array.isArray(raw?.definitions) ? raw.definitions.map(normalizeDefinition) : [];
    const ids = new Set<string>();
    for (const definition of definitions) {
        if (ids.has(definition.id)) throw new Error(`Duplicate knowledge definition: ${definition.id}`);
        if (sourceIds && !sourceIds.has(definition.sourceConnectionId)) throw new Error(`Data source for "${definition.name}" is not linked to this knowledge model.`);
        if (definition.filters?.some(filter => /;|--|\/\*/.test(filter))) throw new Error(`Filter for "${definition.name}" must be a single expression without comments.`);
        ids.add(definition.id);
    }
    const references = new Map(
        definitions.flatMap(
            definition =>
                [
                    [definition.id, definition],
                    [definition.name, definition],
                ] as const,
        ),
    );
    for (const definition of definitions) {
        if (definition.kind !== 'relationship') continue;
        if (!definition.from || !definition.to || !definition.fromColumns?.length || !definition.toColumns?.length) {
            throw new Error(`Relationship "${definition.name}" requires datasets and column mappings.`);
        }
        if (definition.fromColumns.length !== definition.toColumns.length) throw new Error(`Relationship "${definition.name}" must have matching column mappings.`);
        const from = references.get(definition.from);
        const to = references.get(definition.to);
        const fromEntity = from ?? definitions.find(item => item.kind === 'entity' && item.name === definition.from);
        const toEntity = to ?? definitions.find(item => item.kind === 'entity' && item.name === definition.to);
        if (!fromEntity || !toEntity) throw new Error(`Relationship "${definition.name}" references an unknown dataset.`);
        if (fromEntity.sourceConnectionId !== definition.sourceConnectionId || toEntity.sourceConnectionId !== definition.sourceConnectionId) {
            throw new Error(`Relationship "${definition.name}" cannot cross data sources.`);
        }
    }
    return { definitions };
}

export function serializeKnowledgeModel(model: KnowledgeModelDocument) {
    const first = model.definitions.find(item => item.kind === 'entity') ?? model.definitions[0];
    if (!first) throw new Error(`Apache Ossie ${OSSIE_VERSION} requires at least one dataset.`);
    return serializeOssieDocument(applyKnowledgeDefinitions(createOssieDocument('knowledge_model', null, first.sourceConnectionId), model.definitions));
}

export function parseKnowledgeYaml(source: string, fallbackSourceConnectionId?: string, markImportedDefinitionsUnverified = true): KnowledgeModelDocument {
    const parsed = parseOssieYaml(source);
    const document = markImportedDefinitionsUnverified ? markOssieDefinitionsUnverified(parsed, fallbackSourceConnectionId) : parsed;
    return validateKnowledgeModelDocument(projectOssieDocument(document, fallbackSourceConnectionId));
}

export function parseKnowledgeSourceYaml(source: string, fallbackSourceConnectionId?: string) {
    return { definitions: parseKnowledgeYaml(source, fallbackSourceConnectionId).definitions, verifiedQueries: [] as KnowledgeSourceVerifiedQueryImport[] };
}

export class PostgresKnowledgeRepository {
    private db!: PostgresDBClient;

    get linear() {
        return new LinearKnowledgeStore(this.db);
    }

    get extraction() {
        return new KnowledgeExtractionStore(this.db);
    }

    async init(db?: PostgresDBClient) {
        const client = db ?? (await getClient());
        if (!client) throw new DatabaseError('Database connection failed', 500);
        this.db = client as PostgresDBClient;
        await migrateLegacyOssieModels(this.db);
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError('Database connection failed', 500);
    }

    parseYamlForImport(source: string, fallbackSourceConnectionId?: string) {
        return parseKnowledgeSourceYaml(source, fallbackSourceConnectionId);
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
        return this.db
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
            const ossieDocument = validateOssieDocument(row.modelJson);
            const model = validateKnowledgeModelDocument(projectOssieDocument(ossieDocument));
            const modelDataSources = dataSources.filter(source => source.knowledgeModelId === row.id).map(({ knowledgeModelId: _, ...source }) => source);
            const verifiedQueryCount = verified.filter(queryRow => queryRow.knowledgeModelId === row.id).length;
            const verifiedDefinitions = model.definitions.filter(definition => definition.status === 'verified' && definition.kind !== 'relationship');
            return {
                ...row,
                businessContextMd: ossieBusinessContext(ossieDocument),
                modelYaml: serializeOssieDocument(ossieDocument),
                model,
                ossieVersion: OSSIE_VERSION,
                modelRevision: ossieRevision(ossieDocument),
                ossieDocument,
                dataSources: modelDataSources,
                verifiedQueryCount,
                knowledgeSourceCount: sourceRows.filter(source => source.knowledgeModelId === row.id).length,
                readiness: getKnowledgeReadiness(model.definitions, modelDataSources.length),
                agentUnderstands: verifiedDefinitions.slice(0, 5).map(({ id, name, kind }) => ({ id, name, kind })),
            };
        });
    }

    async getModel(input: { organizationId: string; knowledgeModelId: string }) {
        const models = await this.listModels({ organizationId: input.organizationId });
        const found = models.find(item => item.id === input.knowledgeModelId);
        if (!found) throw new Error('Knowledge model not found.');
        return found;
    }

    async createModel(input: { organizationId: string; name: string; description?: string | null; connectionIds: string[] }) {
        const connectionIds = await this.assertConnections(input.organizationId, input.connectionIds);
        const ossieDocument = createOssieDocument(input.name, input.description, connectionIds[0]!);
        const [model] = await this.db
            .insert(knowledgeModels)
            .values({
                organizationId: input.organizationId,
                name: input.name.trim(),
                description: input.description?.trim() || null,
                modelJson: ossieDocument,
                modelYaml: serializeOssieDocument(ossieDocument),
            })
            .returning();
        await this.db.insert(knowledgeModelSources).values(connectionIds.map(connectionId => ({ knowledgeModelId: model!.id, connectionId })));
        return this.getModel({ organizationId: input.organizationId, knowledgeModelId: model!.id });
    }

    async updateModel(input: {
        organizationId: string;
        knowledgeModelId: string;
        name?: string;
        description?: string | null;
        businessContextMd?: string;
        aiContext?: { instructions?: string; synonyms?: string[]; examples?: string[] };
    }) {
        const model = await this.getModel(input);
        const ossieDocument = updateOssieMetadata(model.ossieDocument, input);
        await this.db
            .update(knowledgeModels)
            .set({
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
                ...(input.businessContextMd !== undefined || input.aiContext !== undefined ? { businessContextMd: ossieBusinessContext(ossieDocument) } : {}),
                modelJson: ossieDocument,
                modelYaml: serializeOssieDocument(ossieDocument),
            })
            .where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)));
        return this.getModel(input);
    }

    async deleteModel(input: { organizationId: string; knowledgeModelId: string }) {
        await this.getModel(input);
        await this.db.delete(knowledgeModels).where(and(eq(knowledgeModels.id, input.knowledgeModelId), eq(knowledgeModels.organizationId, input.organizationId)));
    }

    async saveDefinitions(input: { organizationId: string; knowledgeModelId: string; definitions: unknown }) {
        const model = await this.getModel(input);
        const document = validateKnowledgeModelDocument({ definitions: input.definitions }, new Set(model.dataSources.map(source => source.connectionId)));
        const ossieDocument = applyKnowledgeDefinitions(model.ossieDocument, document.definitions);
        await this.db
            .update(knowledgeModels)
            .set({ modelJson: ossieDocument, modelYaml: serializeOssieDocument(ossieDocument), businessContextMd: ossieBusinessContext(ossieDocument) })
            .where(eq(knowledgeModels.id, model.id));
        const remainingMetricIds = document.definitions.filter(d => d.kind === 'metric').map(d => d.id);
        await this.db.delete(knowledgeMetricRules).where(
            and(
                eq(knowledgeMetricRules.knowledgeModelId, model.id),
                remainingMetricIds.length
                    ? sql`${knowledgeMetricRules.metricId} NOT IN (${sql.join(
                          remainingMetricIds.map(id => sql`${id}`),
                          sql`, `,
                      )})`
                    : undefined,
            ),
        );
        const definitionIds = document.definitions.map(definition => definition.id);
        const linkedDefinitions = await this.db
            .select({ sourceId: knowledgeAssetSources.knowledgeSourceId, assetId: knowledgeAssetSources.assetId })
            .from(knowledgeAssetSources)
            .where(and(eq(knowledgeAssetSources.knowledgeModelId, model.id), eq(knowledgeAssetSources.assetType, 'definition')));
        const removedIds = [...new Set(linkedDefinitions.map(link => link.assetId).filter(id => !definitionIds.includes(id)))];
        if (removedIds.length) {
            await this.db
                .delete(knowledgeAssetSources)
                .where(
                    and(
                        eq(knowledgeAssetSources.knowledgeModelId, model.id),
                        eq(knowledgeAssetSources.assetType, 'definition'),
                        inArray(knowledgeAssetSources.assetId, removedIds),
                    ),
                );
        }
        return this.getModel(input);
    }

    async getGraph(input: { organizationId: string; knowledgeModelId: string }): Promise<KnowledgeGraph> {
        await this.getModel(input);
        const [queries, sourceAssetEdges, metricRuleEdges] = await Promise.all([
            this.listVerifiedQueries(input),
            this.db
                .select({
                    sourceId: knowledgeAssetSources.knowledgeSourceId,
                    assetType: knowledgeAssetSources.assetType,
                    assetId: knowledgeAssetSources.assetId,
                    relationType: knowledgeAssetSources.relationType,
                })
                .from(knowledgeAssetSources)
                .where(eq(knowledgeAssetSources.knowledgeModelId, input.knowledgeModelId)),
            this.db
                .select({ metricId: knowledgeMetricRules.metricId, ruleId: knowledgeMetricRules.ruleId })
                .from(knowledgeMetricRules)
                .where(eq(knowledgeMetricRules.knowledgeModelId, input.knowledgeModelId)),
        ]);
        return {
            metricRuleEdges,
            queryDefinitionEdges: queries.flatMap(query => query.definitionIds.map(definitionId => ({ queryId: query.id, definitionId }))),
            sourceAssetEdges,
        };
    }

    async replaceAssetSources(input: {
        organizationId: string;
        knowledgeModelId: string;
        assetType: KnowledgeAssetType;
        assetId: string;
        sourceIds: string[];
        relationType: KnowledgeSourceRelationType;
        createdBy?: string | null;
    }) {
        await this.getModel(input);
        const sourceIds = [...new Set(input.sourceIds)];
        if (sourceIds.length) {
            const sources = await this.db
                .select({ id: knowledgeSources.id })
                .from(knowledgeSources)
                .where(and(eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId), inArray(knowledgeSources.id, sourceIds)));
            if (sources.length !== sourceIds.length) throw new Error('One or more knowledge sources are unavailable.');
        }
        await this.db
            .delete(knowledgeAssetSources)
            .where(
                and(
                    eq(knowledgeAssetSources.knowledgeModelId, input.knowledgeModelId),
                    eq(knowledgeAssetSources.assetType, input.assetType),
                    eq(knowledgeAssetSources.assetId, input.assetId),
                ),
            );
        if (sourceIds.length) {
            await this.db.insert(knowledgeAssetSources).values(
                sourceIds.map(sourceId => ({
                    knowledgeModelId: input.knowledgeModelId,
                    knowledgeSourceId: sourceId,
                    assetType: input.assetType,
                    assetId: input.assetId,
                    relationType: input.relationType,
                    createdBy: input.createdBy ?? null,
                })),
            );
        }
        await this.touchModel(input.knowledgeModelId);
    }

    async importYaml(input: { organizationId: string; knowledgeModelId: string; source: string; fallbackSourceConnectionId?: string; preserveStatus?: boolean }) {
        const model = await this.getModel(input);
        const parsed = parseOssieYaml(input.source);
        const ossieDocument = input.preserveStatus ? parsed : markOssieDefinitionsUnverified(parsed, input.fallbackSourceConnectionId);
        const projected = validateKnowledgeModelDocument(
            projectOssieDocument(ossieDocument, input.fallbackSourceConnectionId),
            new Set(model.dataSources.map(source => source.connectionId)),
        );
        const normalized = applyKnowledgeDefinitions(ossieDocument, projected.definitions);
        await this.db
            .update(knowledgeModels)
            .set({
                name: normalized.name,
                description: normalized.description ?? null,
                businessContextMd: ossieBusinessContext(normalized),
                modelJson: normalized,
                modelYaml: serializeOssieDocument(normalized),
            })
            .where(eq(knowledgeModels.id, model.id));
        const metricIds = projected.definitions.filter(d => d.kind === 'metric').map(d => d.id);
        await this.db.delete(knowledgeMetricRules).where(
            and(
                eq(knowledgeMetricRules.knowledgeModelId, model.id),
                metricIds.length
                    ? sql`${knowledgeMetricRules.metricId} NOT IN (${sql.join(
                          metricIds.map(id => sql`${id}`),
                          sql`, `,
                      )})`
                    : undefined,
            ),
        );
        return this.getModel(input);
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
        if (model.dataSources.length <= 1) throw new Error('A knowledge model must have at least one data source.');
        if (model.model.definitions.some(item => item.sourceConnectionId === input.connectionId))
            throw new Error('Remove or reassign definitions that use this data source first.');
        if ((await this.extraction.listRules(input)).some(rule => rule.payload.sourceConnectionId === input.connectionId))
            throw new Error('Reassign or deactivate business rules that use this data source first.');
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

        const businessRules = await this.extraction.listRules(input);
        for (const connectionId of removedIds) {
            if (model.model.definitions.some(definition => definition.sourceConnectionId === connectionId)) {
                throw new Error('Remove or reassign definitions that use this data source first.');
            }
            if (businessRules.some(rule => rule.payload.sourceConnectionId === connectionId))
                throw new Error('Reassign or deactivate business rules that use this data source first.');
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
        return this.db
            .select({
                id: knowledgeSources.id,
                organizationId: knowledgeSources.organizationId,
                knowledgeModelId: knowledgeSources.knowledgeModelId,
                connectionId: knowledgeSources.connectionId,
                fileName: knowledgeSources.fileName,
                format: knowledgeSources.format,
                byteSize: knowledgeSources.byteSize,
                createdBy: knowledgeSources.createdBy,
                createdAt: knowledgeSources.createdAt,
                updatedAt: knowledgeSources.updatedAt,
                connectorId: knowledgeConnectorItems.connectorId,
                connectorProvider: knowledgeConnectors.provider,
                remotePath: knowledgeConnectorItems.remotePath,
                sourceUrl: knowledgeConnectorItems.sourceUrl,
            })
            .from(knowledgeSources)
            .leftJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
            .leftJoin(knowledgeConnectors, eq(knowledgeConnectors.id, knowledgeConnectorItems.connectorId))
            .where(and(...conditions))
            .orderBy(desc(knowledgeSources.updatedAt));
    }

    async searchKnowledgeSources(input: { organizationId: string; knowledgeModelId: string; connectionId?: string; query: string }) {
        const model = await this.getModel(input);
        if (input.connectionId && !model.dataSources.some(source => source.connectionId === input.connectionId))
            throw new Error('Knowledge model is not linked to this data source.');
        const conditions = [eq(knowledgeSources.organizationId, input.organizationId), eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId)];
        if (input.connectionId) conditions.push(or(isNull(knowledgeSources.connectionId), eq(knowledgeSources.connectionId, input.connectionId))!);
        const rows = await this.db
            .select({ ...getTableColumns(knowledgeSources), sourceUrl: knowledgeConnectorItems.sourceUrl })
            .from(knowledgeSources)
            .leftJoin(knowledgeConnectorItems, eq(knowledgeSources.id, knowledgeConnectorItems.knowledgeSourceId))
            .where(and(...conditions))
            .orderBy(desc(knowledgeSources.updatedAt));
        const needle = input.query.trim().toLowerCase();
        return rows
            .map(source => {
                const haystack = `${source.fileName}\n${source.contentText}`.toLowerCase();
                const matchIndex = haystack.indexOf(needle);
                if (matchIndex < 0) return null;
                const contentIndex = source.contentText.toLowerCase().indexOf(needle);
                const start = Math.max(0, contentIndex < 0 ? 0 : contentIndex - 240);
                const excerpt = source.contentText.slice(start, start + 800).trim();
                return { id: source.id, fileName: source.fileName, format: source.format, connectionId: source.connectionId, sourceUrl: source.sourceUrl, excerpt };
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
                sourceUrl: knowledgeConnectorItems.sourceUrl,
            })
            .from(knowledgeSources)
            .leftJoin(knowledgeConnectorItems, eq(knowledgeConnectorItems.knowledgeSourceId, knowledgeSources.id))
            .leftJoin(knowledgeConnectors, eq(knowledgeConnectors.id, knowledgeConnectorItems.connectorId))
            .where(and(eq(knowledgeSources.id, input.id), eq(knowledgeSources.organizationId, input.organizationId), eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId)))
            .limit(1);
        if (!source) throw new Error('Knowledge source not found.');
        return source;
    }

    private async assertKnowledgeSourceConnection(model: KnowledgeModelDetail, connectionId?: string | null) {
        if (connectionId && !model.dataSources.some(source => source.connectionId === connectionId)) {
            throw new Error('The selected data source is not linked to this knowledge model.');
        }
    }

    async createKnowledgeSource(input: {
        organizationId: string;
        knowledgeModelId: string;
        fileName: string;
        contentText: string;
        connectionId?: string | null;
        createdBy?: string | null;
    }) {
        const model = await this.getModel(input);
        await this.assertKnowledgeSourceConnection(model, input.connectionId);
        const value = validateKnowledgeSource(input.fileName, input.contentText);
        const [existing] = await this.db
            .select({ id: knowledgeSources.id })
            .from(knowledgeSources)
            .where(and(eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId), eq(knowledgeSources.fileName, value.fileName)))
            .limit(1);
        if (existing) throw new Error(`A knowledge source named "${value.fileName}" already exists.`);
        const [source] = await this.db
            .insert(knowledgeSources)
            .values({
                organizationId: input.organizationId,
                knowledgeModelId: input.knowledgeModelId,
                connectionId: input.connectionId || null,
                createdBy: input.createdBy || null,
                ...value,
            })
            .returning();
        await this.touchModel(input.knowledgeModelId);
        return this.getKnowledgeSource({ organizationId: input.organizationId, knowledgeModelId: input.knowledgeModelId, id: source!.id });
    }

    async updateKnowledgeSource(input: { organizationId: string; knowledgeModelId: string; id: string; contentText: string; connectionId?: string | null }) {
        const model = await this.getModel(input);
        const existing = await this.getKnowledgeSource(input);
        if (existing.connectorId) throw new Error('Connector-managed knowledge sources are read-only. Edit the original content and sync again.');
        await this.assertKnowledgeSourceConnection(model, input.connectionId);
        const value = validateKnowledgeSource(existing.fileName, input.contentText);
        const [source] = await this.db
            .update(knowledgeSources)
            .set({ contentText: value.contentText, byteSize: value.byteSize, format: value.format, connectionId: input.connectionId || null })
            .where(eq(knowledgeSources.id, existing.id))
            .returning();
        await this.touchModel(input.knowledgeModelId);
        return this.getKnowledgeSource({ organizationId: input.organizationId, knowledgeModelId: input.knowledgeModelId, id: source!.id });
    }

    async deleteKnowledgeSource(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        const source = await this.getKnowledgeSource(input);
        if (source.connectorId) throw new Error('Connector-managed knowledge sources can only be removed by disconnecting their connector.');
        await this.db.delete(knowledgeSources).where(eq(knowledgeSources.id, source.id));
        await this.touchModel(input.knowledgeModelId);
    }

    async listConnectors(input: { organizationId: string; knowledgeModelId: string }) {
        await this.getModel(input);
        return this.db
            .select()
            .from(knowledgeConnectors)
            .where(and(eq(knowledgeConnectors.organizationId, input.organizationId), eq(knowledgeConnectors.knowledgeModelId, input.knowledgeModelId)))
            .orderBy(desc(knowledgeConnectors.updatedAt));
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
            .values({ ...input, provider: 'github', autoExtract: true, rootPath: input.rootPath.replace(/^\/+|\/+$/g, '') })
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
            for (const item of items) await invalidateSourceEvidence(tx, item.sourceId, 'missing');
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
                    autoExtract: true,
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

    async queueDueLinearConnectors() {
        const due = await this.db
            .select({ id: knowledgeConnectors.id })
            .from(knowledgeConnectors)
            .where(and(eq(knowledgeConnectors.provider, 'linear'), ne(knowledgeConnectors.status, 'disabled'), lte(knowledgeConnectors.nextSyncAt, new Date())));
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

    async finishConnectorSyncJob(input: { jobId: string; connectorId: string; leaseToken?: string; error?: string | null; retryAt?: Date }) {
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
                    .set({ status: input.retryAt ? 'pending' : 'error', lastError: input.error.slice(0, 2000) })
                    .where(eq(knowledgeConnectors.id, connector.id));
        });
    }

    async applyConnectorSnapshot(input: KnowledgeConnectorSnapshot & { connectorId: string; configRevision?: number; jobId?: string; leaseToken?: string }) {
        const validated = input.files.map(file => ({
            ...file,
            value: validateKnowledgeSource(
                file.format ? `source.${file.format === 'markdown' ? 'md' : file.format === 'text' ? 'txt' : 'yaml'}` : (file.path.split('/').pop() ?? file.path),
                file.contentText,
            ),
        }));
        if (new Set(input.files.map(file => file.path)).size !== input.files.length) throw new Error('Duplicate remote knowledge item.');
        await this.db.transaction(async tx => {
            const [connector] = await tx.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, input.connectorId)).for('update');
            if (!connector || connector.status === 'disabled') throw new Error('Knowledge connector is unavailable.');
            // Serialize source invalidation with review/publication before reading evidence.
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
                const fileName = file.title
                    ? `${baseName.slice(0, Math.max(20, 240 - suffix.length))}${suffix}`
                    : `${baseName.slice(0, 240 - ` · ${connector.id.slice(-8)}`.length)} · ${connector.id.slice(-8)}`;
                const item = byPath.get(file.path);
                if (item) {
                    if (item.remoteSha !== file.sha) {
                        await invalidateSourceEvidence(tx, item.knowledgeSourceId, 'outdated');
                        const [updatedSource] = await tx
                            .update(knowledgeSources)
                            .set({ contentText: file.value.contentText, byteSize: file.value.byteSize, format: file.value.format, fileName })
                            .where(eq(knowledgeSources.id, item.knowledgeSourceId))
                            .returning();
                        if (updatedSource) await enqueueSourceExtraction(tx, connector, updatedSource);
                    }
                    if (item.remoteSha !== file.sha || item.sourceUrl !== (file.sourceUrl ?? null))
                        await tx
                            .update(knowledgeConnectorItems)
                            .set({ remoteSha: file.sha, sourceUrl: file.sourceUrl ?? null, updatedAt: new Date() })
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
                await tx
                    .insert(knowledgeConnectorItems)
                    .values({ connectorId: connector.id, knowledgeSourceId: source.id, remotePath: file.path, remoteSha: file.sha, sourceUrl: file.sourceUrl ?? null });
                await enqueueSourceExtraction(tx, connector, source);
            }
            const removed = [...byPath.values()].map(item => item.knowledgeSourceId);
            for (const sourceId of removed) await invalidateSourceEvidence(tx, sourceId, 'missing');
            if (removed.length) await tx.delete(knowledgeSources).where(inArray(knowledgeSources.id, removed));
            await tx
                .update(knowledgeConnectors)
                .set({
                    status: 'ready',
                    lastCommitSha: input.commitSha ?? null,
                    ...(connector.provider === 'linear' ? { nextSyncAt: new Date(Date.now() + LINEAR_SYNC_INTERVAL_MS) } : {}),
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
        definitionIds?: string[];
        knowledgeSourceIds?: string[];
        sourceType?: string | null;
        sourceId?: string | null;
        createdBy?: string | null;
    }) {
        const model = await this.getModel(input);
        if (!model.dataSources.some(source => source.connectionId === input.sourceConnectionId)) throw new Error('This data source is not linked to the selected knowledge model.');
        const definitionIds = [...new Set(input.definitionIds ?? [])];
        if (definitionIds.some(id => !model.model.definitions.some(definition => definition.id === id))) throw new Error('One or more knowledge definitions are unavailable.');
        const [row] = await this.db
            .insert(knowledgeVerifiedQueries)
            .values({
                knowledgeModelId: input.knowledgeModelId,
                sourceConnectionId: input.sourceConnectionId,
                title: input.title.trim(),
                question: input.question.trim(),
                sql: input.sql.trim(),
                description: input.description?.trim() || null,
                definitionIds,
                sourceType: input.sourceType?.trim() || 'manual',
                sourceId: input.sourceId?.trim() || null,
                createdBy: input.createdBy ?? null,
                updatedBy: input.createdBy ?? null,
            })
            .returning();
        await this.replaceAssetSources({
            ...input,
            assetType: 'verified_query',
            assetId: row!.id,
            sourceIds: input.knowledgeSourceIds ?? [],
            relationType: 'provided',
        });
        await this.touchModel(input.knowledgeModelId);
        return this.getVerifiedQuery({ organizationId: input.organizationId, knowledgeModelId: input.knowledgeModelId, id: row!.id });
    }

    async updateVerifiedQuery(input: {
        organizationId: string;
        knowledgeModelId: string;
        id: string;
        title: string;
        question: string;
        sql: string;
        description?: string | null;
        definitionIds?: string[];
        knowledgeSourceIds?: string[];
        updatedBy?: string | null;
    }) {
        const model = await this.getModel(input);
        const definitionIds = [...new Set(input.definitionIds ?? [])];
        if (definitionIds.some(id => !model.model.definitions.some(definition => definition.id === id))) throw new Error('One or more knowledge definitions are unavailable.');
        const [row] = await this.db
            .update(knowledgeVerifiedQueries)
            .set({
                title: input.title.trim(),
                question: input.question.trim(),
                sql: input.sql.trim(),
                description: input.description?.trim() || null,
                definitionIds,
                updatedBy: input.updatedBy ?? null,
            })
            .where(and(eq(knowledgeVerifiedQueries.id, input.id), eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId)))
            .returning();
        if (!row) throw new Error('Verified query not found.');
        await this.replaceAssetSources({ ...input, assetType: 'verified_query', assetId: input.id, sourceIds: input.knowledgeSourceIds ?? [], relationType: 'provided' });
        return this.getVerifiedQuery({ organizationId: input.organizationId, knowledgeModelId: input.knowledgeModelId, id: row.id });
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
        await this.db
            .delete(knowledgeAssetSources)
            .where(
                and(
                    eq(knowledgeAssetSources.knowledgeModelId, input.knowledgeModelId),
                    eq(knowledgeAssetSources.assetType, 'verified_query'),
                    eq(knowledgeAssetSources.assetId, input.id),
                ),
            );
        await this.db.delete(knowledgeVerifiedQueries).where(and(eq(knowledgeVerifiedQueries.id, input.id), eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId)));
        await this.touchModel(input.knowledgeModelId);
    }
}
