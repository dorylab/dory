import { z } from 'zod';

const aiReviewPayloadSchema = z.object({
    summary: z.string().min(1).max(2000),
    deploymentNotes: z.array(z.string().min(1).max(500)).max(10),
    risks: z
        .array(
            z.object({
                changeId: z.string().min(1),
                explanation: z.string().min(1).max(800),
            }),
        )
        .max(30),
    recommendations: z.array(z.string().min(1).max(500)).max(10),
    limitations: z.array(z.string().min(1).max(500)).max(10),
});

function unwrapReviewPayload(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || 'summary' in value) {
        return value;
    }

    const record = value as Record<string, unknown>;
    return record.review ?? record.aiReview ?? record.result ?? value;
}

export const schemaComparisonAiReviewSchema = z.preprocess(unwrapReviewPayload, aiReviewPayloadSchema);

export function buildSchemaComparisonAiReviewPrompt(input: { locale: string; deploymentContext?: string | null; evidence: unknown }) {
    return [
        'You are reviewing a deterministic Dory database schema comparison from Current to Desired.',
        'Return valid JSON only. Do not use Markdown, code fences, commentary, or a wrapper object.',
        'Use exactly this top-level JSON shape:',
        '{"summary":"...","deploymentNotes":["..."],"risks":[{"changeId":"...","explanation":"..."}],"recommendations":["..."],"limitations":["..."]}',
        'Always include all five top-level fields. Use an empty array when a list has no items.',
        'Explain the evidence. Do not change, upgrade, downgrade, or contradict canonical risk levels or deployment readiness.',
        'Every risk explanation must cite one supplied changeId. Do not invent IDs.',
        'Cumulative index scans are catalog counters, not monthly query volumes.',
        `Respond in locale: ${input.locale}.`,
        input.deploymentContext ? `Deployment context:\n${input.deploymentContext}` : '',
        `Deterministic evidence:\n${JSON.stringify(input.evidence)}`,
    ]
        .filter(Boolean)
        .join('\n\n');
}
