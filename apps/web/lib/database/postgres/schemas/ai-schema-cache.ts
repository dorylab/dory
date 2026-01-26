import { newEntityId } from '@/lib/id';
import {
    pgTable,
    text,
    integer,
    jsonb,
    timestamp,
    index,
    uniqueIndex,
} from 'drizzle-orm/pg-core';

export const aiSchemaCache = pgTable(
    'ai_schema_cache',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),

        // Multi-tenant isolation
        teamId: text('team_id').notNull(),

        // Multi-connection isolation
        connectionId: text('connection_id').notNull(),

        // Lakehouse isolation: Iceberg/Hive/Delta require catalog
        catalog: text('catalog').notNull().default('default'),

        // database/schema
        databaseName: text('database_name'),
        tableName: text('table_name'),

        // Cached feature: column_tagging / table_overview ...
        feature: text('feature').notNull(),

        dbType: text('db_type'),

        // Schema hash → detect structural changes
        schemaHash: text('schema_hash').notNull(),

        // Model used
        model: text('model').notNull(),

        // Prompt version (manual cache invalidation)
        promptVersion: integer('prompt_version').notNull().default(1),

        // Cached payload (column tags / overview / explain summary, etc.)
        payload: jsonb('payload').notNull(),

        createdAt: timestamp('created_at', {
            withTimezone: true,
            mode: 'string',
        })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date().toISOString()),
    },
    (table) => ({
        // Unique cache key: includes all dimensions
        uniqCache: uniqueIndex(
            'uniq_ai_cache_team_conn_catalog_feature_schema_model_prompt',
        ).on(
            table.teamId,
            table.connectionId,
            table.catalog,
            table.feature,
            table.schemaHash,
            table.model,
            table.promptVersion,
        ),

        idxTeamConn: index('idx_ai_cache_team_conn').on(
            table.teamId,
            table.connectionId,
        ),

        idxCatalogDbTable: index('idx_ai_cache_catalog_db_table').on(
            table.catalog,
            table.databaseName,
            table.tableName,
        ),

        idxSchemaHash: index('idx_ai_cache_schema_hash').on(table.schemaHash),
    }),
);
