import 'server-only';

import type { QuickActionServer } from '../../runQuickActionServer';
import { executeRewriteSql } from './executor';

export const rewriteSql: QuickActionServer = {
    intent: 'rewrite-sql',
    titleKey: 'Copilot.QuickActions.RewriteSql.Title',
    descriptionKey: 'Copilot.QuickActions.RewriteSql.Description',
    icon: '📝',

    detect(ctx) {
        return !!ctx.sql?.trim();
    },

    async run(ctx) {
        return executeRewriteSql(ctx);
    },
};
