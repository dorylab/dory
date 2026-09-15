import { z } from 'zod';

export const knowledgeDefinitionSchema = z.object({
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

export const knowledgeDataSourceSchema = z.object({ connectionId: z.string(), name: z.string(), type: z.string(), engine: z.string() });
export const knowledgeSourceSummarySchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    knowledgeModelId: z.string(),
    connectionId: z.string().nullable(),
    fileName: z.string(),
    format: z.enum(['markdown', 'yaml', 'text']),
    byteSize: z.number().int().nonnegative(),
    createdBy: z.string().nullable(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
    connectorId: z.string().nullable(),
    connectorProvider: z.enum(['github']).nullable(),
    remotePath: z.string().nullable(),
});
export const knowledgeSourceSchema = knowledgeSourceSummarySchema.extend({ contentText: z.string() });
export const knowledgeModelOutputSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    businessContextMd: z.string(),
    modelYaml: z.string(),
    model: z.object({ definitions: z.array(knowledgeDefinitionSchema.extend({ id: z.string() })) }),
    dataSources: z.array(knowledgeDataSourceSchema),
    verifiedQueryCount: z.number().int().nonnegative(),
    knowledgeSourceCount: z.number().int().nonnegative(),
    readiness: z.object({
        status: z.enum(['ready', 'not_ready']),
        checks: z.object({ dataSource: z.boolean(), verifiedDefinition: z.boolean(), verifiedQuery: z.boolean() }),
    }),
    agentUnderstands: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(['entity', 'metric', 'measure', 'dimension', 'relationship']) })),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});

export const knowledgeAssetTypeSchema = z.enum(['definition', 'verified_query']);
export const knowledgeSourceRelationTypeSchema = z.enum(['provided', 'generated']);
export const knowledgeGraphSchema = z.object({
    queryDefinitionEdges: z.array(z.object({ queryId: z.string(), definitionId: z.string() })),
    sourceAssetEdges: z.array(
        z.object({
            sourceId: z.string(),
            assetType: knowledgeAssetTypeSchema,
            assetId: z.string(),
            relationType: knowledgeSourceRelationTypeSchema,
        }),
    ),
});

export const knowledgeVerifiedQuerySchema = z.object({
    id: z.string(),
    knowledgeModelId: z.string(),
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

export const knowledgeConnectorSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    knowledgeModelId: z.string(),
    provider: z.literal('github'),
    installationId: z.string(),
    repositoryId: z.string(),
    repositoryFullName: z.string(),
    defaultBranch: z.string(),
    rootPath: z.string(),
    status: z.enum(['pending', 'syncing', 'ready', 'error', 'disabled']),
    lastCommitSha: z.string().nullable(),
    lastSyncedAt: z.union([z.date(), z.string()]).nullable(),
    lastError: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});
