import { getDoryArtifactStore } from '@dory/artifacts';
import type { DBService } from '@dory/database';
import type { ComparisonAiReview } from '@dory/database/postgres/schemas';
import { compareSchemaSnapshots } from '@dory/schema-compare';
import type { NextRequest } from 'next/server';

import { buildSchemaComparisonAiReviewPrompt, schemaComparisonAiReviewSchema } from './ai-review-output';

function unavailableError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return /no model|not configured|incomplete|api key|provider.*unavailable/i.test(message);
}

export async function reviewSchemaComparison(input: {
    db: DBService;
    organizationId: string;
    userId: string;
    comparisonId: string;
    deploymentContext?: string | null;
    locale?: string | null;
    req?: NextRequest;
}): Promise<ComparisonAiReview> {
    const job = await input.db.comparisons.get(input.organizationId, input.comparisonId);
    if (job.status !== 'success' || !job.snapshotArtifactRef || !job.summary || !job.coverage) {
        throw new Error('AI Review requires a successful deterministic schema comparison.');
    }

    await input.db.comparisons.setAiReviewRunning(input.organizationId, input.comparisonId);
    try {
        const snapshots = await getDoryArtifactStore().comparisons.readSnapshots(job.snapshotArtifactRef);
        const comparison = compareSchemaSnapshots(snapshots.current, snapshots.desired);
        const changes = comparison.changes.slice(0, 100).map(change => ({
            changeId: change.changeId,
            objectType: change.objectType,
            objectPath: change.objectPath,
            changeType: change.changeType,
            attribute: change.attribute,
            currentValue: change.currentValue,
            desiredValue: change.desiredValue,
            canonicalRisk: change.risk,
            evidence: change.evidence,
        }));
        const { runLLMJson } = await import('@/lib/copilot/action/server/llm-json');
        const result = await runLLMJson({
            prompt: buildSchemaComparisonAiReviewPrompt({
                locale: input.locale ?? 'en',
                deploymentContext: input.deploymentContext,
                evidence: {
                    family: comparison.family,
                    coverage: comparison.coverage,
                    summary: comparison.summary,
                    warnings: comparison.warnings,
                    changes,
                },
            }),
            schema: schemaComparisonAiReviewSchema,
            temperature: 0.1,
            maxOutputTokens: 1600,
            maxRetries: 1,
            context: {
                organizationId: input.organizationId,
                userId: input.userId,
                req: input.req,
                feature: 'schema_compare_review',
            },
        });
        const validIds = new Set(changes.map(change => change.changeId));
        const invalidReferences = result.risks.filter(risk => !validIds.has(risk.changeId)).length;
        const review: ComparisonAiReview = {
            summary: result.summary,
            deploymentNotes: result.deploymentNotes,
            risks: result.risks.filter(risk => validIds.has(risk.changeId)),
            recommendations: result.recommendations,
            limitations: [
                ...result.limitations,
                ...(comparison.changes.length > 100
                    ? [`AI Review received the 100 highest-priority changes out of ${comparison.changes.length}; the ResultSet contains the complete diff.`]
                    : []),
                ...(invalidReferences > 0 ? [`${invalidReferences} AI risk reference(s) were omitted because they did not match canonical change IDs.`] : []),
            ],
            generatedAt: new Date().toISOString(),
        };
        await input.db.comparisons.setAiReviewSuccess(input.organizationId, input.comparisonId, review);
        return review;
    } catch (error) {
        await input.db.comparisons.setAiReviewFailure(
            input.organizationId,
            input.comparisonId,
            unavailableError(error) ? 'unavailable' : 'failed',
            error instanceof Error ? error.message : String(error),
        );
        throw error;
    }
}
