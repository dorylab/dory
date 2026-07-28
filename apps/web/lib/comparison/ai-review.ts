import { getDoryArtifactStore } from '@dory/artifacts';
import type { DBService } from '@dory/database';
import type { ComparisonAiReview } from '@dory/database/postgres/schemas';
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
    runId: string;
    deploymentContext?: string | null;
    locale?: string | null;
    req?: NextRequest;
}): Promise<ComparisonAiReview> {
    const run = await input.db.comparisons.getRun(input.organizationId, input.comparisonId, input.runId);
    if (run.aiReviewStatus === 'success' && run.aiReview) return run.aiReview;
    if (run.status !== 'success' || !run.artifactRef || !run.summary || !run.coverage) {
        throw new Error('AI Review requires a successful deterministic schema comparison.');
    }

    const claimed = await input.db.comparisons.claimAiReview(input.organizationId, input.comparisonId, input.runId);
    if (!claimed) {
        const latest = await input.db.comparisons.getRun(input.organizationId, input.comparisonId, input.runId);
        if (latest.aiReviewStatus === 'success' && latest.aiReview) return latest.aiReview;
        throw new Error('AI Review is already running or is not needed for this Comparison Run.');
    }
    try {
        const artifacts = getDoryArtifactStore().comparisons;
        const comparison = (await artifacts.readRun(run.artifactRef)).comparison;
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
        await artifacts.putAiReview(run.artifactRef, review).catch(() => undefined);
        await input.db.comparisons.setAiReviewSuccess(input.organizationId, input.comparisonId, input.runId, review);
        return review;
    } catch (error) {
        await input.db.comparisons.setAiReviewFailure(
            input.organizationId,
            input.comparisonId,
            input.runId,
            unavailableError(error) ? 'unavailable' : 'failed',
            error instanceof Error ? error.message : String(error),
        );
        throw error;
    }
}
