import { z } from 'zod';

export const semanticDefinitionSchema = z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(160),
    kind: z.enum(['entity', 'metric', 'measure', 'dimension', 'relationship']),
    status: z.enum(['verified', 'unverified']).default('verified'),
    sourceConnectionId: z.string().min(1),
    description: z.string().max(4000).optional(),
    aliases: z.array(z.string().min(1).max(160)).max(30).optional(),
    source: z.string().max(300).optional(),
    expression: z.string().max(4000).optional(),
    filters: z.array(z.string().min(1).max(1000)).max(30).optional(),
    timeDimension: z.string().max(300).optional(),
    dimensions: z.array(z.string().min(1).max(300)).max(100).optional(),
    from: z.string().max(300).optional(),
    to: z.string().max(300).optional(),
});

export const semanticDataSourceSchema = z.object({ connectionId: z.string(), name: z.string(), type: z.string(), engine: z.string() });
export const semanticKnowledgeSourceSummarySchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    semanticModelId: z.string(),
    connectionId: z.string().nullable(),
    fileName: z.string(),
    format: z.enum(['markdown', 'yaml', 'text']),
    byteSize: z.number().int().nonnegative(),
    createdBy: z.string().nullable(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});
export const semanticKnowledgeSourceSchema = semanticKnowledgeSourceSummarySchema.extend({ contentText: z.string() });
export const semanticModelOutputSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    businessContextMd: z.string(),
    modelYaml: z.string(),
    model: z.object({ definitions: z.array(semanticDefinitionSchema.extend({ id: z.string() })) }),
    dataSources: z.array(semanticDataSourceSchema),
    verifiedQueryCount: z.number().int().nonnegative(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});

export const semanticVerifiedQuerySchema = z.object({
    id: z.string(),
    semanticModelId: z.string(),
    sourceConnectionId: z.string(),
    title: z.string(),
    question: z.string(),
    sql: z.string(),
    description: z.string().nullable(),
    definitionIds: z.array(z.string()),
    sourceType: z.string(),
    sourceId: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});
