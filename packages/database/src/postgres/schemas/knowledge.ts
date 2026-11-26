import type {
    CreatedDocument,
    DocumentDraft,
    DocumentGenerationInput,
    DocumentGenerationPhase,
    DocumentGenerationStatus,
    SchemaEvidence,
} from '@dory/shared/types/knowledge-document-draft';
import { newEntityId } from '@dory/shared/id';
import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, index, integer, jsonb, pgTable, pgView, foreignKey, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { savedQueries } from './saved-queries';
import { connections } from './connections';

export type KnowledgeSourceRelationType = 'provided' | 'generated';

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
export type KnowledgeConnectorProvider = 'github' | 'linear' | 'local' | 'drive';
export type KnowledgeConnectorStatus = 'pending' | 'syncing' | 'ready' | 'error' | 'disabled';
export type KnowledgeConnectorSyncJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export const knowledgeLinearCredentials = pgTable(
    'knowledge_linear_credentials',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `klc_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        workspaceId: text('workspace_id').notNull(),
        workspaceName: text('workspace_name').notNull(),
        apiKeyEncrypted: text('api_key_encrypted').notNull(),
        status: text('status').$type<'active' | 'invalid'>().notNull().default('active'),
        version: integer('version').notNull().default(1),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [uniqueIndex('uidx_knowledge_linear_credentials_org_workspace').on(table.organizationId, table.workspaceId)],
);

export const knowledgeConnectors = pgTable(
    'knowledge_connectors',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kc_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        provider: text('provider').$type<KnowledgeConnectorProvider>().notNull(),
        displayName: text('display_name'),
        syncedFolders: jsonb('synced_folders').$type<{ id: string; parent: string; name: string }[]>(),
        driveFolderId: text('drive_folder_id'),
        driveRefreshTokenEncrypted: text('drive_refresh_token_encrypted'),
        installationId: text('installation_id'),
        repositoryId: text('repository_id'),
        repositoryFullName: text('repository_full_name'),
        defaultBranch: text('default_branch'),
        rootPath: text('root_path').notNull().default(''),
        credentialId: text('credential_id').references(() => knowledgeLinearCredentials.id),
        linearWorkspaceId: text('linear_workspace_id'),
        linearWorkspaceName: text('linear_workspace_name'),
        projectIds: jsonb('project_ids').$type<string[]>().notNull().default([]),
        configRevision: integer('config_revision').notNull().default(0),
        nextSyncAt: timestamp('next_sync_at', { withTimezone: true }).notNull().defaultNow(),
        status: text('status').$type<KnowledgeConnectorStatus>().notNull().default('pending'),
        lastCommitSha: text('last_commit_sha'),
        lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
        lastError: text('last_error'),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        uniqueIndex('uidx_knowledge_connectors_model_repo_path').on(table.knowledgeModelId, table.provider, table.repositoryId, table.rootPath),
        uniqueIndex('uidx_knowledge_connectors_model_linear_workspace').on(table.knowledgeModelId, table.provider, table.linearWorkspaceId),
        index('idx_knowledge_connectors_org_model').on(table.organizationId, table.knowledgeModelId),
        index('idx_knowledge_connectors_installation_repo').on(table.installationId, table.repositoryId),
    ],
);

export const knowledgeDriveAuthorizations = pgTable('knowledge_drive_authorizations', {
    id: text('id').primaryKey(),
    state: text('state').unique(),
    organizationId: text('organization_id').notNull(),
    knowledgeModelId: text('knowledge_model_id')
        .notNull()
        .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    verifier: text('verifier').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const knowledgeFolders = pgTable(
    'knowledge_folders',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kf_${newEntityId()}`),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        parentId: text('parent_id').references((): AnyPgColumn => knowledgeFolders.id),
        name: text('name').notNull(),
    },
    table => [uniqueIndex('uidx_knowledge_folders_sibling').on(table.knowledgeModelId, sql`coalesce(${table.parentId}, '')`, table.name)],
);

export const knowledgeDocumentBatches = pgTable('knowledge_document_batches', {
    id: text('id').primaryKey(),
    knowledgeModelId: text('knowledge_model_id')
        .notNull()
        .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    elapsedMs: integer('elapsed_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    firstPeerUseAt: timestamp('first_peer_use_at', { withTimezone: true }),
    documents: jsonb('documents').$type<CreatedDocument[]>().notNull().default([]),
});

export const knowledgeDocumentGenerationTasks = pgTable(
    'knowledge_document_generation_tasks',
    {
        id: text('id').primaryKey(),
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        createdBy: text('created_by').notNull(),
        input: jsonb('input').$type<DocumentGenerationInput>().notNull(),
        folderId: text('folder_id'),
        status: text('status').$type<DocumentGenerationStatus>().notNull().default('queued'),
        phase: text('phase').$type<DocumentGenerationPhase>().notNull().default('queued'),
        completedTables: integer('completed_tables').notNull().default(0),
        totalTables: integer('total_tables').notNull(),
        draft: jsonb('draft').$type<DocumentDraft>(),
        error: text('error'),
        executionContext: text('execution_context'),
        submissionId: text('submission_id').notNull(),
        attempts: integer('attempts').notNull().default(0),
        leaseToken: text('lease_token'),
        leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        documents: jsonb('documents').$type<CreatedDocument[]>().notNull().default([]),
    },
    table => [
        index('idx_document_generation_owner').on(table.organizationId, table.createdBy, table.createdAt),
        index('idx_document_generation_queue').on(table.status, table.createdAt),
    ],
);

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
        folderId: text('folder_id').references(() => knowledgeFolders.id),
        generationBatchId: text('generation_batch_id').references(() => knowledgeDocumentBatches.id),
        schemaEvidence: jsonb('schema_evidence').$type<SchemaEvidence & { connectionId: string }>(),
        systemRole: text('system_role').$type<'analysis_rules'>(),
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
        uniqueIndex('uidx_knowledge_sources_analysis_rules')
            .on(table.knowledgeModelId)
            .where(sql`${table.systemRole} = 'analysis_rules'`),
        check(
            'knowledge_sources_system_role_check',
            sql`${table.systemRole} IS NULL OR (${table.systemRole} = 'analysis_rules' AND ${table.fileName} = 'RULES.md' AND ${table.format} = 'markdown' AND ${table.folderId} IS NULL AND ${table.connectionId} IS NULL)`,
        ),
        uniqueIndex('uidx_knowledge_sources_folder_file').on(table.knowledgeModelId, sql`coalesce(${table.folderId}, '')`, table.fileName),
        index('idx_knowledge_sources_org_model').on(table.organizationId, table.knowledgeModelId),
        index('idx_knowledge_sources_connection').on(table.connectionId),
    ],
);

export const knowledgeConnectorItems = pgTable(
    'knowledge_connector_items',
    {
        connectorId: text('connector_id')
            .notNull()
            .references(() => knowledgeConnectors.id, { onDelete: 'cascade' }),
        knowledgeSourceId: text('knowledge_source_id')
            .notNull()
            .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
        remotePath: text('remote_path').notNull(),
        remoteTitle: text('remote_title'),
        folderTrail: jsonb('folder_trail').$type<{ id: string; name: string }[]>(),
        projectId: text('project_id'),
        projectName: text('project_name'),
        remoteSha: text('remote_sha').notNull(),
        sourceUrl: text('source_url'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        primaryKey({ name: 'pk_knowledge_connector_items', columns: [table.connectorId, table.remotePath] }),
        uniqueIndex('uidx_knowledge_connector_items_source').on(table.knowledgeSourceId),
    ],
);

export const knowledgeConnectorSyncJobs = pgTable(
    'knowledge_connector_sync_jobs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `ksj_${newEntityId()}`),
        connectorId: text('connector_id')
            .notNull()
            .references(() => knowledgeConnectors.id, { onDelete: 'cascade' }),
        status: text('status').$type<KnowledgeConnectorSyncJobStatus>().notNull().default('queued'),
        targetSha: text('target_sha'),
        attempts: integer('attempts').notNull().default(0),
        leaseToken: text('lease_token'),
        availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
        error: text('error'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        index('idx_knowledge_connector_sync_jobs_status_created').on(table.status, table.createdAt),
        index('idx_knowledge_connector_sync_jobs_connector').on(table.connectorId),
    ],
);

export const knowledgeQueryMemberships = pgTable(
    'knowledge_query_memberships',
    {
        id: text('id')
            .notNull()
            .$defaultFn(() => `kvq_${newEntityId()}`),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        sourceConnectionId: text('source_connection_id')
            .notNull()
            .references(() => connections.id, { onDelete: 'cascade' }),
        savedQueryId: text('saved_query_id')
            .notNull()
            .references(() => savedQueries.id, { onDelete: 'cascade' }),
        question: text('question').notNull(),
        sourceType: text('source_type').notNull().default('manual'),
        sourceId: text('source_id'),
        createdBy: text('created_by'),
        updatedBy: text('updated_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        primaryKey({ columns: [table.knowledgeModelId, table.id] }),
        uniqueIndex('uq_memberships_model_query').on(table.knowledgeModelId, table.savedQueryId),
        index('idx_memberships_saved_query').on(table.savedQueryId),
    ],
);

export const knowledgeVerifiedQueries = pgView('knowledge_verified_query_details', {
    id: text('id').notNull(),
    savedQueryId: text('saved_query_id').notNull(),
    knowledgeModelId: text('knowledge_model_id').notNull(),
    sourceConnectionId: text('source_connection_id').notNull(),
    title: text('title').notNull(),
    question: text('question').notNull(),
    sql: text('sql').notNull(),
    description: text('description'),
    revision: integer('revision').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id'),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}).existing();

export const knowledgeQuerySources = pgTable(
    'knowledge_query_sources',
    {
        knowledgeSourceId: text('knowledge_source_id')
            .notNull()
            .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
        knowledgeModelId: text('knowledge_model_id').notNull(),
        queryId: text('query_id').notNull(),
        relationType: text('relation_type').$type<KnowledgeSourceRelationType>().notNull(),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        foreignKey({ columns: [table.knowledgeModelId, table.queryId], foreignColumns: [knowledgeQueryMemberships.knowledgeModelId, knowledgeQueryMemberships.id] }).onDelete(
            'cascade',
        ),
        primaryKey({ name: 'pk_knowledge_query_sources', columns: [table.knowledgeSourceId, table.queryId] }),
        index('idx_knowledge_query_sources_query').on(table.queryId),
    ],
);

export type KnowledgeModel = typeof knowledgeModels.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type KnowledgeConnector = typeof knowledgeConnectors.$inferSelect;
export type KnowledgeVerifiedQuery = typeof knowledgeVerifiedQueries.$inferSelect;
export type KnowledgeQuerySource = typeof knowledgeQuerySources.$inferSelect;
