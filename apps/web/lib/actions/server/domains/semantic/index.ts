import { z } from 'zod';

import { generateText } from '@/lib/ai/gateway';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import { semanticDefinitionSchema, semanticModelOutputSchema, semanticVerifiedQuerySchema } from './shared';

const modelIdInput = z.object({ semanticModelId: z.string().min(1) });
const readActors = ['user', 'agent', 'mcp', 'automation'] as const;

export const semanticListAction = defineWebAction({
    id: 'semantic.list',
    domain: 'semantic',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ query: z.string().max(160).optional(), connectionId: z.string().optional() }),
    outputSchema: z.object({ models: z.array(semanticModelOutputSchema) }),
    permissions: readWorkspace,
    scopes: ['semantic:read'],
    actors: [...readActors],
    handler: async (ctx, input) => ({ models: await ctx.services.db.semanticContext.listModels({ organizationId: ctx.organizationId, ...input }) }),
});

export const semanticGetAction = defineWebAction({
    id: 'semantic.get',
    domain: 'semantic',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput,
    outputSchema: semanticModelOutputSchema,
    permissions: readWorkspace,
    scopes: ['semantic:read'],
    actors: [...readActors],
    handler: (ctx, input) => ctx.services.db.semanticContext.getModel({ organizationId: ctx.organizationId, ...input }),
});

export const semanticCreateAction = defineWebAction({
    id: 'semantic.create',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: z.object({ name: z.string().trim().min(1).max(160), description: z.string().max(4000).optional(), connectionIds: z.array(z.string().min(1)).min(1).max(50) }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.createModel({ organizationId: ctx.organizationId, ...input }),
});

export const semanticUpdateAction = defineWebAction({
    id: 'semantic.update',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        name: z.string().trim().min(1).max(160).optional(),
        description: z.string().max(4000).nullable().optional(),
        businessContextMd: z.string().max(100_000).optional(),
    }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.updateModel({ organizationId: ctx.organizationId, ...input }),
});

export const semanticDeleteAction = defineWebAction({
    id: 'semantic.delete',
    domain: 'semantic',
    kind: 'command',
    risk: 'destructive',
    inputSchema: modelIdInput,
    outputSchema: z.object({ id: z.string() }),
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        await ctx.services.db.semanticContext.deleteModel({ organizationId: ctx.organizationId, ...input });
        return { id: input.semanticModelId };
    },
});

export const semanticSaveDefinitionsAction = defineWebAction({
    id: 'semantic.saveDefinitions',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ definitions: z.array(semanticDefinitionSchema).max(500) }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.saveDefinitions({ organizationId: ctx.organizationId, ...input }),
});

export const semanticListDefinitionsAction = defineWebAction({
    id: 'semantic.listDefinitions',
    domain: 'semantic',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput,
    outputSchema: z.object({ definitions: z.array(semanticDefinitionSchema.extend({ id: z.string() })) }),
    permissions: readWorkspace,
    scopes: ['semantic:read'],
    actors: [...readActors],
    handler: async (ctx, input) => ({
        definitions: (await ctx.services.db.semanticContext.getModel({ organizationId: ctx.organizationId, ...input })).model.definitions,
    }),
});

export const semanticCreateDefinitionAction = defineWebAction({
    id: 'semantic.createDefinition',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ definition: semanticDefinitionSchema }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const model = await ctx.services.db.semanticContext.getModel({ organizationId: ctx.organizationId, semanticModelId: input.semanticModelId });
        const definition = { ...input.definition, id: input.definition.id ?? `${input.definition.kind}:${crypto.randomUUID()}` };
        return ctx.services.db.semanticContext.saveDefinitions({
            organizationId: ctx.organizationId,
            semanticModelId: input.semanticModelId,
            definitions: [...model.model.definitions, definition],
        });
    },
});

export const semanticUpdateDefinitionAction = defineWebAction({
    id: 'semantic.updateDefinition',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ definitionId: z.string().min(1), definition: semanticDefinitionSchema }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const model = await ctx.services.db.semanticContext.getModel({ organizationId: ctx.organizationId, semanticModelId: input.semanticModelId });
        if (!model.model.definitions.some(item => item.id === input.definitionId)) throw new Error('Semantic definition not found.');
        const definitions = model.model.definitions.map(item => (item.id === input.definitionId ? { ...input.definition, id: input.definitionId } : item));
        return ctx.services.db.semanticContext.saveDefinitions({ organizationId: ctx.organizationId, semanticModelId: input.semanticModelId, definitions });
    },
});

export const semanticDeleteDefinitionAction = defineWebAction({
    id: 'semantic.deleteDefinition',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ definitionId: z.string().min(1) }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const model = await ctx.services.db.semanticContext.getModel({ organizationId: ctx.organizationId, semanticModelId: input.semanticModelId });
        const definitions = model.model.definitions.filter(item => item.id !== input.definitionId);
        if (definitions.length === model.model.definitions.length) throw new Error('Semantic definition not found.');
        return ctx.services.db.semanticContext.saveDefinitions({ organizationId: ctx.organizationId, semanticModelId: input.semanticModelId, definitions });
    },
});

export const semanticImportYamlAction = defineWebAction({
    id: 'semantic.importYaml',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ source: z.string().min(1).max(500_000), fallbackSourceConnectionId: z.string().optional() }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.importYaml({ organizationId: ctx.organizationId, ...input }),
});

export const semanticAddSourceAction = defineWebAction({
    id: 'semantic.addSource',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ connectionId: z.string().min(1) }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.addSource({ organizationId: ctx.organizationId, ...input }),
});

export const semanticRemoveSourceAction = defineWebAction({
    id: 'semantic.removeSource',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ connectionId: z.string().min(1) }),
    outputSchema: semanticModelOutputSchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.removeSource({ organizationId: ctx.organizationId, ...input }),
});

export const semanticListVerifiedQueriesAction = defineWebAction({
    id: 'semantic.listVerifiedQueries',
    domain: 'semantic',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput.extend({ query: z.string().max(160).optional(), connectionId: z.string().optional() }),
    outputSchema: z.object({ queries: z.array(semanticVerifiedQuerySchema) }),
    permissions: readWorkspace,
    scopes: ['semantic:read'],
    actors: [...readActors],
    handler: async (ctx, input) => ({ queries: await ctx.services.db.semanticContext.listVerifiedQueries({ organizationId: ctx.organizationId, ...input }) }),
});

export const semanticGetVerifiedQueryAction = defineWebAction({
    id: 'semantic.getVerifiedQuery',
    domain: 'semantic',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput.extend({ id: z.string().min(1) }),
    outputSchema: semanticVerifiedQuerySchema,
    permissions: readWorkspace,
    scopes: ['semantic:read'],
    actors: [...readActors],
    handler: (ctx, input) => ctx.services.db.semanticContext.getVerifiedQuery({ organizationId: ctx.organizationId, ...input }),
});

export const semanticCreateVerifiedQueryAction = defineWebAction({
    id: 'semantic.createVerifiedQuery',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({
        sourceConnectionId: z.string().min(1),
        title: z.string().min(1).max(240),
        question: z.string().min(1).max(4000),
        sql: z.string().min(1).max(100_000),
        description: z.string().max(4000).optional(),
        definitionIds: z.array(z.string()).max(100).optional(),
        sourceType: z.string().max(80).optional(),
        sourceId: z.string().max(240).optional(),
    }),
    outputSchema: semanticVerifiedQuerySchema,
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: (ctx, input) => ctx.services.db.semanticContext.createVerifiedQuery({ organizationId: ctx.organizationId, createdBy: ctx.userId, ...input }),
});

export const semanticDeleteVerifiedQueryAction = defineWebAction({
    id: 'semantic.deleteVerifiedQuery',
    domain: 'semantic',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelIdInput.extend({ id: z.string().min(1) }),
    outputSchema: z.object({ id: z.string() }),
    permissions: writeWorkspace,
    scopes: ['semantic:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        await ctx.services.db.semanticContext.deleteVerifiedQuery({ organizationId: ctx.organizationId, ...input });
        return { id: input.id };
    },
});

export const semanticSearchContextAction = defineWebAction({
    id: 'semantic.searchContext',
    domain: 'semantic',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1), query: z.string().min(1).max(240) }),
    outputSchema: z.object({
        models: z.array(
            z.object({
                semanticModelId: z.string(),
                semanticModelName: z.string(),
                businessContext: z.string(),
                definitions: z.array(semanticDefinitionSchema.extend({ id: z.string() })),
            }),
        ),
    }),
    permissions: readWorkspace,
    scopes: ['semantic:read'],
    actors: ['agent', 'mcp'],
    handler: async (ctx, input) => {
        const models = await ctx.services.db.semanticContext.listModels({ organizationId: ctx.organizationId, connectionId: input.connectionId });
        const needle = input.query.toLowerCase();
        return {
            models: models
                .map(model => ({
                    semanticModelId: model.id,
                    semanticModelName: model.name,
                    businessContext: model.businessContextMd,
                    definitions: model.model.definitions
                        .filter(
                            item =>
                                item.sourceConnectionId === input.connectionId &&
                                [item.name, item.description, ...(item.aliases ?? [])].filter(Boolean).join(' ').toLowerCase().includes(needle),
                        )
                        .slice(0, 20),
                }))
                .filter(model => model.businessContext || model.definitions.length),
        };
    },
});

export const semanticGetDefinitionAction = defineWebAction({
    id: 'semantic.getDefinition',
    domain: 'semantic',
    kind: 'query',
    risk: 'read',
    inputSchema: modelIdInput.extend({ definitionId: z.string().min(1), connectionId: z.string().min(1) }),
    outputSchema: semanticDefinitionSchema.extend({ id: z.string() }),
    permissions: readWorkspace,
    scopes: ['semantic:read'],
    actors: ['agent', 'mcp'],
    handler: async (ctx, input) => {
        const model = await ctx.services.db.semanticContext.getModel({ organizationId: ctx.organizationId, semanticModelId: input.semanticModelId });
        if (!model.sources.some(source => source.connectionId === input.connectionId)) throw new Error('Semantic model is not linked to this data source.');
        const definition = model.model.definitions.find(item => item.id === input.definitionId && item.sourceConnectionId === input.connectionId);
        if (!definition) throw new Error('Semantic definition not found.');
        return definition;
    },
});

export const semanticSearchVerifiedQueriesAction = defineWebAction({
    id: 'semantic.searchVerifiedQueries',
    domain: 'semantic',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({ connectionId: z.string().min(1), query: z.string().max(240).optional() }),
    outputSchema: z.object({ queries: z.array(semanticVerifiedQuerySchema.extend({ semanticModelName: z.string() })) }),
    permissions: readWorkspace,
    scopes: ['semantic:read'],
    actors: ['agent', 'mcp'],
    handler: async (ctx, input) => {
        const models = await ctx.services.db.semanticContext.listModels({ organizationId: ctx.organizationId, connectionId: input.connectionId });
        const groups = await Promise.all(
            models.map(async model =>
                (
                    await ctx.services.db.semanticContext.listVerifiedQueries({
                        organizationId: ctx.organizationId,
                        semanticModelId: model.id,
                        connectionId: input.connectionId,
                        query: input.query,
                    })
                ).map(query => ({ ...query, semanticModelName: model.name })),
            ),
        );
        return { queries: groups.flat().slice(0, 20) };
    },
});

export const semanticGenerateSuggestionsAction = defineWebAction({
    id: 'semantic.generateSuggestions',
    domain: 'semantic',
    kind: 'query',
    risk: 'low',
    inputSchema: modelIdInput.extend({
        operation: z.enum(['generate_definitions', 'analyze_context', 'analyze_schema', 'find_relationships', 'suggest_metrics']),
        prompt: z.string().max(4000).optional(),
    }),
    outputSchema: z.object({ suggestions: z.array(semanticDefinitionSchema.extend({ id: z.string() })) }),
    permissions: readWorkspace,
    scopes: ['analysis:run', 'semantic:read'],
    actors: ['user'],
    handler: async (ctx, input) => {
        const semanticModel = await ctx.services.db.semanticContext.getModel({ organizationId: ctx.organizationId, semanticModelId: input.semanticModelId });
        const resolved = await resolveAiLanguageModel({ role: 'action', organizationId: ctx.organizationId, req: ctx.services.req });
        const sourceSummary = semanticModel.sources.map(source => `${source.name} (${source.engine}, id=${source.connectionId})`).join('\n');
        const result = await generateText({
            model: resolved.model,
            instructions:
                'Return JSON only. Never include markdown fences. Suggest business semantic definitions, not SQL execution. Never create cross-data-source relationships.',
            prompt: `Operation: ${input.operation}\nUser request: ${input.prompt ?? ''}\nModel: ${semanticModel.name}\nBusiness context:\n${semanticModel.businessContextMd}\nData sources:\n${sourceSummary}\nReturn {"suggestions":[{"id":"suggestion-id","name":"...","kind":"metric|measure|dimension|entity|relationship","status":"verified","sourceConnectionId":"one listed id","description":"...","source":"table","expression":"...","filters":[]}]} using only listed source ids.`,
            temperature: 0.2,
            maxOutputTokens: 1800,
            context: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                feature: 'semantic_suggestions',
                model: resolved.modelName,
                provider: resolved.providerKey,
                gateway: resolved.gateway,
            },
        });
        const parsed = JSON.parse(result.text.trim()) as { suggestions?: unknown[] };
        const sourceIds = new Set(semanticModel.sources.map(source => source.connectionId));
        const suggestions = (parsed.suggestions ?? [])
            .map((suggestion, index) =>
                semanticDefinitionSchema.extend({ id: z.string() }).parse({ ...(suggestion as object), id: (suggestion as { id?: string }).id || `suggestion:${index}` }),
            )
            .filter(suggestion => sourceIds.has(suggestion.sourceConnectionId));
        return { suggestions };
    },
});

export const semanticActions = [
    semanticListAction,
    semanticGetAction,
    semanticCreateAction,
    semanticUpdateAction,
    semanticDeleteAction,
    semanticListDefinitionsAction,
    semanticCreateDefinitionAction,
    semanticUpdateDefinitionAction,
    semanticDeleteDefinitionAction,
    semanticSaveDefinitionsAction,
    semanticImportYamlAction,
    semanticAddSourceAction,
    semanticRemoveSourceAction,
    semanticListVerifiedQueriesAction,
    semanticGetVerifiedQueryAction,
    semanticCreateVerifiedQueryAction,
    semanticDeleteVerifiedQueryAction,
    semanticSearchContextAction,
    semanticGetDefinitionAction,
    semanticSearchVerifiedQueriesAction,
    semanticGenerateSuggestionsAction,
];
