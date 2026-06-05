import { z } from 'zod';

import { generateText } from '@/lib/ai/gateway';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { buildTabTitlePrompt } from '@/lib/ai/prompts/tasks/sql.title';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import type { AiActionContext } from './shared';

function stripSqlComments(sql: string) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--.*$/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toTitleCase(value: string) {
    return value
        .split(/[_\s.-]+/)
        .filter(Boolean)
        .slice(0, 3)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function trimTitle(value: string) {
    return value
        .replace(/^[`"'\s]+|[`"'\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 15);
}

export function buildFallbackTabTitle(sql: string) {
    const normalized = stripSqlComments(sql);
    const lower = normalized.toLowerCase();
    const tableMatch = lower.match(/\b(?:from|join|into|update|table)\s+["`]?([a-zA-Z0-9_.-]+)/);
    const tableName = tableMatch?.[1]?.split('.').filter(Boolean).pop();
    const subject = tableName ? toTitleCase(tableName) : 'SQL';

    if (/^\s*select\b/.test(lower)) {
        if (/\bcount\s*\(/.test(lower)) return trimTitle(`${subject} count`);
        if (/\bgroup\s+by\b/.test(lower)) return trimTitle(`${subject} summary`);
        return trimTitle(`${subject} query`);
    }
    if (/^\s*insert\b/.test(lower)) return trimTitle(`Insert ${subject}`);
    if (/^\s*update\b/.test(lower)) return trimTitle(`Update ${subject}`);
    if (/^\s*delete\b/.test(lower)) return trimTitle(`Delete ${subject}`);
    if (/^\s*create\b/.test(lower)) return trimTitle(`Create ${subject}`);

    return trimTitle(subject);
}

async function runTabTitleAction(ctx: AiActionContext, input: { sql: string; database?: string | null; model?: string | null }) {
    const sql = input.sql?.trim();
    if (!sql) return { title: null };

    try {
        const { model, preset, modelName, providerKey, gateway } = await resolveAiLanguageModel({
            role: 'title',
            organizationId: ctx.organizationId,
            requestedModel: input.model ?? null,
            req: ctx.services.req,
        });
        const { text } = await generateText({
            model,
            system: compileSystemPrompt(preset.system) ?? 'Return a concise title only, with no explanation.',
            prompt: buildTabTitlePrompt({ sql, database: input.database ?? null, locale: ctx.locale }),
            temperature: preset.temperature,
            maxOutputTokens: preset.maxOutputTokens ?? 32,
            context: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                feature: 'tab_title',
                model: modelName,
                provider: providerKey,
                gateway,
            },
        });

        return { title: trimTitle(text) || buildFallbackTabTitle(sql) };
    } catch (error) {
        console.error('[action/ai.tabTitle] failed:', error);
        return { title: buildFallbackTabTitle(sql) };
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
