import 'server-only';

import type { QuickActionServer } from '../../runQuickActionServer';
import { executeOptimizePerformance } from './executor';

export const optimizePerformance: QuickActionServer = {
    intent: 'optimize-performance',
    titleKey: 'Copilot.QuickActions.OptimizePerformance.Title',
    descriptionKey: 'Copilot.QuickActions.OptimizePerformance.Description',
    icon: '⚡️',

    detect(ctx) {
        return !!ctx.sql?.trim();
    },

    async run(ctx) {
        return executeOptimizePerformance(ctx);
    },
};
