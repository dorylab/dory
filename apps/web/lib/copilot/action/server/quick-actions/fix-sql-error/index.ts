import 'server-only';

import type { QuickActionServer } from '../../runQuickActionServer';
import { executeFixSqlError } from './executor';

export const fixSqlError: QuickActionServer = {
    intent: 'fix-sql-error',
    titleKey: 'Copilot.QuickActions.FixSqlError.Title',
    descriptionKey: 'Copilot.QuickActions.FixSqlError.Description',
    icon: '🐞',
    requiresError: true,

    detect(ctx) {
        return !!ctx.error?.message;
    },

    async run(ctx) {
        return executeFixSqlError(ctx);
    },
};
