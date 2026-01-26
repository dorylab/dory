import 'server-only';

import { buildToAggregationPrompt } from '@/lib/ai/prompts';
import { ToAggregationOutputSchema } from './schema';
import { isMissingAiEnvError, runLLMJson } from '../../llm-json';
import { ActionContext, ActionResult } from '../../../types';
import { translate } from '@/lib/i18n/i18n';
import { routing } from '@/lib/i18n/routing';

export async function executeToAggregation(ctx: ActionContext): Promise<ActionResult> {
    const locale = ctx.locale ?? routing.defaultLocale;
    if (!ctx.sql?.trim()) {
        return {
            title: translate(locale, 'SqlConsole.Copilot.ActionResults.ToAggregation.MissingSqlTitle'),
            explanation: translate(locale, 'SqlConsole.Copilot.ActionResults.ToAggregation.MissingSqlDescription'),
            fixedSql: ctx.sql,
            risk: 'high',
        };
    }

    const prompt = buildToAggregationPrompt(ctx);

    try {
        const out = await runLLMJson({
            prompt,
            schema: ToAggregationOutputSchema,
            temperature: 0.25,
            maxRetries: 1,
        });

        const fixedSql = out.fixedSql?.trim() || ctx.sql;
        const changed = normalizeSql(fixedSql) !== normalizeSql(ctx.sql);

        return {
            title: out.title,
            explanation: out.explanation,
            fixedSql,
            risk: changed ? out.risk : 'high',
        };
    } catch (e: any) {
        if (isMissingAiEnvError(e)) {
            throw e;
        }
        return {
            title: translate(locale, 'SqlConsole.Copilot.ActionResults.ToAggregation.FailedTitle'),
            explanation: translate(
                locale,
                'SqlConsole.Copilot.ActionResults.ToAggregation.FailedDescription',
                { message: e?.message ?? 'unknown error' },
            ),
            fixedSql: ctx.sql,
            risk: 'high',
        };
    }
}

function normalizeSql(s: string) {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
}
