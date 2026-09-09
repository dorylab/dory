import { index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { newEntityId } from '@dory/shared/id';
import { connections } from './connections';

export type SemanticDefinitionKind = 'entity' | 'metric' | 'measure' | 'dimension' | 'relationship';
export type SemanticDefinitionStatus = 'verified' | 'unverified';

export type SemanticDefinition = {
    id: string;
    name: string;
    kind: SemanticDefinitionKind;
    status: SemanticDefinitionStatus;
    sourceConnectionId: string;
    description?: string;
    aliases?: string[];
    source?: string;
    expression?: string;
    filters?: string[];
    timeDimension?: string;
    dimensions?: string[];
    from?: string;
    to?: string;
};

export type SemanticModelDocument = { definitions: SemanticDefinition[] };

export const semanticModels = pgTable(
    'semantic_models',
    {
        id: text('id').primaryKey().$defaultFn(() => `sem_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        name: text('name').notNull(),
        description: text('description'),
        businessContextMd: text('business_context_md').notNull().default(''),
        modelYaml: text('model_yaml').notNull().default('cubes: []\n'),
        modelJson: jsonb('model_json').$type<SemanticModelDocument>().notNull().default({ definitions: [] }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
    },
    table => [
        uniqueIndex('uidx_semantic_models_org_name').on(table.organizationId, table.name),
        index('idx_semantic_models_org_updated').on(table.organizationId, table.updatedAt),
    ],
);

export const semanticModelSources = pgTable(
    'semantic_model_sources',
    {
        semanticModelId: text('semantic_model_id').notNull().references(() => semanticModels.id, { onDelete: 'cascade' }),
        connectionId: text('connection_id').notNull().references(() => connections.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        primaryKey({ name: 'pk_semantic_model_sources', columns: [table.semanticModelId, table.connectionId] }),
        index('idx_semantic_model_sources_connection').on(table.connectionId),
    ],
);

export const semanticVerifiedQueries = pgTable(
    'semantic_verified_queries',
    {
        id: text('id').primaryKey().$defaultFn(() => `svq_${newEntityId()}`),
        semanticModelId: text('semantic_model_id').notNull().references(() => semanticModels.id, { onDelete: 'cascade' }),
        sourceConnectionId: text('source_connection_id').notNull().references(() => connections.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        question: text('question').notNull(),
        sql: text('sql').notNull(),
        description: text('description'),
        definitionIds: jsonb('definition_ids').$type<string[]>().notNull().default([]),
        sourceType: text('source_type').notNull().default('manual'),
        sourceId: text('source_id'),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
    },
    table => [
        index('idx_semantic_verified_queries_model_updated').on(table.semanticModelId, table.updatedAt),
        index('idx_semantic_verified_queries_connection').on(table.sourceConnectionId),
    ],
);

export type SemanticModel = typeof semanticModels.$inferSelect;
export type SemanticVerifiedQuery = typeof semanticVerifiedQueries.$inferSelect;
