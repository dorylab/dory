import { z } from 'zod';

export const semanticDefinitionKindSchema = z.enum(['entity', 'metric', 'measure', 'dimension', 'relationship']);
export const semanticDefinitionSchema = z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(160),
    kind: semanticDefinitionKindSchema,
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

export const semanticContextOutputSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    connectionId: z.string(),
    businessContextMd: z.string(),
    modelYaml: z.string(),
    model: z.object({ definitions: z.array(semanticDefinitionSchema.extend({ id: z.string() })) }),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});

export const semanticVerifiedQuerySchema = z.object({
    id: z.string(),
    semanticContextId: z.string(),
    title: z.string(),
    question: z.string(),
    sql: z.string(),
    description: z.string().nullable(),
    sourceType: z.string(),
    sourceId: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.union([z.date(), z.string()]),
});
