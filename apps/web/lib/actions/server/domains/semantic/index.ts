import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import { semanticContextOutputSchema, semanticDefinitionSchema, semanticVerifiedQuerySchema } from './shared';

const contextInput = z.object({ connectionId: z.string().min(1) });

export const semanticGetAction = defineWebAction({
    id: 'semantic.get', domain: 'semantic', kind: 'query', risk: 'read', inputSchema: contextInput, outputSchema: semanticContextOutputSchema,
    permissions: readWorkspace, scopes: ['semantic:read'], actors: ['user', 'agent', 'mcp', 'automation'],
    handler: (ctx, input) => ctx.services.db.semanticContext.getOrCreate({ organizationId: ctx.organizationId, connectionId: input.connectionId }),
});

export const semanticListAction = defineWebAction({
    id: 'semantic.list', domain: 'semantic', kind: 'query', risk: 'read', inputSchema: z.object({}), outputSchema: z.object({ contexts: z.array(semanticContextOutputSchema) }),
    permissions: readWorkspace, scopes: ['semantic:read'], actors: ['user', 'agent', 'mcp', 'automation'],
    handler: async ctx => ({ contexts: await ctx.services.db.semanticContext.list(ctx.organizationId) }),
});

export const semanticUpdateBusinessContextAction = defineWebAction({
    id: 'semantic.updateBusinessContext', domain: 'semantic', kind: 'command', risk: 'write', requiresConfirmation: false,
    inputSchema: contextInput.extend({ businessContextMd: z.string().max(100_000) }), outputSchema: semanticContextOutputSchema,
    permissions: writeWorkspace, scopes: ['semantic:write'], actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.updateBusinessContext({ organizationId: ctx.organizationId, ...input }),
});

export const semanticSaveModelAction = defineWebAction({
    id: 'semantic.saveModel', domain: 'semantic', kind: 'command', risk: 'write', requiresConfirmation: false,
    inputSchema: contextInput.extend({ definitions: z.array(semanticDefinitionSchema).max(500) }), outputSchema: semanticContextOutputSchema,
    permissions: writeWorkspace, scopes: ['semantic:write'], actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.saveModel({ organizationId: ctx.organizationId, connectionId: input.connectionId, model: { definitions: input.definitions } }),
});

export const semanticImportYamlAction = defineWebAction({
    id: 'semantic.importYaml', domain: 'semantic', kind: 'command', risk: 'write', requiresConfirmation: false,
    inputSchema: contextInput.extend({ source: z.string().min(1).max(500_000) }), outputSchema: semanticContextOutputSchema,
    permissions: writeWorkspace, scopes: ['semantic:write'], actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.importYaml({ organizationId: ctx.organizationId, ...input }),
});

export const semanticListVerifiedQueriesAction = defineWebAction({
    id: 'semantic.listVerifiedQueries', domain: 'semantic', kind: 'query', risk: 'read', inputSchema: contextInput.extend({ query: z.string().max(160).optional() }), outputSchema: z.object({ queries: z.array(semanticVerifiedQuerySchema) }),
    permissions: readWorkspace, scopes: ['semantic:read'], actors: ['user', 'agent', 'mcp', 'automation'],
    handler: async (ctx, input) => ({ queries: await ctx.services.db.semanticContext.listVerifiedQueries({ organizationId: ctx.organizationId, ...input }) }),
});

export const semanticCreateVerifiedQueryAction = defineWebAction({
    id: 'semantic.createVerifiedQuery', domain: 'semantic', kind: 'command', risk: 'write', requiresConfirmation: false,
    inputSchema: contextInput.extend({ title: z.string().min(1).max(240), question: z.string().min(1).max(4000), sql: z.string().min(1).max(100_000), description: z.string().max(4000).optional(), sourceType: z.string().max(80).optional(), sourceId: z.string().max(240).optional() }), outputSchema: semanticVerifiedQuerySchema,
    permissions: writeWorkspace, scopes: ['semantic:write'], actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.createVerifiedQuery({ organizationId: ctx.organizationId, createdBy: ctx.userId, ...input }),
});

export const semanticDeleteVerifiedQueryAction = defineWebAction({
    id: 'semantic.deleteVerifiedQuery', domain: 'semantic', kind: 'command', risk: 'write', requiresConfirmation: false,
    inputSchema: contextInput.extend({ id: z.string().min(1) }), outputSchema: z.object({ id: z.string() }), permissions: writeWorkspace, scopes: ['semantic:write'], actors: ['user'],
    handler: async (ctx, input) => { await ctx.services.db.semanticContext.deleteVerifiedQuery({ organizationId: ctx.organizationId, ...input }); return { id: input.id }; },
});

export const semanticSearchContextAction = defineWebAction({
    id: 'semantic.searchContext', domain: 'semantic', kind: 'query', risk: 'read', inputSchema: contextInput.extend({ query: z.string().min(1).max(240) }),
    outputSchema: z.object({ definitions: z.array(semanticDefinitionSchema.extend({ id: z.string() })), businessContext: z.string() }), permissions: readWorkspace, scopes: ['semantic:read'], actors: ['agent', 'mcp'],
    handler: async (ctx, input) => { const context = await ctx.services.db.semanticContext.getOrCreate({ organizationId: ctx.organizationId, connectionId: input.connectionId }); const needle = input.query.toLowerCase(); return { businessContext: context.businessContextMd, definitions: context.model.definitions.filter(item => [item.name, item.description, ...(item.aliases ?? [])].filter(Boolean).join(' ').toLowerCase().includes(needle)).slice(0, 20) }; },
});

export const semanticGetDefinitionAction = defineWebAction({
    id: 'semantic.getDefinition', domain: 'semantic', kind: 'query', risk: 'read', inputSchema: contextInput.extend({ id: z.string().min(1) }), outputSchema: semanticDefinitionSchema.extend({ id: z.string() }), permissions: readWorkspace, scopes: ['semantic:read'], actors: ['agent', 'mcp'],
    handler: async (ctx, input) => { const context = await ctx.services.db.semanticContext.getOrCreate({ organizationId: ctx.organizationId, connectionId: input.connectionId }); const definition = context.model.definitions.find(item => item.id === input.id); if (!definition) throw new Error('Semantic definition not found.'); return definition; },
});

export const semanticActions = [semanticGetAction, semanticListAction, semanticUpdateBusinessContextAction, semanticSaveModelAction, semanticImportYamlAction, semanticListVerifiedQueriesAction, semanticCreateVerifiedQueryAction, semanticDeleteVerifiedQueryAction, semanticSearchContextAction, semanticGetDefinitionAction];
