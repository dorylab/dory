import 'server-only';

import { toActionContext } from './to-action-context';
import { ActionContext, ActionIntent, ActionResult } from '../types';
import type { CopilotFixInput } from '@/app/(app)/[team]/[connectionId]/chatbot/copilot/types/copilot-fix-input';
import { fixSqlError } from './quick-actions/fix-sql-error';
import { optimizePerformance } from './quick-actions/optimize-performance';
import { rewriteSql } from './quick-actions/rewrite-sql';
import { toAggregation } from './quick-actions/to-aggregation';
import { translate } from '@/lib/i18n/i18n';
import { Locale, routing } from '@/lib/i18n/routing';

export type QuickActionServer = {
    intent: ActionIntent;
    titleKey: string;
    descriptionKey: string;
    icon: string;
    requiresError?: boolean;
    detect?: (ctx: ActionContext) => boolean;
    run: (ctx: ActionContext) => Promise<ActionResult>;
};

const QUICK_ACTIONS: QuickActionServer[] = [fixSqlError, optimizePerformance, rewriteSql, toAggregation];

const QUICK_ACTION_MAP: Record<ActionIntent, QuickActionServer> = QUICK_ACTIONS.reduce(
    (acc, action) => {
        acc[action.intent] = action;
        return acc;
    },
    {} as Record<ActionIntent, QuickActionServer>,
);

export async function runQuickActionServer(
    intent: ActionIntent,
    input: CopilotFixInput,
    options?: { locale?: Locale },
): Promise<ActionResult> {
    const locale = options?.locale ?? routing.defaultLocale;
    const action = QUICK_ACTION_MAP[intent];
    if (!action) {
        throw new Error(translate(locale, 'SqlConsole.Copilot.Errors.UnknownAction', { intent }));
    }

    const ctx = toActionContext(input, locale);

    if (action.requiresError && !ctx.error?.message) {
        throw new Error(translate(locale, 'SqlConsole.Copilot.Errors.RequiresError'));
    }

    if (action.detect && !action.detect(ctx)) {
        throw new Error(translate(locale, 'SqlConsole.Copilot.Errors.NotApplicable'));
    }

    return await action.run(ctx);
}
