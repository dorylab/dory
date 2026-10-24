import { newEntityId } from '@dory/shared/id';
import type { KnowledgeDefinitionStatus } from '@dory/shared/types/knowledge';
import { OSSIE_VERSION, type OssieDataType, type OssieDialect, type OssieVersion } from '@dory/shared/types/ossie';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { connections } from './connections';

export { OSSIE_VERSION, type OssieDataType, type OssieDialect, type OssieVersion } from '@dory/shared/types/ossie';

export type KnowledgeDefinitionKind = 'entity' | 'metric' | 'measure' | 'dimension' | 'relationship';
export type { KnowledgeDefinitionStatus } from '@dory/shared/types/knowledge';
export { isPublishedDefinition } from '@dory/shared/types/knowledge';

export type KnowledgeAssetType = 'definition' | 'verified_query' | 'business_rule';
export type KnowledgeSourceRelationType = 'provided' | 'generated';

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
    fromColumns?: string[];
    toColumns?: string[];
    aiContext?: OssieAiContext;
    dialect?: OssieDialect;
    datatype?: OssieDataType;
};

export type KnowledgeModelDocument = { definitions: KnowledgeDefinition[] };

export type OssieAiContext =
    | string
    | {
          instructions?: string;
          synonyms?: string[];
          examples?: string[];
          [key: string]: unknown;
      };
export type OssieCustomExtension = { vendor_name: string; data: string };
export type OssieExpression = { dialects: Array<{ dialect: OssieDialect; expression: string }> };
export type OssieField = {
    name: string;
    expression: OssieExpression;
    datatype?: OssieDataType;
    dimension?: { is_time?: boolean };
    label?: string;
    description?: string;
    ai_context?: OssieAiContext;
    custom_extensions?: OssieCustomExtension[];
};
export type OssieDataset = {
    name: string;
    source: string;
    primary_key?: string[];
    unique_keys?: string[][];
    description?: string;
    ai_context?: OssieAiContext;
    fields?: OssieField[];
    custom_extensions?: OssieCustomExtension[];
};
export type OssieMetric = {
    name: string;
    expression: OssieExpression;
    datatype?: OssieDataType;
    description?: string;
    ai_context?: OssieAiContext;
    custom_extensions?: OssieCustomExtension[];
};
export type OssieRelationship = {
    name: string;
    from: string;
    to: string;
    from_columns: string[];
    to_columns: string[];
    ai_context?: OssieAiContext;
    custom_extensions?: OssieCustomExtension[];
};
export type OssieSemanticModel = {
    name: string;
    description?: string;
    ai_context?: OssieAiContext;
    datasets: OssieDataset[];
    relationships?: OssieRelationship[];
    metrics?: OssieMetric[];
    custom_extensions?: OssieCustomExtension[];
};
export type OssieDocument = OssieSemanticModel & {
    version: OssieVersion;
};

export const EMPTY_OSSIE_DOCUMENT: OssieDocument = {
    version: OSSIE_VERSION,
    name: 'untitled_model',
    datasets: [{ name: 'untitled_dataset', source: '__unconfigured__' }],
    relationships: [],
    metrics: [],
};

export const EMPTY_OSSIE_YAML = `version: ${OSSIE_VERSION}\nname: untitled_model\ndatasets:\n  - name: untitled_dataset\n    source: __unconfigured__\nrelationships: []\nmetrics: []\n`;

export const knowledgeModels = pgTable(
    'knowledge_models',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kn_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        name: text('name').notNull(),
        description: text('description'),
        publicationMode: text('publication_mode').$type<'review' | 'automatic'>().notNull().default('review'),
        publicationEpoch: integer('publication_epoch').notNull().default(0),
        businessContextMd: text('business_context_md').notNull().default(''),
        modelYaml: text('model_yaml').notNull().default(EMPTY_OSSIE_YAML),
        modelJson: jsonb('model_json').$type<OssieDocument>().notNull().default(EMPTY_OSSIE_DOCUMENT),
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
export type KnowledgeConnectorProvider = 'github' | 'linear';
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
        autoExtract: boolean('auto_extract').notNull().default(false),
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
        updatedBy: text('updated_by'),
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

export const knowledgeAssetSources = pgTable(
    'knowledge_asset_sources',
    {
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        knowledgeSourceId: text('knowledge_source_id')
            .notNull()
            .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
        assetType: text('asset_type').$type<KnowledgeAssetType>().notNull(),
        assetId: text('asset_id').notNull(),
        relationType: text('relation_type').$type<KnowledgeSourceRelationType>().notNull(),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        primaryKey({ name: 'pk_knowledge_asset_sources', columns: [table.knowledgeSourceId, table.assetType, table.assetId] }),
        index('idx_knowledge_asset_sources_model_asset').on(table.knowledgeModelId, table.assetType, table.assetId),
    ],
);

export type KnowledgeModel = typeof knowledgeModels.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type KnowledgeConnector = typeof knowledgeConnectors.$inferSelect;
export type KnowledgeVerifiedQuery = typeof knowledgeVerifiedQueries.$inferSelect;
export type KnowledgeAssetSource = typeof knowledgeAssetSources.$inferSelect;
