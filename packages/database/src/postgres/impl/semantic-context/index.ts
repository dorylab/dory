import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { parseDocument, stringify } from 'yaml';

import { getClient } from '@dory/database/postgres/client';
import {
    connections,
    semanticModelKnowledgeSources,
    semanticModels,
    semanticModelSources,
    semanticVerifiedQueries,
    type SemanticDefinition,
    type SemanticKnowledgeSourceFormat,
    type SemanticModelDocument,
} from '@dory/database/postgres/schemas';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';

export const SEMANTIC_KNOWLEDGE_SOURCE_MAX_BYTES = 10_000_000;
export type SemanticModelDataSourceDetail = { connectionId: string; name: string; type: string; engine: string };
export type SemanticModelDetail = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    businessContextMd: string;
    modelYaml: string;
    model: SemanticModelDocument;
    dataSources: SemanticModelDataSourceDetail[];
    verifiedQueryCount: number;
    createdAt: Date;
    updatedAt: Date;
};

export function validateSemanticKnowledgeSource(fileName: string, contentText: string) {
    const normalizedName = fileName.trim();
    if (!normalizedName || normalizedName.includes('/') || normalizedName.includes('\\') || normalizedName.includes('\0')) throw new Error('Enter a valid file name.');
    const extension = normalizedName.split('.').pop()?.toLowerCase();
    const format: SemanticKnowledgeSourceFormat | undefined =
        extension === 'md' || extension === 'markdown' ? 'markdown' : extension === 'yaml' || extension === 'yml' ? 'yaml' : extension === 'txt' ? 'text' : undefined;
    if (!format) throw new Error('Only Markdown, YAML, and TXT files are supported.');
    const byteSize = Buffer.byteLength(contentText, 'utf8');
    if (byteSize > SEMANTIC_KNOWLEDGE_SOURCE_MAX_BYTES) throw new Error('Knowledge source files must be 10 MB or smaller.');
    if (format === 'yaml') {
        const document = parseDocument(contentText);
        if (document.errors.length) throw new Error(document.errors[0]?.message ?? 'Invalid YAML.');
    }
    return { fileName: normalizedName, format, contentText, byteSize };
}

function normalizeDefinition(value: unknown): SemanticDefinition {
    const input = value as Record<string, unknown>;
    const kind = String(input.kind ?? '');
    if (!['entity', 'metric', 'measure', 'dimension', 'relationship'].includes(kind)) throw new Error('Unsupported semantic definition type.');
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const sourceConnectionId = typeof input.sourceConnectionId === 'string' ? input.sourceConnectionId.trim() : '';
    if (!name) throw new Error('A semantic definition name is required.');
    if (!sourceConnectionId) throw new Error(`A data source is required for "${name}".`);
    const list = (key: string) =>
        Array.isArray(input[key]) ? input[key].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : undefined;
    const optional = (key: string) => (typeof input[key] === 'string' && input[key].trim() ? input[key].trim() : undefined);
    return {
        id: optional('id') ?? `${kind}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name,
        kind: kind as SemanticDefinition['kind'],
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
    };
}

export function validateSemanticModelDocument(value: unknown, sourceIds?: ReadonlySet<string>): SemanticModelDocument {
    const raw = value as { definitions?: unknown };
    const definitions = Array.isArray(raw?.definitions) ? raw.definitions.map(normalizeDefinition) : [];
    const ids = new Set<string>();
    for (const definition of definitions) {
        if (ids.has(definition.id)) throw new Error(`Duplicate semantic definition: ${definition.id}`);
        if (sourceIds && !sourceIds.has(definition.sourceConnectionId)) throw new Error(`Data source for "${definition.name}" is not linked to this semantic model.`);
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
        if (!definition.from || !definition.to) throw new Error(`Relationship "${definition.name}" requires both from and to references.`);
        const from = references.get(definition.from);
        const to = references.get(definition.to);
        if (!from || !to) throw new Error(`Relationship "${definition.name}" references an unknown definition.`);
        if (from.sourceConnectionId !== definition.sourceConnectionId || to.sourceConnectionId !== definition.sourceConnectionId) {
            throw new Error(`Relationship "${definition.name}" cannot cross data sources.`);
        }
    }
    return { definitions };
}

export function serializeSemanticModel(model: SemanticModelDocument) {
    const groups = new Map<string, SemanticDefinition[]>();
    for (const definition of model.definitions) {
        const key = `${definition.sourceConnectionId}:${definition.source ?? '__model__'}`;
        groups.set(key, [...(groups.get(key) ?? []), definition]);
    }
    const cubes = [...groups.values()].map((definitions, index) => {
        const first = definitions[0]!;
        const cubeName = (first.source ?? `semantic_source_${index + 1}`).replace(/[^a-zA-Z0-9_]/g, '_');
        const encode = (definition: SemanticDefinition) => ({
            name: definition.name,
            ...(definition.description ? { description: definition.description } : {}),
            ...(definition.expression ? { sql: definition.expression } : {}),
            meta: {
                dory: {
                    id: definition.id,
                    kind: definition.kind,
                    status: definition.status,
                    sourceConnectionId: definition.sourceConnectionId,
                    aliases: definition.aliases,
                    filters: definition.filters,
                    timeDimension: definition.timeDimension,
                    dimensions: definition.dimensions,
                },
            },
        });
        return {
            name: cubeName,
            ...(first.source ? { sql_table: first.source } : {}),
            meta: {
                dory: {
                    sourceConnectionId: first.sourceConnectionId,
                    entities: definitions.filter(definition => definition.kind === 'entity').map(encode),
                },
            },
            measures: definitions.filter(definition => definition.kind === 'metric' || definition.kind === 'measure').map(encode),
            dimensions: definitions.filter(definition => definition.kind === 'dimension').map(encode),
            joins: definitions.filter(definition => definition.kind === 'relationship').map(definition => ({ ...encode(definition), from: definition.from, to: definition.to })),
        };
    });
    return stringify({ cubes });
}

export function parseSemanticYaml(source: string, fallbackSourceConnectionId?: string, markImportedDefinitionsUnverified = true): SemanticModelDocument {
    const document = parseDocument(source);
    if (document.errors.length) throw new Error(document.errors[0]?.message ?? 'Invalid YAML.');
    const value = document.toJS() as { cubes?: Array<Record<string, unknown>>; definitions?: Array<Record<string, unknown>> };
    if (value.definitions) {
        return validateSemanticModelDocument({
            definitions: value.definitions.map(item => ({
                ...item,
                sourceConnectionId: item.sourceConnectionId ?? fallbackSourceConnectionId,
                status: markImportedDefinitionsUnverified ? 'unverified' : item.status,
            })),
        });
    }
    const hasJoins = (value.cubes ?? []).some(cube => {
        const joins = cube.joins;
        return Array.isArray(joins) ? joins.length > 0 : Boolean(joins && typeof joins === 'object' && Object.keys(joins).length);
    });
    const definitions = (value.cubes ?? []).flatMap((cube, cubeIndex) => {
        const cubeDory = (cube.meta as { dory?: Record<string, unknown> } | undefined)?.dory ?? {};
        const sourceConnectionId = String(cubeDory.sourceConnectionId ?? fallbackSourceConnectionId ?? '');
        const sourceTable = typeof cube.sql_table === 'string' ? cube.sql_table : typeof cube.sqlTable === 'string' ? cube.sqlTable : String(cube.name ?? '');
        const decode = (item: Record<string, unknown>, defaultKind: SemanticDefinition['kind']) => {
            const dory = (item.meta as { dory?: Record<string, unknown> } | undefined)?.dory ?? {};
            return {
                ...item,
                id: dory.id ?? item.id ?? `${defaultKind}:${cubeIndex}:${String(item.name ?? '')}`,
                kind: dory.kind ?? defaultKind,
                sourceConnectionId: dory.sourceConnectionId ?? sourceConnectionId,
                source: sourceTable,
                expression: item.expression ?? item.sql,
                aliases: dory.aliases,
                filters: dory.filters,
                timeDimension: dory.timeDimension,
                dimensions: dory.dimensions,
                status: markImportedDefinitionsUnverified ? 'unverified' : (dory.status ?? item.status),
            };
        };
        const asRecords = (input: unknown) =>
            Array.isArray(input)
                ? input
                : input && typeof input === 'object'
                  ? Object.entries(input as Record<string, unknown>).map(([name, item]) => ({ name, ...(item as object) }))
                  : [];
        const encodedEntities = asRecords(cubeDory.entities);
        const entities = encodedEntities.length
            ? encodedEntities.map(item => decode(item, 'entity'))
            : hasJoins
              ? [
                    {
                        id: `entity:${String(cube.name ?? cubeIndex)}`,
                        name: String(cube.name ?? `cube_${cubeIndex + 1}`),
                        kind: 'entity' as const,
                        status: markImportedDefinitionsUnverified ? ('unverified' as const) : 'verified',
                        sourceConnectionId,
                        source: sourceTable,
                    },
                ]
              : [];
        const measures = asRecords(cube.measures).map(item => decode(item, 'measure'));
        const dimensions = asRecords(cube.dimensions).map(item => decode(item, 'dimension'));
        const relationships = asRecords(cube.joins).map(item => ({ ...decode(item, 'relationship'), from: item.from ?? cube.name, to: item.to ?? item.name }));
        return [...entities, ...measures, ...dimensions, ...relationships];
    });
    return validateSemanticModelDocument({ definitions });
}

export class PostgresSemanticContextRepository {
    private db!: PostgresDBClient;

    async init() {
        const client = await getClient();
        if (!client) throw new DatabaseError('Database connection failed', 500);
        this.db = client as PostgresDBClient;
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError('Database connection failed', 500);
    }

    parseYamlForImport(source: string, fallbackSourceConnectionId?: string) {
        return parseSemanticYaml(source, fallbackSourceConnectionId);
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
                semanticModelId: semanticModelSources.semanticModelId,
                connectionId: connections.id,
                name: connections.name,
                type: connections.type,
                engine: connections.engine,
            })
            .from(semanticModelSources)
            .innerJoin(connections, eq(connections.id, semanticModelSources.connectionId))
            .where(inArray(semanticModelSources.semanticModelId, modelIds));
    }

    private async touchModel(semanticModelId: string) {
        await this.db.update(semanticModels).set({ updatedAt: new Date() }).where(eq(semanticModels.id, semanticModelId));
    }

    async listModels(input: { organizationId: string; query?: string | null; connectionId?: string | null }): Promise<SemanticModelDetail[]> {
        this.assertInited();
        let rows = await this.db.select().from(semanticModels).where(eq(semanticModels.organizationId, input.organizationId)).orderBy(desc(semanticModels.updatedAt));
        const dataSources = await this.sourceDetails(rows.map(row => row.id));
        if (input.connectionId) {
            const allowed = new Set(dataSources.filter(source => source.connectionId === input.connectionId).map(source => source.semanticModelId));
            rows = rows.filter(row => allowed.has(row.id));
        }
        const query = input.query?.trim().toLowerCase();
        if (query)
            rows = rows.filter(row =>
                `${row.name} ${row.description ?? ''} ${dataSources
                    .filter(source => source.semanticModelId === row.id)
                    .map(source => `${source.name} ${source.engine}`)
                    .join(' ')}`
                    .toLowerCase()
                    .includes(query),
            );
        const ids = rows.map(row => row.id);
        const verified = ids.length
            ? await this.db
                  .select({ semanticModelId: semanticVerifiedQueries.semanticModelId })
                  .from(semanticVerifiedQueries)
                  .where(inArray(semanticVerifiedQueries.semanticModelId, ids))
            : [];
        return rows.map(row => ({
            ...row,
            model: validateSemanticModelDocument(row.modelJson),
            dataSources: dataSources.filter(source => source.semanticModelId === row.id).map(({ semanticModelId: _, ...source }) => source),
            verifiedQueryCount: verified.filter(queryRow => queryRow.semanticModelId === row.id).length,
        }));
    }

    async getModel(input: { organizationId: string; semanticModelId: string }) {
        const models = await this.listModels({ organizationId: input.organizationId });
        const found = models.find(item => item.id === input.semanticModelId);
        if (!found) throw new Error('Semantic model not found.');
        return found;
    }

    async createModel(input: { organizationId: string; name: string; description?: string | null; connectionIds: string[] }) {
        const connectionIds = await this.assertConnections(input.organizationId, input.connectionIds);
        const [model] = await this.db
            .insert(semanticModels)
            .values({ organizationId: input.organizationId, name: input.name.trim(), description: input.description?.trim() || null })
            .returning();
        await this.db.insert(semanticModelSources).values(connectionIds.map(connectionId => ({ semanticModelId: model!.id, connectionId })));
        return this.getModel({ organizationId: input.organizationId, semanticModelId: model!.id });
    }

    async updateModel(input: { organizationId: string; semanticModelId: string; name?: string; description?: string | null; businessContextMd?: string }) {
        await this.getModel(input);
        await this.db
            .update(semanticModels)
            .set({
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
                ...(input.businessContextMd !== undefined ? { businessContextMd: input.businessContextMd } : {}),
            })
            .where(and(eq(semanticModels.id, input.semanticModelId), eq(semanticModels.organizationId, input.organizationId)));
        return this.getModel(input);
    }

    async deleteModel(input: { organizationId: string; semanticModelId: string }) {
        await this.getModel(input);
        await this.db.delete(semanticModels).where(and(eq(semanticModels.id, input.semanticModelId), eq(semanticModels.organizationId, input.organizationId)));
    }

    async saveDefinitions(input: { organizationId: string; semanticModelId: string; definitions: unknown }) {
        const model = await this.getModel(input);
        const document = validateSemanticModelDocument({ definitions: input.definitions }, new Set(model.dataSources.map(source => source.connectionId)));
        await this.db
            .update(semanticModels)
            .set({ modelJson: document, modelYaml: serializeSemanticModel(document) })
            .where(eq(semanticModels.id, model.id));
        return this.getModel(input);
    }

    async importYaml(input: { organizationId: string; semanticModelId: string; source: string; fallbackSourceConnectionId?: string; preserveStatus?: boolean }) {
        const document = parseSemanticYaml(input.source, input.fallbackSourceConnectionId, !input.preserveStatus);
        return this.saveDefinitions({ ...input, definitions: document.definitions });
    }

    async addDataSource(input: { organizationId: string; semanticModelId: string; connectionId: string }) {
        await this.getModel(input);
        await this.assertConnections(input.organizationId, [input.connectionId]);
        await this.db.insert(semanticModelSources).values({ semanticModelId: input.semanticModelId, connectionId: input.connectionId }).onConflictDoNothing();
        await this.touchModel(input.semanticModelId);
        return this.getModel(input);
    }

    async removeDataSource(input: { organizationId: string; semanticModelId: string; connectionId: string }) {
        const model = await this.getModel(input);
        if (model.dataSources.length <= 1) throw new Error('A semantic model must have at least one data source.');
        if (model.model.definitions.some(item => item.sourceConnectionId === input.connectionId))
            throw new Error('Remove or reassign definitions that use this data source first.');
        const [query] = await this.db
            .select({ id: semanticVerifiedQueries.id })
            .from(semanticVerifiedQueries)
            .where(and(eq(semanticVerifiedQueries.semanticModelId, input.semanticModelId), eq(semanticVerifiedQueries.sourceConnectionId, input.connectionId)))
            .limit(1);
        if (query) throw new Error('Remove verified queries that use this data source first.');
        const [knowledgeSource] = await this.db
            .select({ id: semanticModelKnowledgeSources.id })
            .from(semanticModelKnowledgeSources)
            .where(and(eq(semanticModelKnowledgeSources.semanticModelId, input.semanticModelId), eq(semanticModelKnowledgeSources.connectionId, input.connectionId)))
            .limit(1);
        if (knowledgeSource) throw new Error('Reassign knowledge sources that use this data source first.');
        await this.db
            .delete(semanticModelSources)
            .where(and(eq(semanticModelSources.semanticModelId, input.semanticModelId), eq(semanticModelSources.connectionId, input.connectionId)));
        await this.touchModel(input.semanticModelId);
        return this.getModel(input);
    }

    async replaceDataSources(input: { organizationId: string; semanticModelId: string; connectionIds: string[] }) {
        const model = await this.getModel(input);
        const connectionIds = await this.assertConnections(input.organizationId, input.connectionIds);
        const nextIds = new Set(connectionIds);
        const removedIds = model.dataSources.map(source => source.connectionId).filter(connectionId => !nextIds.has(connectionId));

        for (const connectionId of removedIds) {
            if (model.model.definitions.some(definition => definition.sourceConnectionId === connectionId)) {
                throw new Error('Remove or reassign definitions that use this data source first.');
            }
            const [query] = await this.db
                .select({ id: semanticVerifiedQueries.id })
                .from(semanticVerifiedQueries)
                .where(and(eq(semanticVerifiedQueries.semanticModelId, input.semanticModelId), eq(semanticVerifiedQueries.sourceConnectionId, connectionId)))
                .limit(1);
            if (query) throw new Error('Remove verified queries that use this data source first.');
            const [knowledgeSource] = await this.db
                .select({ id: semanticModelKnowledgeSources.id })
                .from(semanticModelKnowledgeSources)
                .where(and(eq(semanticModelKnowledgeSources.semanticModelId, input.semanticModelId), eq(semanticModelKnowledgeSources.connectionId, connectionId)))
                .limit(1);
            if (knowledgeSource) throw new Error('Reassign knowledge sources that use this data source first.');
        }

        await this.db
            .insert(semanticModelSources)
            .values(connectionIds.map(connectionId => ({ semanticModelId: input.semanticModelId, connectionId })))
            .onConflictDoNothing();
        if (removedIds.length) {
            await this.db
                .delete(semanticModelSources)
                .where(and(eq(semanticModelSources.semanticModelId, input.semanticModelId), inArray(semanticModelSources.connectionId, removedIds)));
        }
        await this.touchModel(input.semanticModelId);
        return this.getModel(input);
    }

    async listKnowledgeSources(input: { organizationId: string; semanticModelId: string; connectionId?: string | null }) {
        await this.getModel(input);
        const conditions = [eq(semanticModelKnowledgeSources.organizationId, input.organizationId), eq(semanticModelKnowledgeSources.semanticModelId, input.semanticModelId)];
        if (input.connectionId) conditions.push(or(isNull(semanticModelKnowledgeSources.connectionId), eq(semanticModelKnowledgeSources.connectionId, input.connectionId))!);
        return this.db
            .select({
                id: semanticModelKnowledgeSources.id,
                organizationId: semanticModelKnowledgeSources.organizationId,
                semanticModelId: semanticModelKnowledgeSources.semanticModelId,
                connectionId: semanticModelKnowledgeSources.connectionId,
                fileName: semanticModelKnowledgeSources.fileName,
                format: semanticModelKnowledgeSources.format,
                byteSize: semanticModelKnowledgeSources.byteSize,
                createdBy: semanticModelKnowledgeSources.createdBy,
                createdAt: semanticModelKnowledgeSources.createdAt,
                updatedAt: semanticModelKnowledgeSources.updatedAt,
            })
            .from(semanticModelKnowledgeSources)
            .where(and(...conditions))
            .orderBy(desc(semanticModelKnowledgeSources.updatedAt));
    }

    async searchKnowledgeSources(input: { organizationId: string; semanticModelId: string; connectionId: string; query: string }) {
        const model = await this.getModel(input);
        if (!model.dataSources.some(source => source.connectionId === input.connectionId)) throw new Error('Semantic model is not linked to this data source.');
        const rows = await this.db
            .select()
            .from(semanticModelKnowledgeSources)
            .where(
                and(
                    eq(semanticModelKnowledgeSources.organizationId, input.organizationId),
                    eq(semanticModelKnowledgeSources.semanticModelId, input.semanticModelId),
                    or(isNull(semanticModelKnowledgeSources.connectionId), eq(semanticModelKnowledgeSources.connectionId, input.connectionId)),
                ),
            )
            .orderBy(desc(semanticModelKnowledgeSources.updatedAt));
        const needle = input.query.trim().toLowerCase();
        return rows
            .map(source => {
                const haystack = `${source.fileName}\n${source.contentText}`.toLowerCase();
                const matchIndex = haystack.indexOf(needle);
                if (matchIndex < 0) return null;
                const contentIndex = source.contentText.toLowerCase().indexOf(needle);
                const start = Math.max(0, contentIndex < 0 ? 0 : contentIndex - 240);
                const excerpt = source.contentText.slice(start, start + 800).trim();
                return { id: source.id, fileName: source.fileName, format: source.format, connectionId: source.connectionId, excerpt };
            })
            .filter((source): source is NonNullable<typeof source> => Boolean(source))
            .slice(0, 10);
    }

    async getKnowledgeSource(input: { organizationId: string; semanticModelId: string; id: string }) {
        await this.getModel(input);
        const [source] = await this.db
            .select()
            .from(semanticModelKnowledgeSources)
            .where(
                and(
                    eq(semanticModelKnowledgeSources.id, input.id),
                    eq(semanticModelKnowledgeSources.organizationId, input.organizationId),
                    eq(semanticModelKnowledgeSources.semanticModelId, input.semanticModelId),
                ),
            )
            .limit(1);
        if (!source) throw new Error('Knowledge source not found.');
        return source;
    }

    private async assertKnowledgeSourceConnection(model: SemanticModelDetail, connectionId?: string | null) {
        if (connectionId && !model.dataSources.some(source => source.connectionId === connectionId)) {
            throw new Error('The selected data source is not linked to this semantic model.');
        }
    }

    async createKnowledgeSource(input: {
        organizationId: string;
        semanticModelId: string;
        fileName: string;
        contentText: string;
        connectionId?: string | null;
        createdBy?: string | null;
    }) {
        const model = await this.getModel(input);
        await this.assertKnowledgeSourceConnection(model, input.connectionId);
        const value = validateSemanticKnowledgeSource(input.fileName, input.contentText);
        const [existing] = await this.db
            .select({ id: semanticModelKnowledgeSources.id })
            .from(semanticModelKnowledgeSources)
            .where(and(eq(semanticModelKnowledgeSources.semanticModelId, input.semanticModelId), eq(semanticModelKnowledgeSources.fileName, value.fileName)))
            .limit(1);
        if (existing) throw new Error(`A knowledge source named "${value.fileName}" already exists.`);
        const [source] = await this.db
            .insert(semanticModelKnowledgeSources)
            .values({
                organizationId: input.organizationId,
                semanticModelId: input.semanticModelId,
                connectionId: input.connectionId || null,
                createdBy: input.createdBy || null,
                ...value,
            })
            .returning();
        await this.touchModel(input.semanticModelId);
        return source!;
    }

    async updateKnowledgeSource(input: { organizationId: string; semanticModelId: string; id: string; contentText: string; connectionId?: string | null }) {
        const model = await this.getModel(input);
        const existing = await this.getKnowledgeSource(input);
        await this.assertKnowledgeSourceConnection(model, input.connectionId);
        const value = validateSemanticKnowledgeSource(existing.fileName, input.contentText);
        const [source] = await this.db
            .update(semanticModelKnowledgeSources)
            .set({ contentText: value.contentText, byteSize: value.byteSize, format: value.format, connectionId: input.connectionId || null })
            .where(eq(semanticModelKnowledgeSources.id, existing.id))
            .returning();
        await this.touchModel(input.semanticModelId);
        return source!;
    }

    async deleteKnowledgeSource(input: { organizationId: string; semanticModelId: string; id: string }) {
        const source = await this.getKnowledgeSource(input);
        await this.db.delete(semanticModelKnowledgeSources).where(eq(semanticModelKnowledgeSources.id, source.id));
        await this.touchModel(input.semanticModelId);
    }

    async listVerifiedQueries(input: { organizationId: string; semanticModelId: string; query?: string | null; connectionId?: string | null }) {
        await this.getModel(input);
        const conditions = [eq(semanticVerifiedQueries.semanticModelId, input.semanticModelId)];
        if (input.connectionId) conditions.push(eq(semanticVerifiedQueries.sourceConnectionId, input.connectionId));
        if (input.query?.trim())
            conditions.push(or(ilike(semanticVerifiedQueries.title, `%${input.query.trim()}%`), ilike(semanticVerifiedQueries.question, `%${input.query.trim()}%`))!);
        return this.db
            .select()
            .from(semanticVerifiedQueries)
            .where(and(...conditions))
            .orderBy(desc(semanticVerifiedQueries.updatedAt));
    }

    async createVerifiedQuery(input: {
        organizationId: string;
        semanticModelId: string;
        sourceConnectionId: string;
        title: string;
        question: string;
        sql: string;
        description?: string | null;
        definitionIds?: string[];
        sourceType?: string | null;
        sourceId?: string | null;
        createdBy?: string | null;
    }) {
        const model = await this.getModel(input);
        if (!model.dataSources.some(source => source.connectionId === input.sourceConnectionId)) throw new Error('This data source is not linked to the selected semantic model.');
        const [row] = await this.db
            .insert(semanticVerifiedQueries)
            .values({
                semanticModelId: input.semanticModelId,
                sourceConnectionId: input.sourceConnectionId,
                title: input.title.trim(),
                question: input.question.trim(),
                sql: input.sql.trim(),
                description: input.description?.trim() || null,
                definitionIds: input.definitionIds ?? [],
                sourceType: input.sourceType?.trim() || 'manual',
                sourceId: input.sourceId?.trim() || null,
                createdBy: input.createdBy ?? null,
            })
            .returning();
        await this.touchModel(input.semanticModelId);
        return row!;
    }

    async getVerifiedQuery(input: { organizationId: string; semanticModelId: string; id: string }) {
        await this.getModel(input);
        const [row] = await this.db
            .select()
            .from(semanticVerifiedQueries)
            .where(and(eq(semanticVerifiedQueries.id, input.id), eq(semanticVerifiedQueries.semanticModelId, input.semanticModelId)))
            .limit(1);
        if (!row) throw new Error('Verified query not found.');
        return row;
    }

    async deleteVerifiedQuery(input: { organizationId: string; semanticModelId: string; id: string }) {
        await this.getModel(input);
        await this.db.delete(semanticVerifiedQueries).where(and(eq(semanticVerifiedQueries.id, input.id), eq(semanticVerifiedQueries.semanticModelId, input.semanticModelId)));
        await this.touchModel(input.semanticModelId);
    }
}
