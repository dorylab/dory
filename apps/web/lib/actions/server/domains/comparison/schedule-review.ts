import type { ActionContext } from '@dory/actions';
import type { ComparisonRun } from '@dory/database/postgres/schemas';

import { reviewSchemaComparison } from '@/lib/comparison/ai-review';

import type { WebActionServices } from '../../types';

export function scheduleComparisonAiReview(ctx: ActionContext<WebActionServices>, run: ComparisonRun | null) {
    if (!run || run.status !== 'success' || run.aiReviewStatus !== 'pending') return;
    ctx.services.defer?.(async () => {
        await reviewSchemaComparison({
            db: ctx.services.db,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            comparisonId: run.comparisonId,
            runId: run.id,
            locale: ctx.locale,
            req: ctx.services.req,
        }).catch(() => undefined);
    });
}
