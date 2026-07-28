import { z } from 'zod';

import { SCHEMA_COMPARISON_OBJECT_TYPES } from '@dory/schema-compare';

const dateSchema = z.union([z.date(), z.string()]);
const nullableDateSchema = dateSchema.nullable();
const dialectFamilySchema = z.enum(['postgres', 'mysql', 'sqlite', 'clickhouse', 'duckdb', 'oracle', 'snowflake', 'sqlserver']);

export const comparisonEndpointSchema = z
    .object({
        connectionId: z.string().min(1),
        identityId: z.string().min(1).nullable().optional(),
        database: z.string().min(1),
    })
    .strict();

export const comparisonConfigurationInputSchema = z
    .object({
        name: z.string().trim().min(1).max(160),
        source: comparisonEndpointSchema,
        target: comparisonEndpointSchema,
        schemaFilter: z.array(z.string().trim().min(1)).max(100).optional(),
        objectTypes: z.array(z.enum(SCHEMA_COMPARISON_OBJECT_TYPES)).min(1).max(SCHEMA_COMPARISON_OBJECT_TYPES.length).optional(),
    })
    .strict();

export const comparisonSummarySchema = z
    .object({
        totalChanges: z.number().int().nonnegative(),
        breakingChanges: z.number().int().nonnegative(),
        added: z.number().int().nonnegative(),
        removed: z.number().int().nonnegative(),
        modified: z.number().int().nonnegative(),
        renamed: z.number().int().nonnegative(),
        highRisk: z.number().int().nonnegative(),
        mediumRisk: z.number().int().nonnegative(),
        lowRisk: z.number().int().nonnegative(),
        unknownRisk: z.number().int().nonnegative(),
        readiness: z.enum(['compatible', 'review_required', 'unsafe', 'unknown']),
    })
    .strict();

const coverageSchema = z
    .object({
        tables: z.enum(['complete', 'partial', 'unavailable', 'not_applicable']),
        columns: z.enum(['complete', 'partial', 'unavailable', 'not_applicable']),
        indexes: z.enum(['complete', 'partial', 'unavailable', 'not_applicable']),
        constraints: z.enum(['complete', 'partial', 'unavailable', 'not_applicable']),
        views: z.enum(['complete', 'partial', 'unavailable', 'not_applicable']),
        statistics: z.enum(['complete', 'partial', 'unavailable', 'not_applicable']),
    })
    .strict();

const aiReviewSchema = z
    .object({
        summary: z.string(),
        deploymentNotes: z.array(z.string()),
        risks: z.array(z.object({ changeId: z.string(), explanation: z.string() })),
        recommendations: z.array(z.string()),
        limitations: z.array(z.string()),
        generatedAt: z.string(),
    })
    .strict();

const configurationSnapshotSchema = z
    .object({
        version: z.literal(1),
        configurationVersion: z.number().int().positive(),
        name: z.string(),
        source: comparisonEndpointSchema,
        target: comparisonEndpointSchema,
        schemaFilter: z.array(z.string()),
        objectTypes: z.array(z.enum(SCHEMA_COMPARISON_OBJECT_TYPES)),
        dialectFamily: dialectFamilySchema,
    })
    .strict();

export const comparisonRunOutputSchema = z
    .object({
        id: z.string(),
        organizationId: z.string(),
        comparisonId: z.string(),
        createdByUserId: z.string(),
        actorType: z.enum(['user', 'agent', 'mcp', 'automation']),
        workId: z.string().nullable(),
        status: z.enum(['running', 'success', 'failed']),
        configurationSnapshot: configurationSnapshotSchema,
        coverage: coverageSchema.nullable(),
        summary: comparisonSummarySchema.nullable(),
        sourceSnapshotHash: z.string().nullable(),
        targetSnapshotHash: z.string().nullable(),
        artifactRef: z.unknown().nullable(),
        resultSetId: z.string().nullable(),
        aiReviewStatus: z.enum(['pending', 'running', 'success', 'failed', 'unavailable', 'not_needed']),
        aiReview: aiReviewSchema.nullable(),
        aiReviewError: z.string().nullable(),
        failureCode: z.string().nullable(),
        failureMessage: z.string().nullable(),
        startedAt: dateSchema,
        updatedAt: dateSchema,
        completedAt: nullableDateSchema,
    })
    .strict();

export const comparisonOutputSchema = z
    .object({
        id: z.string(),
        organizationId: z.string(),
        createdByUserId: z.string(),
        name: z.string(),
        kind: z.literal('schema'),
        sourceEndpoint: comparisonEndpointSchema,
        targetEndpoint: comparisonEndpointSchema,
        schemaFilter: z.array(z.string()),
        objectTypes: z.array(z.enum(SCHEMA_COMPARISON_OBJECT_TYPES)),
        dialectFamily: dialectFamilySchema,
        configurationVersion: z.number().int().positive(),
        latestRunId: z.string().nullable(),
        latestSuccessfulRunId: z.string().nullable(),
        createdAt: dateSchema,
        updatedAt: dateSchema,
        latestRun: comparisonRunOutputSchema.nullable(),
        latestSuccessfulRun: comparisonRunOutputSchema.nullable(),
    })
    .strict();

export const comparisonChangeSchema = z
    .object({
        changeId: z.string(),
        objectType: z.enum(['table', 'column', 'index', 'constraint', 'view', 'materialized_view']),
        changeType: z.enum(['added', 'removed', 'modified', 'renamed']),
        schema: z.string().nullable(),
        table: z.string().nullable(),
        objectName: z.string(),
        objectPath: z.string(),
        attribute: z.string().nullable(),
        currentValue: z.string().nullable(),
        desiredValue: z.string().nullable(),
        risk: z.object({
            level: z.enum(['low', 'medium', 'high', 'unknown']),
            breaking: z.boolean(),
            code: z.string(),
            reason: z.string(),
        }),
        evidence: z
            .object({
                estimatedRows: z.number().nullable().optional(),
                tableBytes: z.number().nullable().optional(),
                indexScans: z.number().nullable().optional(),
                statisticsSource: z.enum(['catalog_estimate', 'catalog_exact', 'unknown']).optional(),
            })
            .optional(),
    })
    .strict();

export const comparisonMutationOutputSchema = z
    .object({
        comparison: comparisonOutputSchema,
        run: comparisonRunOutputSchema.nullable(),
        result: z
            .object({
                version: z.literal(1),
                family: dialectFamilySchema,
                currentHash: z.string(),
                desiredHash: z.string(),
                coverage: coverageSchema,
                summary: comparisonSummarySchema,
                changes: z.array(comparisonChangeSchema),
                warnings: z.array(z.string()),
            })
            .nullable(),
        topChanges: z.array(comparisonChangeSchema),
    })
    .strict();
