import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { newEntityId } from '@dory/shared/id';

export type SemanticDefinitionKind = 'entity' | 'metric' | 'measure' | 'dimension' | 'relationship';

export type SemanticDefinition = {
    id: string;
    name: string;
    kind: SemanticDefinitionKind;
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

export type SemanticModel = { definitions: SemanticDefinition[] };

export const semanticContexts = pgTable(
    'semantic_contexts',
    {
        id: text('id').primaryKey().$defaultFn(() => `sem_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        connectionId: text('connection_id').notNull(),
        businessContextMd: text('business_context_md').notNull().default(''),
        modelYaml: text('model_yaml').notNull().default('cubes: []\n'),
        modelJson: jsonb('model_json').$type<SemanticModel>().notNull().default({ definitions: [] }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$onUpdateFn(() => new Date()),
    },
    table => [
        uniqueIndex('uidx_semantic_contexts_org_connection').on(table.organizationId, table.connectionId),
        index('idx_semantic_contexts_org').on(table.organizationId),
    ],
);

export const semanticVerifiedQueries = pgTable(
    'semantic_verified_queries',
    {
        id: text('id').primaryKey().$defaultFn(() => `svq_${newEntityId()}`),
        semanticContextId: text('semantic_context_id').notNull(),
        title: text('title').notNull(),
        question: text('question').notNull(),
        sql: text('sql').notNull(),
        description: text('description'),
        sourceType: text('source_type').notNull().default('manual'),
        sourceId: text('source_id'),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('idx_semantic_verified_queries_context_created').on(table.semanticContextId, table.createdAt)],
);

export type SemanticContext = typeof semanticContexts.$inferSelect;
export type SemanticVerifiedQuery = typeof semanticVerifiedQueries.$inferSelect;
