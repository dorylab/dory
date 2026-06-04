import { z } from 'zod';

import { USE_CLOUD_AI } from '@/app/config/app';
import { createDoryCloudProxyLanguageModel } from '@/lib/ai/agents/cloud-proxy-model';
import { buildCloudForwardHeaders } from '@/lib/ai/execution/cloud-route-proxy';
import { generateText } from '@/lib/ai/gateway';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { assertAiExecutionTargetHasModel, resolveAiExecutionTargetForOrganization } from '@/lib/ai/model/execution';
import { buildTabTitlePrompt } from '@/lib/ai/prompts/tasks/sql.title';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import type { AiActionContext } from './shared';

async function resolveTabTitleExecution(ctx: AiActionContext, modelName?: string | null) {
    const cloudApiBaseUrl = getCloudApiBaseUrl();
    const target = await resolveAiExecutionTargetForOrganization('title', {
        db: ctx.services.db,
        organizationId: ctx.organizationId,
        modelName,
        useCloudAi: USE_CLOUD_AI,
        cloudApiBaseUrl,
        allowCloudProxy: Boolean(ctx.services.req),
        includeModel: true,
    });

    if (target.shouldUseCloudProxy) {
        if (!ctx.services.req || !cloudApiBaseUrl) {
            throw new Error('Cloud AI proxy is not available for this action context.');
        }

        return {
            ...target,
            model: createDoryCloudProxyLanguageModel({
                baseUrl: cloudApiBaseUrl,
                headers: buildCloudForwardHeaders(ctx.services.req, cloudApiBaseUrl),
                model: target.modelName,
                role: 'title',
            }),
        };
    }

    assertAiExecutionTargetHasModel(target);
    return target;
}

async function runTabTitleAction(ctx: AiActionContext, input: { sql: string; database?: string | null; model?: string | null }) {
    const sql = input.sql?.trim();
    if (!sql) return { title: null };

    try {
        const { model, preset, modelName, providerKey, gateway } = await resolveTabTitleExecution(ctx, input.model ?? null);
        const { text } = await generateText({
            model,
            system: compileSystemPrompt(preset.system) ?? 'Return a concise title only, with no explanation.',
            prompt: buildTabTitlePrompt({ sql, database: input.database ?? null, locale: ctx.locale }),
            temperature: preset.temperature,
            context: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                feature: 'tab_title',
                model: modelName,
                provider: providerKey,
                gateway,
            },
        });

        return { title: text.trim() || null };
    } catch (error) {
        console.error('[action/ai.tabTitle] failed:', error);
        return { title: null };
    }
}

export const aiTabTitleAction = defineWebAction({
    id: 'ai.tabTitle',
    domain: 'ai',
    kind: 'query',
    risk: 'low',
    inputSchema: z.object({
        sql: z.string(),
        database: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'automation'],
    handler: runTabTitleAction,
});
