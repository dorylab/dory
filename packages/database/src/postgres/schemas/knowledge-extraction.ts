import { newEntityId } from '@dory/shared/id';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { knowledgeConnectors, knowledgeModels, knowledgeSources } from './knowledge';

export type ExtractedKnowledge = {
    kind: 'metric' | 'business_rule';
    name: string;
    description: string;
    aliases: string[];
    sourceConnectionId: string | null;
    source?: string;
    expression?: string;
    filters?: string[];
    timeDimension?: string;
    unit?: string;
    scope?: string;
    applicationScope?: 'model' | 'data_source' | 'metrics';
    metricIds?: string[];
    applicableMetricNames?: string[];
    sharingEvidence?: string;
    specificConditions?: string[];
    ruleIds?: string[];
    ruleCandidateIds?: string[];
};
export type ExtractionEvidenceInput = { quote: string; sourceId: string; sourceHash: string; sourceTitle: string; sourceUrl: string | null };
export type ExtractedCandidate = { payload: ExtractedKnowledge; quotes: string[] };

export const knowledgeExtractionJobs = pgTable(
    'knowledge_extraction_jobs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kej_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        connectorId: text('connector_id')
            .notNull()
            .references(() => knowledgeConnectors.id, { onDelete: 'cascade' }),
        sourceId: text('source_id').references(() => knowledgeSources.id, { onDelete: 'set null' }),
        originalSourceId: text('original_source_id').notNull(),
        sourceHash: text('source_hash').notNull(),
        extractionVersion: integer('extraction_version').notNull().default(1),
        status: text('status').$type<'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled'>().notNull().default('queued'),
        attempts: integer('attempts').notNull().default(0),
        stagedOutput: jsonb('staged_output').$type<ExtractedCandidate[]>(),
        completedChunks: integer('completed_chunks').notNull().default(0),
        totalChunks: integer('total_chunks').notNull().default(0),
        leaseToken: text('lease_token'),
        leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
        availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
        error: text('error'),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('uidx_extraction_source_version').on(table.originalSourceId, table.sourceHash, table.extractionVersion),
        index('idx_extraction_queue').on(table.status, table.availableAt),
        index('idx_extraction_model').on(table.organizationId, table.knowledgeModelId),
    ],
);

export const knowledgeCandidates = pgTable(
    'knowledge_candidates',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kca_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        jobId: text('job_id').references(() => knowledgeExtractionJobs.id, { onDelete: 'set null' }),
        itemKey: text('item_key').notNull(),
        payloadHash: text('payload_hash').notNull(),
        payload: jsonb('payload').$type<ExtractedKnowledge>().notNull(),
        action: text('action').$type<'add' | 'update' | 'conflict' | 'source_changed' | 'remove'>().notNull().default('add'),
        status: text('status').$type<'pending' | 'approved' | 'rejected' | 'superseded'>().notNull().default('pending'),
        targetAssetId: text('target_asset_id'),
        targetRevision: text('target_revision'),
        reviewedBy: text('reviewed_by'),
        reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
        reviewNote: text('review_note'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('idx_candidates_model_status').on(table.organizationId, table.knowledgeModelId, table.status)],
);

export const knowledgeBusinessRules = pgTable(
    'knowledge_business_rules',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kbr_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        payload: jsonb('payload').$type<ExtractedKnowledge>().notNull(),
        applicationScope: text('application_scope').$type<'model' | 'data_source' | 'metrics'>().notNull().default('model'),
        status: text('status').$type<'active' | 'archived'>().notNull().default('active'),
        revision: integer('revision').notNull().default(1),
        updatedBy: text('updated_by'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('idx_business_rules_model').on(table.organizationId, table.knowledgeModelId)],
);

// Snapshots survive source removal. Live source edges alone cannot preserve review evidence.
export const knowledgeEvidence = pgTable(
    'knowledge_evidence',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `kev_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        candidateId: text('candidate_id')
            .notNull()
            .references(() => knowledgeCandidates.id, { onDelete: 'cascade' }),
        assetType: text('asset_type').$type<'definition' | 'business_rule'>(),
        assetId: text('asset_id'),
        sourceId: text('source_id').references(() => knowledgeSources.id, { onDelete: 'set null' }),
        originalSourceId: text('original_source_id').notNull(),
        sourceHash: text('source_hash').notNull(),
        sourceTitle: text('source_title').notNull(),
        sourceUrl: text('source_url'),
        quote: text('quote').notNull(),
        state: text('state').$type<'current' | 'outdated' | 'missing'>().notNull().default('current'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('idx_evidence_asset').on(table.knowledgeModelId, table.assetType, table.assetId), index('idx_evidence_source').on(table.originalSourceId)],
);

// Metric IDs belong to the versioned Ossie document and are validated under its row lock.
export const knowledgeMetricRules = pgTable(
    'knowledge_metric_rules',
    {
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        metricId: text('metric_id').notNull(),
        ruleId: text('rule_id')
            .notNull()
            .references(() => knowledgeBusinessRules.id, { onDelete: 'cascade' }),
    },
    table => [uniqueIndex('uidx_metric_rules').on(table.knowledgeModelId, table.metricId, table.ruleId)],
);

export const knowledgeOrganizationJobs = pgTable(
    'knowledge_organization_jobs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `koj_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        knowledgeModelId: text('knowledge_model_id')
            .notNull()
            .references(() => knowledgeModels.id, { onDelete: 'cascade' }),
        status: text('status').$type<'queued' | 'running' | 'completed' | 'failed' | 'blocked'>().notNull().default('queued'),
        generation: integer('generation').notNull().default(1),
        attempts: integer('attempts').notNull().default(0),
        leaseToken: text('lease_token'),
        leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
        availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
        error: text('error'),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [uniqueIndex('uidx_knowledge_organization_model').on(table.knowledgeModelId), index('idx_knowledge_organization_queue').on(table.status, table.availableAt)],
);
