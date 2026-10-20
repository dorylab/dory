import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace, writeWorkspace } from '../../policies';
import { knowledgeConnectorSchema } from './shared';
import { assertLinearAdmin, assertLinearAvailable, saveLinearApiKey, withLinearAccess, linearConfigured, linearRuntimeAvailable } from '@/lib/server/linear-credentials';
import { listLinearProjects, validateLinearProjectIds } from '@/lib/server/linear-client';
import { getKnowledgeConnectorSyncRunner } from '@/lib/server/knowledge-connector-sync';

const modelInput = z.object({ knowledgeModelId: z.string().min(1) });
const credentialInput = modelInput.extend({ credentialId: z.string().min(1) });
const selectionInput = credentialInput.extend({ projectIds: z.array(z.string().uuid()).min(1).max(100) });

export const knowledgeGetLinearConnectorSetupAction = defineWebAction({
    id: 'knowledge.getLinearConnectorSetup',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: modelInput,
    outputSchema: z.object({
        available: z.boolean(),
        configured: z.boolean(),
        canManage: z.boolean(),
        credentials: z.array(z.object({ id: z.string(), workspaceId: z.string(), workspaceName: z.string(), status: z.enum(['active', 'invalid']), version: z.number() })),
    }),
    permissions: readWorkspace,
    scopes: ['knowledge:read'],
    actors: ['user'],
    handler: async (ctx, input) => {
        await ctx.services.db.knowledge.getModel({ organizationId: ctx.organizationId, ...input });
        const canManage = ctx.access.role === 'owner' || ctx.access.role === 'admin';
        return {
            available: linearRuntimeAvailable(),
            configured: linearConfigured(),
            canManage,
            credentials: canManage && linearRuntimeAvailable() ? await ctx.services.db.knowledge.linear.listCredentials(ctx.organizationId) : [],
        };
    },
});

export const knowledgeSaveLinearApiKeyAction = defineWebAction({
    id: 'knowledge.saveLinearApiKey',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: modelInput.extend({ apiKey: z.string().trim().min(1).max(4096), credentialId: z.string().min(1).optional(), connectorId: z.string().min(1).optional() }),
    outputSchema: z.object({ id: z.string(), workspaceId: z.string(), workspaceName: z.string(), status: z.enum(['active', 'invalid']), version: z.number() }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    audit: { allowInputFields: ['knowledgeModelId', 'credentialId'] },
    handler: async (ctx, input) => {
        assertLinearAdmin(ctx);
        const credential = await saveLinearApiKey(ctx.services.db, { ...input, organizationId: ctx.organizationId });
        getKnowledgeConnectorSyncRunner(ctx.services.db).wake();
        return credential;
    },
});

export const knowledgeListLinearProjectsAction = defineWebAction({
    id: 'knowledge.listLinearProjects',
    domain: 'knowledge',
    kind: 'query',
    risk: 'read',
    inputSchema: credentialInput.extend({ after: z.string().max(1000).optional(), search: z.string().max(160).optional() }),
    outputSchema: z.object({
        nodes: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })),
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    }),
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        assertLinearAdmin(ctx);
        await ctx.services.db.knowledge.getModel({ organizationId: ctx.organizationId, knowledgeModelId: input.knowledgeModelId });
        return withLinearAccess(ctx.services.db, ctx.organizationId, input.credentialId, token => listLinearProjects(token, input));
    },
});

export const knowledgeCreateLinearConnectorAction = defineWebAction({
    id: 'knowledge.createLinearConnector',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: selectionInput,
    outputSchema: knowledgeConnectorSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        assertLinearAdmin(ctx);
        assertLinearAvailable();
        await ctx.services.db.knowledge.getModel({ organizationId: ctx.organizationId, knowledgeModelId: input.knowledgeModelId });
        await withLinearAccess(ctx.services.db, ctx.organizationId, input.credentialId, token => validateLinearProjectIds(token, input.projectIds));
        const connector = await ctx.services.db.knowledge.createLinearConnector({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId });
        await ctx.services.db.knowledge.queueConnectorSync({ connectorId: connector.id });
        getKnowledgeConnectorSyncRunner(ctx.services.db).wake();
        return knowledgeConnectorSchema.parse(connector);
    },
});

export const knowledgeUpdateLinearProjectsAction = defineWebAction({
    id: 'knowledge.updateLinearProjects',
    domain: 'knowledge',
    kind: 'command',
    risk: 'write',
    requiresConfirmation: false,
    inputSchema: z.object({ connectorId: z.string(), projectIds: selectionInput.shape.projectIds }),
    outputSchema: knowledgeConnectorSchema,
    permissions: writeWorkspace,
    scopes: ['knowledge:write'],
    actors: ['user'],
    handler: async (ctx, input) => {
        assertLinearAdmin(ctx);
        assertLinearAvailable();
        const connector = await ctx.services.db.knowledge.getConnector({ organizationId: ctx.organizationId, connectorId: input.connectorId });
        if (connector.provider !== 'linear' || !connector.credentialId) throw new Error('Not a Linear connector.');
        await withLinearAccess(ctx.services.db, ctx.organizationId, connector.credentialId, token => validateLinearProjectIds(token, input.projectIds));
        const updated = await ctx.services.db.knowledge.updateLinearProjects({ ...input, organizationId: ctx.organizationId });
        await ctx.services.db.knowledge.queueConnectorSync({ connectorId: connector.id });
        getKnowledgeConnectorSyncRunner(ctx.services.db).wake();
        return knowledgeConnectorSchema.parse(updated);
    },
});

export const linearKnowledgeActions = [
    knowledgeGetLinearConnectorSetupAction,
    knowledgeSaveLinearApiKeyAction,
    knowledgeListLinearProjectsAction,
    knowledgeCreateLinearConnectorAction,
    knowledgeUpdateLinearProjectsAction,
];
