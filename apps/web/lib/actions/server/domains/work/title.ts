import 'server-only';

import type { ActionContext } from '@dory/actions';
import type { WebActionServices } from '../../types';
import { generateText } from '@/lib/ai/gateway';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';
import type { WorkScope, WorkType } from '@dory/database/postgres/schemas';

const MAX_WORK_TITLE_LENGTH = 48;

type WorkTitleInput = {
    goal: string;
    workType?: WorkType | null;
    scope?: WorkScope | null;
    initialContext?: string | null;
};

function cleanTitle(value: string) {
    return value
        .replace(/^[`"'\s]+|[`"'\s.]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_WORK_TITLE_LENGTH)
        .trim();
}

function toTitleCase(value: string) {
    return value.replace(/\b[a-z][a-z0-9']*/gi, word => {
        if (/[A-Z]/.test(word) && word === word.toUpperCase()) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

function hasCjk(value: string) {
    return /[\u3400-\u9fff]/.test(value);
}

export function buildFallbackWorkTitle(input: WorkTitleInput) {
    const normalizedGoal = input.goal
        .replace(/[#*_`>\[\]()-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const firstClause = normalizedGoal.split(/[。！？.!?]/)[0]?.trim() || normalizedGoal;
    const withoutLeadingVerb = firstClause.replace(
        /^(?:please\s+)?(?:analyze|analyse|investigate|understand|explore|check|monitor|compare|debug|review|identify|evaluate|find\s+why|find)\s+/i,
        '',
    );
    const withoutTrailingWindow = withoutLeadingVerb.replace(/\s+(?:for|in|over|during)\s+(?:the\s+)?(?:last|past|recent|next)\s+.+$/i, '');
    const candidate = cleanTitle(hasCjk(withoutTrailingWindow) ? withoutTrailingWindow : toTitleCase(withoutTrailingWindow));

    if (candidate) return candidate;
    return input.workType === 'monitoring' ? 'Monitoring Work' : 'Data Investigation';
}

function summarizeScope(scope?: WorkScope | null) {
    if (!scope || typeof scope !== 'object') return '';

    const parts: string[] = [];
    if (typeof scope.timeRange === 'string' && scope.timeRange.trim()) parts.push(`Time range: ${scope.timeRange.trim()}`);
    if (Array.isArray(scope.selectedTables) && scope.selectedTables.length) parts.push(`Tables: ${scope.selectedTables.join(', ')}`);
    if (Array.isArray(scope.metrics) && scope.metrics.length) parts.push(`Metrics: ${scope.metrics.join(', ')}`);
    return parts.join('\n');
}

function buildWorkTitlePrompt(input: WorkTitleInput & { locale?: string | null }) {
    const languageLine = getPromptLanguageLine(input.locale);
    return [
        'Generate a concise title for a Dory Work item.',
        languageLine,
        'Requirements:',
        `- Max ${MAX_WORK_TITLE_LENGTH} characters; shorter is better.`,
        '- Use the goal semantics, not generic words like Work or Investigation unless needed.',
        '- No quotes, no markdown, no newline, output the title only.',
        '',
        `Work type: ${input.workType ?? 'investigation'}`,
        `Goal: ${input.goal}`,
        summarizeScope(input.scope),
        input.initialContext?.trim() ? `Additional context: ${input.initialContext.trim()}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}

export async function generateWorkTitle(ctx: ActionContext<WebActionServices>, input: WorkTitleInput) {
    const fallbackTitle = buildFallbackWorkTitle(input);
    if (!ctx.services.req) return fallbackTitle;

    try {
        const { model, preset, modelName, providerKey, gateway } = await resolveAiLanguageModel({
            role: 'title',
            organizationId: ctx.organizationId,
            req: ctx.services.req,
        });
        const { text } = await generateText({
            model,
            system: compileSystemPrompt(preset.system) ?? 'Return a concise title only, with no explanation.',
            prompt: buildWorkTitlePrompt({ ...input, locale: ctx.locale }),
            temperature: preset.temperature,
            maxOutputTokens: preset.maxOutputTokens ?? 32,
            context: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                feature: 'work_title',
                model: modelName,
                provider: providerKey,
                gateway,
            },
        });

        return cleanTitle(text) || fallbackTitle;
    } catch (error) {
        console.error('[action/work.createTitle] failed:', error);
        return fallbackTitle;
    }
}
