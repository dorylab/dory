import 'server-only';

import { ActionContext, ActionResult } from '../../../types';
import { translate } from '@/lib/i18n/i18n';
import { routing } from '@/lib/i18n/routing';

export function tryHeuristicFix(ctx: ActionContext): ActionResult | null {
    const locale = ctx.locale ?? routing.defaultLocale;
    const msg = (ctx.error?.message ?? '').toLowerCase();
    const sql = ctx.sql;

    if (msg.includes('unknown table expression identifier')) {
        const m = ctx.error?.message.match(/identifier\s+'([^']+)'/i);
        const ident = m?.[1];

        if (ident) {
            const alias = ident[0].toLowerCase();
            const fromRegex = new RegExp(`\\bfrom\\s+${escapeRegExp(ident)}\\b`, 'i');
            const hasAliasRegex = new RegExp(`\\bfrom\\s+${escapeRegExp(ident)}\\s+(as\\s+)?\\w+\\b`, 'i');

            if (fromRegex.test(sql) && !hasAliasRegex.test(sql)) {
                const fixedSql = sql.replace(fromRegex, s => `${s} ${alias}`);

                return {
                    title: translate(locale, 'SqlConsole.Copilot.ActionResults.FixSqlError.MissingAliasTitle'),
                    explanation: translate(
                        locale,
                        'SqlConsole.Copilot.ActionResults.FixSqlError.MissingAliasDescription',
                        { ident, alias },
                    ),
                    fixedSql,
                    risk: 'medium',
                };
            }
        }
    }

    return null;
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
