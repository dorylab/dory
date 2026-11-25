import { isDesktopRuntime } from '@dory/shared/runtime';
import { z } from 'zod';

import { createGitHubInstallationUrl, githubAppConfigured, signGitHubConnectorState, verifyGitHubConnectorState } from '@/lib/server/github-app';
import { listGitHubDirectories, listGitHubRepositories } from '@/lib/server/github-connector';
import { getKnowledgeConnectorSyncRunner } from '@/lib/server/knowledge-connector-sync';
import { assertLinearAdmin, assertLinearAvailable } from '@/lib/server/linear-credentials';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import { documentGenerationTaskActions } from './document-generation-tasks';
import { documentGenerationActions } from './document-generation';
import { folderConnectorActions } from './folder-connectors';
import { linearKnowledgeActions } from './linear';
import {
    knowledgeConnectorSchema,
    knowledgeModelOutputSchema,
    knowledgeSourceRelationTypeSchema,
    knowledgeSourceSchema,
    knowledgeSourceSummarySchema,
    knowledgeVerifiedQuerySchema,
} from './shared';

const modelIdInput = z.object({ knowledgeModelId: z.string().min(1) });
const readActors = ['user', 'agent', 'mcp', 'automation'] as const;
const workspaceUiReadActors = ['user', 'automation'] as const;

export const knowledgeListAction = defineWebAction({
    id: 'knowledge.list',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ query: z.string().max(160).optional(), connectionId: z.string().optional() }),
    outputSchema: z.object({ models: z.array(knowledgeModelOutputSchema) }),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...workspaceUiReadActors],
    handler: async (ctx, input) => ({ models: await ctx.services.db.knowledge.listModels({ organizationId: ctx.organizationId, ...input }) }),
});

export const knowledgeGetAction = defineWebAction({
    id: 'knowledge.get',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput,
    outputSchema: knowledgeModelOutputSchema,
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...workspaceUiReadActors],
    handler: (ctx, input) => ctx.services.db.knowledge.getModel({ organizationId: ctx.organizationId, ...input }),
});

export const knowledgeCreateAction = defineWebAction({
    id: 'knowledge.create',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: z.object({ name: z.string().trim().min(1).max(160), description: z.string().max(4000).optional(), connectionIds: z.array(z.string().min(1)).min(1).max(50) }),
    outputSchema: knowledgeModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.createModel({ organizationId: ctx.organizationId, ...input }),
});

export const knowledgeUpdateAction = defineWebAction({
    id: 'knowledge.update',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        name: z.string().trim().min(1).max(160).optional(),
        description: z.string().max(4000).nullable().optional(),
        businessContextMd: z.string().max(100_000).optional(),
    }),
    outputSchema: knowledgeModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.updateModel({ organizationId: ctx.organizationId, ...input }),
});

export const knowledgeDeleteAction = defineWebAction({
    id: 'knowledge.delete',
    domain: 'knowledge',
    kind: 'command',
    risk: 'destructive',
    inputSchema: modelIdInput,
    outputSchema: z.object({ id: z.string() }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        await ctx.services.db.knowledge.deleteModel({ organizationId: ctx.organizationId, ...input });
        return { id: input.knowledgeModelId };
    },
});

export const knowledgeAddDataSourceAction = defineWebAction({
    id: 'knowledge.addDataSource',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ connectionId: z.string().min(1) }),
    outputSchema: knowledgeModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.addDataSource({ organizationId: ctx.organizationId, ...input }),
});

export const knowledgeRemoveDataSourceAction = defineWebAction({
    id: 'knowledge.removeDataSource',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ connectionId: z.string().min(1) }),
    outputSchema: knowledgeModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.removeDataSource({ organizationId: ctx.organizationId, ...input }),
});

export const knowledgeReplaceDataSourcesAction = defineWebAction({
    id: 'knowledge.replaceDataSources',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ connectionIds: z.array(z.string().min(1)).min(1).max(50) }),
    outputSchema: knowledgeModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.replaceDataSources({ organizationId: ctx.organizationId, ...input }),
});

const folderId = z.string().min(1).nullable();
const entryId = z.string().min(1);
const entryName = z.string().trim().min(1).max(240);
const entryKind = z.enum(['folder', 'document']);

const directoryRead = {
    domain: 'knowledge' as const,
    kind: 'query' as const,
    risk: 'read' as const,
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...workspaceUiReadActors],
};
const knowledgeNavigation = defineWebAction({
    ...directoryRead,
    id: 'knowledge.navigation',
    inputSchema: z.object({}),
    outputSchema: z.object({
        models: z.array(z.object({ id: entryId, name: z.string(), hasGuide: z.boolean() })),
        canWrite: z.boolean(),
        canManageLinear: z.boolean(),
        userId: z.string(),
    }),
    handler: async ctx => ({
        models: await ctx.services.db.knowledge.directory.models(ctx.organizationId),
        canWrite: Boolean(ctx.access.permissions.workspace.write),
        canManageLinear: ctx.access.role === 'owner' || ctx.access.role === 'admin',
        userId: ctx.userId,
    }),
});
const knowledgeQueryEntries = defineWebAction({
    ...directoryRead,
    id: 'knowledge.queryEntries',
    inputSchema: modelIdInput,
    outputSchema: z.object({ entries: z.array(z.object({ id: entryId, title: z.string(), question: z.string() })) }),
    handler: async (ctx, input) => ({ entries: await ctx.services.db.knowledge.directory.queryEntries({ organizationId: ctx.organizationId, ...input }) }),
});
const knowledgeSearchDirectory = defineWebAction({
    ...directoryRead,
    id: 'knowledge.searchDirectory',
    inputSchema: z.object({
        query: z.string().trim().min(1).max(240),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
        includeRules: z.boolean().default(false),
        queryFolderName: z.string().trim().min(1).max(120).default('Verified Queries'),
        guideName: z.string().trim().min(1).max(120).default('User guide'),
    }),
    outputSchema: z.object({
        items: z.array(
            z.object({ modelId: entryId, id: z.string(), kind: z.enum(['model', 'folder', 'document', 'source', 'query']), name: z.string(), path: z.array(z.string()) }),
        ),
        total: z.number(),
    }),
    handler: (ctx, input) => ctx.services.db.knowledge.directory.search(ctx.organizationId, input),
});

const knowledgeListDirectoryAction = defineWebAction({
    id: 'knowledge.listDirectory',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput,
    outputSchema: z.object({
        canWrite: z.boolean(),
        folders: z.array(z.object({ id: entryId, name: z.string(), parentId: folderId })),
        connectors: z.array(
            z.object({
                id: entryId,
                provider: z.enum(['github', 'linear', 'local', 'drive']),
                repositoryFullName: z.string().nullable(),
                rootPath: z.string(),
                displayName: z.string().nullable(),
                syncedFolders: z.array(z.object({ id: z.string(), parent: z.string(), name: z.string() })).nullable(),
                linearWorkspaceName: z.string().nullable(),
            }),
        ),
    }),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...workspaceUiReadActors],
    handler: async (ctx, input) => ({
        ...(await ctx.services.db.knowledge.directory.list({ organizationId: ctx.organizationId, ...input })),
        canWrite: Boolean(ctx.access.permissions.workspace.write),
    }),
});

const knowledgeChangeDirectoryAction = defineWebAction({
    id: 'knowledge.changeDirectory',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        change: z.discriminatedUnion('operation', [
            z.object({ operation: z.literal('create'), parentId: folderId, name: entryName }),
            z.object({ operation: z.literal('rename'), id: entryId, kind: entryKind, name: entryName }),
            z.object({ operation: z.literal('move'), id: entryId, kind: entryKind, parentId: folderId }),
            z.object({ operation: z.literal('delete'), id: entryId, kind: z.literal('folder') }),
        ]),
    }),
    outputSchema: z.object({ id: entryId }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) =>
        ctx.services.db.knowledge.directory.change(
            { organizationId: ctx.organizationId, knowledgeModelId: input.knowledgeModelId },
            input.change,
            Boolean(ctx.access.permissions.workspace.write),
        ),
});

export const knowledgeListKnowledgeSourcesAction = defineWebAction({
    id: 'knowledge.listKnowledgeSources',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput,
    outputSchema: z.object({ sources: z.array(knowledgeSourceSummarySchema) }),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...workspaceUiReadActors],
    handler: async (ctx, input) => ({ sources: await ctx.services.db.knowledge.listKnowledgeSources({ organizationId: ctx.organizationId, ...input }) }),
});

export const knowledgeGetKnowledgeSourceAction = defineWebAction({
    id: 'knowledge.getKnowledgeSource',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput.extend({ id: z.string().min(1), viewed: z.boolean().optional() }),
    outputSchema: knowledgeSourceSchema,
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...readActors],
    mcp: {
        name: 'get_knowledge_source',
        title: 'Get knowledge source',
        description: 'Read the full contents of one selected knowledge source by ID.',
    },
    handler: async (ctx, input) => {
        const source = await ctx.services.db.knowledge.getKnowledgeSource({ organizationId: ctx.organizationId, ...input });
        if (input.viewed && source.generationBatchId && source.createdBy !== ctx.userId && ctx.actor.type === 'user')
            await ctx.services.db.knowledge.recordDocumentUse(input.knowledgeModelId, ctx.userId, [input.id]);
        return source;
    },
});

export const knowledgeCreateKnowledgeSourceAction = defineWebAction({
    id: 'knowledge.createKnowledgeSource',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        fileName: z.string().min(1).max(240),
        contentText: z.string().max(10_000_000),
        folderId: folderId.optional(),
        connectionId: z.string().nullable().optional(),
    }),
    outputSchema: knowledgeSourceSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.createKnowledgeSource({ organizationId: ctx.organizationId, createdBy: ctx.userId, ...input }),
});

export const knowledgeUpdateKnowledgeSourceAction = defineWebAction({
    id: 'knowledge.updateKnowledgeSource',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        id: z.string().min(1),
        contentText: z.string().max(10_000_000),
        folderId: folderId.optional(),
        connectionId: z.string().nullable().optional(),
    }),
    outputSchema: knowledgeSourceSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.updateKnowledgeSource({ organizationId: ctx.organizationId, ...input }),
});

export const knowledgeDeleteKnowledgeSourceAction = defineWebAction({
    id: 'knowledge.deleteKnowledgeSource',
    domain: 'knowledge',
    kind: 'command',
    risk: 'destructive',
    inputSchema: modelIdInput.extend({ id: z.string().min(1) }),
    outputSchema: z.object({ id: z.string() }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        await ctx.services.db.knowledge.deleteKnowledgeSource({ organizationId: ctx.organizationId, ...input });
        return { id: input.id };
    },
});

export const knowledgeListVerifiedQueriesAction = defineWebAction({
    id: 'knowledge.listVerifiedQueries',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput.extend({ query: z.string().max(160).optional(), connectionId: z.string().optional() }),
    outputSchema: z.object({ queries: z.array(knowledgeVerifiedQuerySchema) }),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...workspaceUiReadActors],
    handler: async (ctx, input) => ({ queries: await ctx.services.db.knowledge.listVerifiedQueries({ organizationId: ctx.organizationId, ...input }) }),
});

export const knowledgeGetVerifiedQueryAction = defineWebAction({
    id: 'knowledge.getVerifiedQuery',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput.extend({ id: z.string().min(1) }),
    outputSchema: knowledgeVerifiedQuerySchema,
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...readActors],
    mcp: {
        name: 'get_knowledge_verified_query',
        title: 'Get verified query',
        description: 'Read one selected verified query, including its reviewed SQL.',
    },
    handler: (ctx, input) => ctx.services.db.knowledge.getVerifiedQuery({ organizationId: ctx.organizationId, ...input }),
});

export const knowledgeCreateVerifiedQueryAction = defineWebAction({
    id: 'knowledge.createVerifiedQuery',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        sourceConnectionId: z.string().min(1),
        title: z.string().min(1).max(240),
        question: z.string().min(1).max(4000),
        sql: z.string().min(1).max(100_000),
        description: z.string().max(4000).optional(),
        knowledgeSourceIds: z.array(z.string()).max(100).optional(),
        sourceType: z.string().max(80).optional(),
        sourceId: z.string().max(240).optional(),
    }),
    outputSchema: knowledgeVerifiedQuerySchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.createVerifiedQuery({ organizationId: ctx.organizationId, createdBy: ctx.userId, ...input }),
});

export const knowledgeUpdateVerifiedQueryAction = defineWebAction({
    id: 'knowledge.updateVerifiedQuery',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        id: z.string().min(1),
        title: z.string().min(1).max(240),
        question: z.string().min(1).max(4000),
        sql: z.string().min(1).max(100_000),
        description: z.string().max(4000).nullable().optional(),
        knowledgeSourceIds: z.array(z.string()).max(100).optional(),
    }),
    outputSchema: knowledgeVerifiedQuerySchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.updateVerifiedQuery({ organizationId: ctx.organizationId, updatedBy: ctx.userId, ...input }),
});

export const knowledgeListQuerySourcesAction = defineWebAction({
    id: 'knowledge.listQuerySources',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput.extend({ queryId: z.string().min(1) }),
    outputSchema: z.array(z.object({ sourceId: z.string(), relationType: knowledgeSourceRelationTypeSchema })),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.knowledge.listQuerySources({ organizationId: ctx.organizationId, ...input }),
});

export const knowledgeReplaceQuerySourcesAction = defineWebAction({
    id: 'knowledge.replaceQuerySources',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        queryId: z.string().min(1),
        sourceIds: z.array(z.string()).max(100),
    }),
    outputSchema: z.object({ ok: z.literal(true) }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        await ctx.services.db.knowledge.replaceQuerySources({ organizationId: ctx.organizationId, createdBy: ctx.userId, ...input });
        return { ok: true as const };
    },
});

export const knowledgeDeleteVerifiedQueryAction = defineWebAction({
    id: 'knowledge.deleteVerifiedQuery',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ id: z.string().min(1) }),
    outputSchema: z.object({ id: z.string() }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        await ctx.services.db.knowledge.deleteVerifiedQuery({ organizationId: ctx.organizationId, ...input });
        return { id: input.id };
    },
});

export const knowledgeSearchKnowledgeAction = defineWebAction({
    id: 'knowledge.searchKnowledge',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1), query: z.string().min(1).max(240) }),
    outputSchema: z.object({
        models: z.array(
            z.object({
                knowledgeModelId: z.string(),
                knowledgeModelName: z.string(),
                businessContext: z.string(),
                knowledgeSources: z.array(
                    z.object({
                        id: z.string(),
                        fileName: z.string(),
                        format: z.enum(['markdown', 'yaml', 'text']),
                        connectionId: z.string().nullable(),
                        sourceUrl: z.string().nullable(),
                    }),
                ),
            }),
        ),
    }),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: ['agent', 'mcp'],
    mcp: {
        name: 'search_knowledge',
        title: 'Search knowledge',
        description: 'Search knowledge candidates. Results are summaries; explicitly read a selected asset before using it.',
    },
    handler: async (ctx, input) => {
        const models = await ctx.services.db.knowledge.listModels({ organizationId: ctx.organizationId, connectionId: input.connectionId });
        const results = await Promise.all(
            models.map(async model => ({
                knowledgeModelId: model.id,
                knowledgeModelName: model.name,
                businessContext: model.businessContextMd,
                knowledgeSources: (
                    await ctx.services.db.knowledge.searchKnowledgeSources({
                        organizationId: ctx.organizationId,
                        knowledgeModelId: model.id,
                        connectionId: input.connectionId,
                        query: input.query,
                    })
                ).map(({ id, fileName, format, connectionId, sourceUrl }) => ({ id, fileName, format, connectionId, sourceUrl })),
            })),
        );
        return { models: results.filter(model => model.businessContext || model.knowledgeSources.length) };
    },
});

export const knowledgeSearchVerifiedQueriesAction = defineWebAction({
    id: 'knowledge.searchVerifiedQueries',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1), query: z.string().max(240).optional() }),
    outputSchema: z.object({
        queries: z.array(
            z.object({
                id: z.string(),
                knowledgeModelId: z.string(),
                knowledgeModelName: z.string(),
                sourceConnectionId: z.string(),
                title: z.string(),
                question: z.string(),
                description: z.string().nullable(),
            }),
        ),
    }),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: ['agent', 'mcp'],
    mcp: {
        name: 'search_knowledge_verified_queries',
        title: 'Search verified queries',
        description: 'Search verified query summaries. Explicitly read a selected query before using its SQL.',
    },
    handler: async (ctx, input) => {
        const models = await ctx.services.db.knowledge.listModels({ organizationId: ctx.organizationId, connectionId: input.connectionId });
        const groups = await Promise.all(
            models.map(async model =>
                (
                    await ctx.services.db.knowledge.listVerifiedQueries({
                        organizationId: ctx.organizationId,
                        knowledgeModelId: model.id,
                        connectionId: input.connectionId,
                        query: input.query,
                    })
                ).map(query => ({
                    id: query.id,
                    knowledgeModelId: query.knowledgeModelId,
                    knowledgeModelName: model.name,
                    sourceConnectionId: query.sourceConnectionId,
                    title: query.title,
                    question: query.question,
                    description: query.description,
                })),
            ),
        );
        return { queries: groups.flat().slice(0, 20) };
    },
});

const githubSessionInput = modelIdInput.extend({ installationId: z.string().regex(/^\d+$/), connectionState: z.string().min(20) });

function assertGitHubSession(ctx: { organizationId: string; userId: string }, input: z.infer<typeof githubSessionInput>) {
    const state = verifyGitHubConnectorState(input.connectionState);
    if (
        state.organizationId !== ctx.organizationId ||
        state.knowledgeModelId !== input.knowledgeModelId ||
        state.userId !== ctx.userId ||
        state.installationId !== input.installationId
    ) {
        throw new Error('This GitHub connection session does not belong to the current workspace.');
    }
}

export const knowledgeGetGitHubConnectorSetupAction = defineWebAction({
    id: 'knowledge.getGitHubConnectorSetup',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput,
    outputSchema: z.object({ configured: z.boolean(), manualOnly: z.boolean(), installUrl: z.string().url().nullable() }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        await ctx.services.db.knowledge.getModel({ organizationId: ctx.organizationId, ...input });
        if (!githubAppConfigured()) return { configured: false, manualOnly: isDesktopRuntime(), installUrl: null };
        const referer = ctx.services.req?.headers.get('referer');
        const returnPath = referer ? new URL(referer).pathname : '/';
        const state = signGitHubConnectorState({ organizationId: ctx.organizationId, knowledgeModelId: input.knowledgeModelId, userId: ctx.userId, returnPath });
        return { configured: true, manualOnly: isDesktopRuntime(), installUrl: createGitHubInstallationUrl(state) };
    },
});

export const knowledgeListGitHubRepositoriesAction = defineWebAction({
    id: 'knowledge.listGitHubRepositories',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: githubSessionInput,
    outputSchema: z.object({ repositories: z.array(z.object({ id: z.string(), fullName: z.string(), defaultBranch: z.string(), private: z.boolean() })) }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        assertGitHubSession(ctx, input);
        return { repositories: await listGitHubRepositories(input.installationId) };
    },
});

export const knowledgeListGitHubDirectoriesAction = defineWebAction({
    id: 'knowledge.listGitHubDirectories',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: githubSessionInput.extend({ repositoryId: z.string().min(1) }),
    outputSchema: z.object({ directories: z.array(z.string()) }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        assertGitHubSession(ctx, input);
        const repository = (await listGitHubRepositories(input.installationId)).find(item => item.id === input.repositoryId);
        if (!repository) throw new Error('The selected repository is not available to this GitHub App installation.');
        return { directories: await listGitHubDirectories(input.installationId, repository.fullName, repository.defaultBranch) };
    },
});

export const knowledgeCreateGitHubConnectorAction = defineWebAction({
    id: 'knowledge.createGitHubConnector',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: githubSessionInput.extend({ repositoryId: z.string().min(1), rootPath: z.string().max(2000) }),
    outputSchema: knowledgeConnectorSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        assertGitHubSession(ctx, input);
        const repository = (await listGitHubRepositories(input.installationId)).find(item => item.id === input.repositoryId);
        if (!repository) throw new Error('The selected repository is not available to this GitHub App installation.');
        const rootPath = input.rootPath.replace(/^\/+|\/+$/g, '');
        const directories = await listGitHubDirectories(input.installationId, repository.fullName, repository.defaultBranch);
        if (!directories.includes(rootPath)) throw new Error('The selected GitHub directory is unavailable.');
        const connector = await ctx.services.db.knowledge.createConnector({
            organizationId: ctx.organizationId,
            knowledgeModelId: input.knowledgeModelId,
            installationId: input.installationId,
            repositoryId: repository.id,
            repositoryFullName: repository.fullName,
            defaultBranch: repository.defaultBranch,
            rootPath,
            createdBy: ctx.userId,
        });
        await ctx.services.db.knowledge.queueConnectorSync({ connectorId: connector.id });
        getKnowledgeConnectorSyncRunner(ctx.services.db).wake();
        return knowledgeConnectorSchema.parse(connector);
    },
});

export const knowledgeListConnectorsAction = defineWebAction({
    id: 'knowledge.listConnectors',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput,
    outputSchema: z.object({ connectors: z.array(knowledgeConnectorSchema), canWrite: z.boolean(), canManageLinear: z.boolean() }),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: [...readActors],
    handler: async (ctx, input) => {
        const connectors = await ctx.services.db.knowledge.listConnectors({ organizationId: ctx.organizationId, ...input });
        if (githubAppConfigured()) getKnowledgeConnectorSyncRunner(ctx.services.db).wake();
        return {
            connectors: connectors.map(connector => knowledgeConnectorSchema.parse(connector)),
            canWrite: Boolean(ctx.access.permissions.workspace.write),
            canManageLinear: ctx.access.role === 'owner' || ctx.access.role === 'admin',
        };
    },
});

export const knowledgeSyncConnectorAction = defineWebAction({
    id: 'knowledge.syncConnector',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: z.object({ connectorId: z.string().min(1) }),
    outputSchema: z.object({ queued: z.boolean() }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const connector = await ctx.services.db.knowledge.getConnector({ organizationId: ctx.organizationId, ...input });
        if (connector.provider === 'linear') {
            assertLinearAdmin(ctx);
            assertLinearAvailable();
        }
        if (connector.provider === 'local') throw new Error('Select the local directory on this device to sync.');
        if (connector.status === 'disabled') throw new Error('Reconnect the knowledge connector before syncing.');
        await ctx.services.db.knowledge.queueConnectorSync({ connectorId: connector.id });
        getKnowledgeConnectorSyncRunner(ctx.services.db).wake();
        return { queued: true };
    },
});

export const knowledgeDeleteConnectorAction = defineWebAction({
    id: 'knowledge.deleteConnector',
    domain: 'knowledge',
    kind: 'command',
    risk: 'destructive',
    inputSchema: z.object({ connectorId: z.string().min(1) }),
    outputSchema: z.object({ id: z.string() }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const connector = await ctx.services.db.knowledge.getConnector({ organizationId: ctx.organizationId, ...input });
        if (connector.provider === 'linear') assertLinearAdmin(ctx);
        await ctx.services.db.knowledge.deleteConnector({ organizationId: ctx.organizationId, ...input });
        return { id: input.connectorId };
    },
});

export const knowledgeActions = [
    ...documentGenerationActions,
    ...documentGenerationTaskActions,
    ...linearKnowledgeActions,
    ...folderConnectorActions,
    knowledgeListAction,
    knowledgeGetAction,
    knowledgeCreateAction,
    knowledgeUpdateAction,
    knowledgeDeleteAction,
    knowledgeAddDataSourceAction,
    knowledgeRemoveDataSourceAction,
    knowledgeReplaceDataSourcesAction,
    knowledgeListDirectoryAction,
    knowledgeNavigation,
    knowledgeQueryEntries,
    knowledgeSearchDirectory,
    knowledgeChangeDirectoryAction,
    knowledgeListKnowledgeSourcesAction,
    knowledgeGetKnowledgeSourceAction,
    knowledgeCreateKnowledgeSourceAction,
    knowledgeUpdateKnowledgeSourceAction,
    knowledgeDeleteKnowledgeSourceAction,
    knowledgeListVerifiedQueriesAction,
    knowledgeGetVerifiedQueryAction,
    knowledgeCreateVerifiedQueryAction,
    knowledgeUpdateVerifiedQueryAction,
    knowledgeDeleteVerifiedQueryAction,
    knowledgeListQuerySourcesAction,
    knowledgeReplaceQuerySourcesAction,
    knowledgeSearchKnowledgeAction,
    knowledgeSearchVerifiedQueriesAction,
    knowledgeGetGitHubConnectorSetupAction,
    knowledgeListGitHubRepositoriesAction,
    knowledgeListGitHubDirectoriesAction,
    knowledgeCreateGitHubConnectorAction,
    knowledgeListConnectorsAction,
    knowledgeSyncConnectorAction,
    knowledgeDeleteConnectorAction,
];
