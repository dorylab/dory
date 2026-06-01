import { z } from 'zod';

import { generateText } from '@/lib/ai/gateway';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { buildTabTitlePrompt } from '@/lib/ai/prompts/tasks/sql.title';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import type { AiActionContext } from './shared';

async function runTabTitleAction(ctx: AiActionContext, input: { sql: string; database?: string | null; model?: string | null }) {
    const sql = input.sql?.trim();
    if (!sql) return { title: null };

    try {
        const { getEffectiveModelBundleForOrganization } = await import('@/lib/ai/model');
        const { model, preset, modelName, providerKey, gateway } = await getEffectiveModelBundleForOrganization('title', {
            organizationId: ctx.organizationId,
            modelName: input.model ?? null,
        });
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
