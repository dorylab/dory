import { ActionContext, ActionIntent } from './types';

export type QuickActionMeta = {
    intent: ActionIntent;
    titleKey: string;
    descriptionKey: string;
    icon: string;
    requiresError?: boolean;
    detect?: (ctx: ActionContext) => boolean;
};

export type LocalizedQuickActionMeta = Omit<QuickActionMeta, 'titleKey' | 'descriptionKey'> & {
    title: string;
    description: string;
};

export type TranslationFn = (key: string, values?: Record<string, unknown>) => string;

export const QUICK_ACTIONS: QuickActionMeta[] = [
    {
        intent: 'fix-sql-error',
        titleKey: 'Copilot.QuickActions.FixSqlError.Title',
        descriptionKey: 'Copilot.QuickActions.FixSqlError.Description',
        icon: 'AlertTriangle',
        requiresError: true,
        detect(ctx: ActionContext) {
            return !!ctx.error?.message;
        },
    },
    {
        intent: 'optimize-performance',
        titleKey: 'Copilot.QuickActions.OptimizePerformance.Title',
        descriptionKey: 'Copilot.QuickActions.OptimizePerformance.Description',
        icon: 'Gauge',
        detect(ctx: ActionContext) {
            return !!ctx.sql?.trim();
        },
    },
    {
        intent: 'rewrite-sql',
        titleKey: 'Copilot.QuickActions.RewriteSql.Title',
        descriptionKey: 'Copilot.QuickActions.RewriteSql.Description',
        icon: 'Sparkles',
        detect(ctx: ActionContext) {
            return !!ctx.sql?.trim();
        },
    },
    {
        intent: 'to-aggregation',
        titleKey: 'Copilot.QuickActions.ToAggregation.Title',
        descriptionKey: 'Copilot.QuickActions.ToAggregation.Description',
        icon: 'Layers3',
        detect(ctx: ActionContext) {
            return !!ctx.sql?.trim();
        },
    },
];

export type QuickActionAvailability = {
    action: LocalizedQuickActionMeta;
    available: boolean;
    reason?: string;
};

export function getLocalizedQuickActions(t: TranslationFn): LocalizedQuickActionMeta[] {
    return QUICK_ACTIONS.map(action => ({
        ...action,
        title: t(action.titleKey),
        description: t(action.descriptionKey),
    }));
}

export function getQuickActionAvailability(ctx: ActionContext, t: TranslationFn): QuickActionAvailability[] {
    return getLocalizedQuickActions(t).map(action => {
        if (action.requiresError && !ctx.error?.message) {
            return { action, available: false, reason: t('Copilot.Actions.RequiresError') };
        }
        if (action.detect && !action.detect(ctx)) {
            return { action, available: false, reason: t('Copilot.Actions.NotApplicable') };
        }
        return { action, available: true };
    });
}
