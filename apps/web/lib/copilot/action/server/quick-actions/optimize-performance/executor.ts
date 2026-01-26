import 'server-only';

import { buildOptimizePerformancePrompt } from '@/lib/ai/prompts';
import { OptimizePerformanceOutputSchema } from './schema';
import { isMissingAiEnvError, runLLMJson } from '../../llm-json';
import { ActionContext, ActionResult } from '../../../types';
import { translate } from '@/lib/i18n/i18n';
import { routing } from '@/lib/i18n/routing';

export async function executeOptimizePerformance(ctx: ActionContext): Promise<ActionResult> {
    const locale = ctx.locale ?? routing.defaultLocale;
    if (!ctx.sql?.trim()) {
        return {
            title: translate(locale, 'SqlConsole.Copilot.ActionResults.OptimizePerformance.MissingSqlTitle'),
            explanation: translate(locale, 'SqlConsole.Copilot.ActionResults.OptimizePerformance.MissingSqlDescription'),
            fixedSql: ctx.sql,
            risk: 'high',
        };
    }

    const prompt = buildOptimizePerformancePrompt(ctx);

    try {
        const out = await runLLMJson({
            prompt,
            schema: OptimizePerformanceOutputSchema,
            temperature: 0.1,
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
            title: translate(locale, 'SqlConsole.Copilot.ActionResults.OptimizePerformance.FailedTitle'),
            explanation: translate(
                locale,
                'SqlConsole.Copilot.ActionResults.OptimizePerformance.FailedDescription',
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
