import { and, desc, eq, ilike, or } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import { semanticContexts, semanticVerifiedQueries, type SemanticDefinition, type SemanticModel } from '@dory/database/postgres/schemas';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';
import { parseDocument, stringify } from 'yaml';

export type SemanticContextDetail = {
    id: string;
    organizationId: string;
    connectionId: string;
    businessContextMd: string;
    modelYaml: string;
    model: SemanticModel;
    createdAt: Date;
    updatedAt: Date;
};

function normalizeDefinition(value: unknown): SemanticDefinition {
    const input = value as Record<string, unknown>;
    const kind = input.kind;
    if (!['entity', 'metric', 'measure', 'dimension', 'relationship'].includes(String(kind))) throw new Error('Unsupported semantic definition type.');
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new Error('A semantic definition name is required.');
    const stringList = (key: string) => (Array.isArray(input[key]) ? input[key].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : undefined);
    return {
        id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : `${String(kind)}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name,
        kind: kind as SemanticDefinition['kind'],
        ...(typeof input.description === 'string' && input.description.trim() ? { description: input.description.trim() } : {}),
        ...(stringList('aliases') ? { aliases: stringList('aliases') } : {}),
        ...(typeof input.source === 'string' && input.source.trim() ? { source: input.source.trim() } : {}),
        ...(typeof input.expression === 'string' && input.expression.trim() ? { expression: input.expression.trim() } : {}),
        ...(stringList('filters') ? { filters: stringList('filters') } : {}),
        ...(typeof input.timeDimension === 'string' && input.timeDimension.trim() ? { timeDimension: input.timeDimension.trim() } : {}),
        ...(stringList('dimensions') ? { dimensions: stringList('dimensions') } : {}),
        ...(typeof input.from === 'string' && input.from.trim() ? { from: input.from.trim() } : {}),
        ...(typeof input.to === 'string' && input.to.trim() ? { to: input.to.trim() } : {}),
    };
}

export function validateSemanticModel(value: unknown): SemanticModel {
    const raw = value as { definitions?: unknown };
    const definitions = Array.isArray(raw?.definitions) ? raw.definitions.map(normalizeDefinition) : [];
    const ids = new Set<string>();
    for (const definition of definitions) {
        if (ids.has(definition.id)) throw new Error(`Duplicate semantic definition: ${definition.id}`);
        ids.add(definition.id);
    }
    return { definitions };
}

export function serializeSemanticModel(model: SemanticModel) {
    return stringify({ cubes: model.definitions.map(definition => ({ ...definition })) });
}

export function parseSemanticYaml(source: string): SemanticModel {
    const document = parseDocument(source);
    if (document.errors.length) throw new Error(document.errors[0]?.message ?? 'Invalid YAML.');
    const value = document.toJS() as { cubes?: unknown; definitions?: unknown };
    return validateSemanticModel({ definitions: value.definitions ?? value.cubes ?? [] });
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

    private toDetail(row: typeof semanticContexts.$inferSelect): SemanticContextDetail {
        return { ...row, model: validateSemanticModel(row.modelJson) };
    }

    async getOrCreate(input: { organizationId: string; connectionId: string }) {
        this.assertInited();
        const [row] = await this.db.insert(semanticContexts).values(input).onConflictDoNothing().returning();
        if (row) return this.toDetail(row);
        const [existing] = await this.db.select().from(semanticContexts).where(and(eq(semanticContexts.organizationId, input.organizationId), eq(semanticContexts.connectionId, input.connectionId))).limit(1);
        if (!existing) throw new DatabaseError('Semantic context could not be created.', 500);
        return this.toDetail(existing);
    }

    async list(organizationId: string): Promise<SemanticContextDetail[]> {
        this.assertInited();
        const rows = await this.db.select().from(semanticContexts).where(eq(semanticContexts.organizationId, organizationId)).orderBy(desc(semanticContexts.updatedAt));
        return rows.map(row => this.toDetail(row));
    }

    async updateBusinessContext(input: { organizationId: string; connectionId: string; businessContextMd: string }) {
        const context = await this.getOrCreate(input);
        const [updated] = await this.db.update(semanticContexts).set({ businessContextMd: input.businessContextMd }).where(eq(semanticContexts.id, context.id)).returning();
        return this.toDetail(updated!);
    }

    async saveModel(input: { organizationId: string; connectionId: string; model: unknown }) {
        const context = await this.getOrCreate(input);
        const model = validateSemanticModel(input.model);
        const [updated] = await this.db.update(semanticContexts).set({ modelJson: model, modelYaml: serializeSemanticModel(model) }).where(eq(semanticContexts.id, context.id)).returning();
        return this.toDetail(updated!);
    }

    async importYaml(input: { organizationId: string; connectionId: string; source: string }) {
        return this.saveModel({ ...input, model: parseSemanticYaml(input.source) });
    }

    async listVerifiedQueries(input: { organizationId: string; connectionId: string; query?: string | null }) {
        const context = await this.getOrCreate(input);
        const query = input.query?.trim();
        const condition = query
            ? and(eq(semanticVerifiedQueries.semanticContextId, context.id), or(ilike(semanticVerifiedQueries.title, `%${query}%`), ilike(semanticVerifiedQueries.question, `%${query}%`)))
            : eq(semanticVerifiedQueries.semanticContextId, context.id);
        return this.db.select().from(semanticVerifiedQueries).where(condition).orderBy(desc(semanticVerifiedQueries.createdAt));
    }

    async createVerifiedQuery(input: { organizationId: string; connectionId: string; title: string; question: string; sql: string; description?: string | null; sourceType?: string | null; sourceId?: string | null; createdBy?: string | null }) {
        const context = await this.getOrCreate(input);
        const [row] = await this.db.insert(semanticVerifiedQueries).values({ semanticContextId: context.id, title: input.title.trim(), question: input.question.trim(), sql: input.sql.trim(), description: input.description?.trim() || null, sourceType: input.sourceType?.trim() || 'manual', sourceId: input.sourceId?.trim() || null, createdBy: input.createdBy ?? null }).returning();
        return row!;
    }

    async deleteVerifiedQuery(input: { organizationId: string; connectionId: string; id: string }) {
        const context = await this.getOrCreate(input);
        await this.db.delete(semanticVerifiedQueries).where(and(eq(semanticVerifiedQueries.id, input.id), eq(semanticVerifiedQueries.semanticContextId, context.id)));
    }
}
