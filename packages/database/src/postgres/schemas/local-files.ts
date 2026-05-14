import { integer, text, timestamp, pgTable, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { newEntityId } from '@dory/shared/id';

export const fileAssets = pgTable(
    'file_assets',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        createdByUserId: text('created_by_user_id'),
        backend: text('backend').notNull(),
        sourceType: text('source_type').notNull(),
        path: text('path').notNull(),
        storageKey: text('storage_key'),
        sizeBytes: text('size_bytes'),
        mtimeMs: text('mtime_ms'),
        status: text('status').notNull().default('ready'),
        metadata: text('metadata').notNull().default('{}'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    t => [index('idx_file_assets_organization').on(t.organizationId), index('idx_file_assets_org_backend_path').on(t.organizationId, t.backend, t.path)],
);

export const datasets = pgTable(
    'datasets',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        createdByUserId: text('created_by_user_id'),
        connectionId: text('connection_id').notNull(),
        name: text('name').notNull(),
        schemaName: text('schema_name').notNull(),
        status: text('status').notNull().default('ready'),
        refreshStatus: text('refresh_status').notNull().default('idle'),
        lastRefreshAt: timestamp('last_refresh_at', { withTimezone: true }),
        lastRefreshError: text('last_refresh_error'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    t => [
        uniqueIndex('uniq_datasets_organization_schema')
            .on(t.organizationId, t.schemaName)
            .where(sql`${t.deletedAt} IS NULL`),
        index('idx_datasets_organization').on(t.organizationId),
        index('idx_datasets_connection').on(t.connectionId),
    ],
);

export const datasetRelations = pgTable(
    'dataset_relations',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        datasetId: text('dataset_id').notNull(),
        fileAssetId: text('file_asset_id').notNull(),
        sourceType: text('source_type').notNull(),
        sheetName: text('sheet_name'),
        relationName: text('relation_name').notNull(),
        mode: text('mode').notNull().default('virtual'),
        duckdbSchema: text('duckdb_schema').notNull(),
        duckdbRelation: text('duckdb_relation').notNull(),
        physicalTableName: text('physical_table_name'),
        sourceFingerprint: text('source_fingerprint'),
        lastSourceFingerprint: text('last_source_fingerprint'),
        schemaDriftStatus: text('schema_drift_status').notNull().default('unknown'),
        refreshStrategy: text('refresh_strategy').notNull().default('manual'),
        readSql: text('read_sql').notNull(),
        status: text('status').notNull().default('ready'),
        lastRefreshAt: timestamp('last_refresh_at', { withTimezone: true }),
        lastRefreshError: text('last_refresh_error'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    t => [
        uniqueIndex('uniq_dataset_relations_name')
            .on(t.datasetId, t.relationName)
            .where(sql`${t.deletedAt} IS NULL`),
        index('idx_dataset_relations_organization').on(t.organizationId),
        index('idx_dataset_relations_dataset').on(t.datasetId),
        index('idx_dataset_relations_file_asset').on(t.fileAssetId),
    ],
);

export const datasetRefreshOperations = pgTable(
    'dataset_refresh_operations',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        datasetId: text('dataset_id').notNull(),
        relationId: text('relation_id'),
        operationType: text('operation_type').notNull().default('refresh'),
        status: text('status').notNull().default('running'),
        reason: text('reason').notNull().default('manual'),
        sourceFingerprint: text('source_fingerprint'),
        previousSourceFingerprint: text('previous_source_fingerprint'),
        schemaDriftStatus: text('schema_drift_status').notNull().default('unknown'),
        error: text('error'),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
        finishedAt: timestamp('finished_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_dataset_refresh_ops_organization').on(t.organizationId),
        index('idx_dataset_refresh_ops_dataset').on(t.datasetId),
        index('idx_dataset_refresh_ops_relation').on(t.relationId),
        index('idx_dataset_refresh_ops_status').on(t.status),
    ],
);

export const datasetRelationColumns = pgTable(
    'dataset_relation_columns',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        datasetId: text('dataset_id').notNull(),
        relationId: text('relation_id').notNull(),
        columnName: text('column_name').notNull(),
        columnType: text('column_type').notNull(),
        nullable: text('nullable'),
        detectedSemantic: text('detected_semantic'),
        sampleValues: text('sample_values').notNull().default('[]'),
        summary: text('summary').notNull().default('{}'),
        ordinalPosition: integer('ordinal_position').notNull().default(0),
        refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        uniqueIndex('uniq_dataset_relation_columns_name').on(t.relationId, t.columnName),
        index('idx_dataset_relation_columns_organization').on(t.organizationId),
        index('idx_dataset_relation_columns_dataset').on(t.datasetId),
        index('idx_dataset_relation_columns_relation').on(t.relationId),
    ],
);
