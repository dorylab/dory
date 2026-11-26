import { z } from 'zod';

export const knowledgeDataSourceSchema = z.object({ connectionId: z.string(), name: z.string(), type: z.string(), engine: z.string() });
export const knowledgeSourceSummarySchema = z.object({
    systemRole: z.literal('analysis_rules').nullable(),
    id: z.string(),
    organizationId: z.string(),
    knowledgeModelId: z.string(),
    connectionId: z.string().nullable(),
    folderId: z.string().nullable(),
    projectId: z.string().nullable(),
    projectName: z.string().nullable(),
    fileName: z.string(),
    format: z.enum(['markdown', 'yaml', 'text']),
    byteSize: z.number().int().nonnegative(),
    createdBy: z.string().nullable(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
    connectorId: z.string().nullable(),
    connectorProvider: z.enum(['github', 'linear', 'local', 'drive']).nullable(),
    sourceUrl: z.string().nullable(),
    remotePath: z.string().nullable(),
    remoteTitle: z.string().nullish(),
    folderTrail: z.array(z.object({ id: z.string(), name: z.string() })).nullish(),
});
export const knowledgeSourceSchema = knowledgeSourceSummarySchema.extend({ contentText: z.string(), remoteRevision: z.string().nullable() });
export const knowledgeModelOutputSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    businessContextMd: z.string(),
    dataSources: z.array(knowledgeDataSourceSchema),
    verifiedQueryCount: z.number().int().nonnegative(),
    knowledgeSourceCount: z.number().int().nonnegative(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});

export const knowledgeSourceRelationTypeSchema = z.enum(['provided', 'generated']);
export const knowledgeVerifiedQuerySchema = z.object({
    savedQueryId: z.string(),
    revision: z.number(),
    id: z.string(),
    knowledgeModelId: z.string(),
    sourceConnectionId: z.string(),
    title: z.string(),
    question: z.string(),
    sql: z.string(),
    description: z.string().nullable(),
    sourceType: z.string(),
    sourceId: z.string().nullable(),
    createdBy: z.string().nullable(),
    updatedBy: z.string().nullable(),
    updatedByName: z.string().nullable(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});

const knowledgeConnectorCommonSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    knowledgeModelId: z.string(),
    status: z.enum(['pending', 'syncing', 'ready', 'error', 'disabled']),
    lastCommitSha: z.string().nullable(),
    lastSyncedAt: z.union([z.date(), z.string()]).nullable(),
    lastError: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});

export const knowledgeConnectorSchema = z.discriminatedUnion('provider', [
    knowledgeConnectorCommonSchema.extend({ provider: z.literal('drive'), displayName: z.string(), driveFolderId: z.string() }),
    knowledgeConnectorCommonSchema.extend({ provider: z.literal('local'), displayName: z.string(), configRevision: z.number() }),
    knowledgeConnectorCommonSchema.extend({
        provider: z.literal('github'),
        installationId: z.string(),
        repositoryId: z.string(),
        repositoryFullName: z.string(),
        defaultBranch: z.string(),
        rootPath: z.string(),
    }),
    knowledgeConnectorCommonSchema.extend({
        provider: z.literal('linear'),
        credentialId: z.string().nullable(),
        linearWorkspaceId: z.string(),
        linearWorkspaceName: z.string(),
        projectIds: z.array(z.string()),
        projectNames: z.array(z.string()).optional(),
    }),
]);
