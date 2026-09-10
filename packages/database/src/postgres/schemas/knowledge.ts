import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { newEntityId } from '@dory/shared/id';
import { connections } from './connections';

export type KnowledgeDefinitionKind = 'entity' | 'metric' | 'measure' | 'dimension' | 'relationship';
export type KnowledgeDefinitionStatus = 'verified' | 'unverified';

export type KnowledgeDefinition = {
    id: string;
    name: string;
    kind: KnowledgeDefinitionKind;
    status: KnowledgeDefinitionStatus;
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

export type KnowledgeModelDocument = { definitions: KnowledgeDefinition[] };

export const knowledgeModels = pgTable(
    'knowledge_models',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kn_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        name: text('name').notNull(),
        description: text('description'),
        businessContextMd: text('business_context_md').notNull().default(''),
        modelYaml: text('model_yaml').notNull().default('cubes: []\n'),
        modelJson: jsonb('model_json').$type<KnowledgeModelDocument>().notNull().default({ definitions: [] }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        uniqueIndex('uidx_knowledge_models_org_name').on(table.organizationId, table.name),
        index('idx_knowledge_models_org_updated').on(table.organizationId, table.updatedAt),
    ],
);

export const knowledgeModelSources = pgTable(
    'knowledge_model_sources',
    {
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        connectionId: text('connection_id')
            .notNull()
            .references(() => connections.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        primaryKey({ name: 'pk_knowledge_model_sources', columns: [table.knowledgeModelId, table.connectionId] }),
        index('idx_knowledge_model_sources_connection').on(table.connectionId),
    ],
);

export type KnowledgeSourceFormat = 'markdown' | 'yaml' | 'text';

export const knowledgeSources = pgTable(
    'knowledge_sources',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `ks_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        connectionId: text('connection_id').references(() => connections.id, { onDelete: 'set null' }),
        fileName: text('file_name').notNull(),
        format: text('format').$type<KnowledgeSourceFormat>().notNull(),
        contentText: text('content_text').notNull(),
        byteSize: integer('byte_size').notNull(),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        uniqueIndex('uidx_knowledge_sources_model_file').on(table.knowledgeModelId, table.fileName),
        index('idx_knowledge_sources_org_model').on(table.organizationId, table.knowledgeModelId),
        index('idx_knowledge_sources_connection').on(table.connectionId),
    ],
);

export const knowledgeVerifiedQueries = pgTable(
    'knowledge_verified_queries',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kvq_${newEntityId()}`),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        sourceConnectionId: text('source_connection_id')
            .notNull()
            .references(() => connections.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        question: text('question').notNull(),
        sql: text('sql').notNull(),
        description: text('description'),
        definitionIds: jsonb('definition_ids').$type<string[]>().notNull().default([]),
        sourceType: text('source_type').notNull().default('manual'),
        sourceId: text('source_id'),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        index('idx_knowledge_verified_queries_model_updated').on(table.knowledgeModelId, table.updatedAt),
        index('idx_knowledge_verified_queries_connection').on(table.sourceConnectionId),
    ],
);

export type KnowledgeModel = typeof knowledgeModels.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type KnowledgeVerifiedQuery = typeof knowledgeVerifiedQueries.$inferSelect;
