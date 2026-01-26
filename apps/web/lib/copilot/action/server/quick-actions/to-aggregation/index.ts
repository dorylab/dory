import 'server-only';

import type { QuickActionServer } from '../../runQuickActionServer';
import { executeToAggregation } from './executor';

export const toAggregation: QuickActionServer = {
    intent: 'to-aggregation',
    titleKey: 'Copilot.QuickActions.ToAggregation.Title',
    descriptionKey: 'Copilot.QuickActions.ToAggregation.Description',
    icon: '📊',

    detect(ctx) {
        return !!ctx.sql?.trim();
    },

    async run(ctx) {
        return executeToAggregation(ctx);
    },
};
