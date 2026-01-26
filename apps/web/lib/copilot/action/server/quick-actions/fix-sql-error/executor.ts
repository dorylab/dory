import 'server-only';

import { tryHeuristicFix } from './heuristics';
import { buildFixSqlErrorPrompt } from '@/lib/ai/prompts';
import { FixSqlErrorOutputSchema } from './schema';
import { isMissingAiEnvError, runLLMJson } from '../../llm-json';
import { ActionContext, ActionResult } from '../../../types';
import { translate } from '@/lib/i18n/i18n';
import { routing } from '@/lib/i18n/routing';

export async function executeFixSqlError(ctx: ActionContext): Promise<ActionResult> {
    const locale = ctx.locale ?? routing.defaultLocale;
    if (!ctx.error?.message) {
        return {
            title: translate(locale, 'SqlConsole.Copilot.ActionResults.FixSqlError.MissingErrorTitle'),
            explanation: translate(locale, 'SqlConsole.Copilot.ActionResults.FixSqlError.MissingErrorDescription'),
            fixedSql: ctx.sql,
            risk: 'high',
        };
    }

    const heuristic = tryHeuristicFix(ctx);
    if (heuristic) return heuristic;

    const prompt = buildFixSqlErrorPrompt(ctx);

    try {
        const out = await runLLMJson({
            prompt,
            schema: FixSqlErrorOutputSchema,
            temperature: 0,
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
            title: translate(locale, 'SqlConsole.Copilot.ActionResults.FixSqlError.FailedTitle'),
            explanation: translate(
                locale,
                'SqlConsole.Copilot.ActionResults.FixSqlError.FailedDescription',
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
