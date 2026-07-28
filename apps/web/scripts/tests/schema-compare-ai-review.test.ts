import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSchemaComparisonAiReviewPrompt, schemaComparisonAiReviewSchema } from '@/lib/comparison/ai-review-output';

const review = {
    summary: 'One breaking change needs review.',
    deploymentNotes: ['Review dependent queries before deployment.'],
    risks: [{ changeId: 'chg_primary_key', explanation: 'The primary key is removed.' }],
    recommendations: ['Keep the existing primary key.'],
    limitations: ['Row counts are catalog estimates.'],
};

test('schema comparison AI Review accepts the canonical response shape', () => {
    assert.deepEqual(schemaComparisonAiReviewSchema.parse(review), review);
});

test('schema comparison AI Review unwraps common model response wrappers', () => {
    assert.deepEqual(schemaComparisonAiReviewSchema.parse({ aiReview: review }), review);
});

test('schema comparison AI Review prompt requires every canonical top-level field', () => {
    const prompt = buildSchemaComparisonAiReviewPrompt({
        locale: 'zh',
        evidence: { summary: { readiness: 'unsafe' } },
    });

    assert.match(prompt, /Return valid JSON only/);
    assert.match(prompt, /"deploymentNotes"/);
    assert.match(prompt, /"recommendations"/);
    assert.match(prompt, /"limitations"/);
    assert.match(prompt, /Always include all five top-level fields/);
});
