import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { parseDocument, stringify } from 'yaml';

import { getClient } from '@dory/database/postgres/client';
import {
    connections,
    knowledgeSources,
    knowledgeModels,
    knowledgeModelSources,
    knowledgeVerifiedQueries,
    type KnowledgeDefinition,
    type KnowledgeSourceFormat,
    type KnowledgeModelDocument,
} from '@dory/database/postgres/schemas';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';

export const KNOWLEDGE_SOURCE_MAX_BYTES = 10_000_000;
export type KnowledgeModelDataSourceDetail = { connectionId: string; name: string; type: string; engine: string };
export type KnowledgeModelDetail = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    businessContextMd: string;
    modelYaml: string;
    model: KnowledgeModelDocument;
    dataSources: KnowledgeModelDataSourceDetail[];
    verifiedQueryCount: number;
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

export function serializeKnowledgeModel(model: KnowledgeModelDocument) {
    const groups = new Map<string, KnowledgeDefinition[]>();
    for (const definition of model.definitions) {
        const key = `${definition.sourceConnectionId}:${definition.source ?? '__model__'}`;
        groups.set(key, [...(groups.get(key) ?? []), definition]);
    }
    const cubes = [...groups.values()].map((definitions, index) => {
        const first = definitions[0]!;
        const cubeName = (first.source ?? `knowledge_source_${index + 1}`).replace(/[^a-zA-Z0-9_]/g, '_');
        const encode = (definition: KnowledgeDefinition) => ({
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

export function parseKnowledgeYaml(source: string, fallbackSourceConnectionId?: string, markImportedDefinitionsUnverified = true): KnowledgeModelDocument {
    const document = parseDocument(source);
    if (document.errors.length) throw new Error(document.errors[0]?.message ?? 'Invalid YAML.');
    const value = document.toJS() as { cubes?: Array<Record<string, unknown>>; definitions?: Array<Record<string, unknown>> };
    if (value.definitions) {
        return validateKnowledgeModelDocument({
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
        const decode = (item: Record<string, unknown>, defaultKind: KnowledgeDefinition['kind']) => {
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
    return validateKnowledgeModelDocument({ definitions });
}

export class PostgresKnowledgeRepository {
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
        return parseKnowledgeYaml(source, fallbackSourceConnectionId);
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
        return rows.map(row => ({
            ...row,
            model: validateKnowledgeModelDocument(row.modelJson),
            dataSources: dataSources.filter(source => source.knowledgeModelId === row.id).map(({ knowledgeModelId: _, ...source }) => source),
            verifiedQueryCount: verified.filter(queryRow => queryRow.knowledgeModelId === row.id).length,
        }));
    }

    async getModel(input: { organizationId: string; knowledgeModelId: string }) {
        const models = await this.listModels({ organizationId: input.organizationId });
        const found = models.find(item => item.id === input.knowledgeModelId);
        if (!found) throw new Error('Knowledge model not found.');
        return found;
    }

    async createModel(input: { organizationId: string; name: string; description?: string | null; connectionIds: string[] }) {
        const connectionIds = await this.assertConnections(input.organizationId, input.connectionIds);
        const [model] = await this.db
            .insert(knowledgeModels)
            .values({ organizationId: input.organizationId, name: input.name.trim(), description: input.description?.trim() || null })
            .returning();
        await this.db.insert(knowledgeModelSources).values(connectionIds.map(connectionId => ({ knowledgeModelId: model!.id, connectionId })));
        return this.getModel({ organizationId: input.organizationId, knowledgeModelId: model!.id });
    }

    async updateModel(input: { organizationId: string; knowledgeModelId: string; name?: string; description?: string | null; businessContextMd?: string }) {
        await this.getModel(input);
        await this.db
            .update(knowledgeModels)
            .set({
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
                ...(input.businessContextMd !== undefined ? { businessContextMd: input.businessContextMd } : {}),
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
        await this.db
            .update(knowledgeModels)
            .set({ modelJson: document, modelYaml: serializeKnowledgeModel(document) })
            .where(eq(knowledgeModels.id, model.id));
        return this.getModel(input);
    }

    async importYaml(input: { organizationId: string; knowledgeModelId: string; source: string; fallbackSourceConnectionId?: string; preserveStatus?: boolean }) {
        const document = parseKnowledgeYaml(input.source, input.fallbackSourceConnectionId, !input.preserveStatus);
        return this.saveDefinitions({ ...input, definitions: document.definitions });
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
            if (model.model.definitions.some(definition => definition.sourceConnectionId === connectionId)) {
                throw new Error('Remove or reassign definitions that use this data source first.');
            }
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
            })
            .from(knowledgeSources)
            .where(and(...conditions))
            .orderBy(desc(knowledgeSources.updatedAt));
    }

    async searchKnowledgeSources(input: { organizationId: string; knowledgeModelId: string; connectionId: string; query: string }) {
        const model = await this.getModel(input);
        if (!model.dataSources.some(source => source.connectionId === input.connectionId)) throw new Error('Knowledge model is not linked to this data source.');
        const rows = await this.db
            .select()
            .from(knowledgeSources)
            .where(
                and(
                    eq(knowledgeSources.organizationId, input.organizationId),
                    eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId),
                    or(isNull(knowledgeSources.connectionId), eq(knowledgeSources.connectionId, input.connectionId)),
                ),
            )
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
                return { id: source.id, fileName: source.fileName, format: source.format, connectionId: source.connectionId, excerpt };
            })
            .filter((source): source is NonNullable<typeof source> => Boolean(source))
            .slice(0, 10);
    }

    async getKnowledgeSource(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        await this.getModel(input);
        const [source] = await this.db
            .select()
            .from(knowledgeSources)
            .where(
                and(
                    eq(knowledgeSources.id, input.id),
                    eq(knowledgeSources.organizationId, input.organizationId),
                    eq(knowledgeSources.knowledgeModelId, input.knowledgeModelId),
                ),
            )
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
        return source!;
    }

    async updateKnowledgeSource(input: { organizationId: string; knowledgeModelId: string; id: string; contentText: string; connectionId?: string | null }) {
        const model = await this.getModel(input);
        const existing = await this.getKnowledgeSource(input);
        await this.assertKnowledgeSourceConnection(model, input.connectionId);
        const value = validateKnowledgeSource(existing.fileName, input.contentText);
        const [source] = await this.db
            .update(knowledgeSources)
            .set({ contentText: value.contentText, byteSize: value.byteSize, format: value.format, connectionId: input.connectionId || null })
            .where(eq(knowledgeSources.id, existing.id))
            .returning();
        await this.touchModel(input.knowledgeModelId);
        return source!;
    }

    async deleteKnowledgeSource(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        const source = await this.getKnowledgeSource(input);
        await this.db.delete(knowledgeSources).where(eq(knowledgeSources.id, source.id));
        await this.touchModel(input.knowledgeModelId);
    }

    async listVerifiedQueries(input: { organizationId: string; knowledgeModelId: string; query?: string | null; connectionId?: string | null }) {
        await this.getModel(input);
        const conditions = [eq(knowledgeVerifiedQueries.knowledgeModelId, input.knowledgeModelId)];
        if (input.connectionId) conditions.push(eq(knowledgeVerifiedQueries.sourceConnectionId, input.connectionId));
        if (input.query?.trim())
            conditions.push(or(ilike(knowledgeVerifiedQueries.title, `%${input.query.trim()}%`), ilike(knowledgeVerifiedQueries.question, `%${input.query.trim()}%`))!);
        return this.db
            .select()
            .from(knowledgeVerifiedQueries)
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
        sourceType?: string | null;
        sourceId?: string | null;
        createdBy?: string | null;
    }) {
        const model = await this.getModel(input);
        if (!model.dataSources.some(source => source.connectionId === input.sourceConnectionId)) throw new Error('This data source is not linked to the selected knowledge model.');
        const [row] = await this.db
            .insert(knowledgeVerifiedQueries)
            .values({
                knowledgeModelId: input.knowledgeModelId,
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
        await this.touchModel(input.knowledgeModelId);
        return row!;
    }

    async getVerifiedQuery(input: { organizationId: string; knowledgeModelId: string; id: string }) {
        await this.getModel(input);
        const [row] = await this.db
            .select()
            .from(knowledgeVerifiedQueries)
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
