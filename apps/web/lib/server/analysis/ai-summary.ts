import 'server-only';

import { z } from 'zod';
import type { AnalysisOutcome, ResultContext } from '@/lib/analysis/types';
import { runLLMJson } from '@/lib/copilot/action/server/llm-json';
import type { Locale } from '@dory/i18n/routing';

const aiOutcomeSchema = z.object({
    analysisState: z.enum(['invalid', 'weak', 'good', 'actionable']).optional(),
    summary: z.string().min(1),
    headline: z.string().min(1),
    limitations: z.array(z.string().min(1)).max(5).optional(),
    keyFindings: z.array(z.string().min(1)).min(1).max(5),
    recordHighlights: z
        .array(
            z.object({
                label: z.string().min(1),
                value: z.string().min(1),
                note: z.string().optional(),
            }),
        )
        .max(5),
    sections: z
        .array(
            z.object({
                id: z.string().min(1),
                title: z.string().min(1),
                items: z.array(z.string().min(1)).min(1).max(5),
            }),
        )
        .max(4),
});

type AnalysisSummaryCore = Omit<AnalysisOutcome, 'artifacts' | 'followups'>;

function truncateString(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...(truncated)` : value;
}

function truncateRows(rows: Array<Record<string, unknown>>, maxRows = 40) {
    return rows.slice(0, maxRows).map(row => {
        const entries = Object.entries(row).slice(0, 12);
        return Object.fromEntries(
            entries.map(([key, value]) => {
                if (typeof value === 'string') return [key, truncateString(value, 300)];
                return [key, value];
            }),
        );
    });
}

function buildPrompt(params: {
    locale: Locale;
    sql: string;
    suggestion: {
        title: string;
        goal: string;
        description: string;
        resultTitle: string;
    };
    context: ResultContext;
    columns: Array<{ name: string; type: string | null }>;
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    ruleSummary: AnalysisSummaryCore;
}) {
    return [
        'You are improving a database analysis action result for a SQL copilot.',
        'Return valid JSON only.',
        `Locale: ${params.locale}.`,
        'Rules:',
        '- Use only the provided SQL result rows, columns, source context, and rule summary.',
        '- Do not invent values, ratios, trends, causes, or correlations.',
        '- If the evidence is limited, say so directly.',
        '- Decide analysisState: invalid for empty unusable results, weak for low-information results, good for useful results, actionable when the result is ready for charting or a concrete follow-up.',
        '- Do not present a single repeated top value as an insight. Explain the lack of variance and recommend a better next step.',
        '- Put the strongest user-facing data conclusion first.',
        '- Do not say that SQL was executed, that the system entered the next step, or that rows were returned as the main conclusion.',
        '- Write the headline and summary as if speaking to a human analyst about the data, not about the workflow.',
        '- Keep the wording concise and useful for a data analyst.',
        '- keyFindings should contain 2 to 5 concrete findings.',
        '- recordHighlights should reference actual returned rows or aggregate values.',
        '- sections should group supporting details and caveats.',
        '',
        'Input:',
        JSON.stringify(
            {
                suggestion: params.suggestion,
                sourceContext: params.context,
                generatedSql: params.sql,
                result: {
                    rowCount: params.rowCount,
                    columns: params.columns,
                    sampleRows: truncateRows(params.rows),
                },
                ruleSummary: params.ruleSummary,
            },
            null,
            2,
        ),
    ].join('\n');
}

function normalizeAiOutcome(candidate: z.infer<typeof aiOutcomeSchema>, fallback: AnalysisSummaryCore): AnalysisSummaryCore {
    return {
        analysisState: candidate.analysisState ?? fallback.analysisState,
        limitations: (candidate.limitations ?? fallback.limitations ?? [])
            .map(item => item.trim())
            .filter(Boolean)
            .slice(0, 5),
        summary: candidate.summary.trim() || fallback.summary,
        headline: candidate.headline.trim() || fallback.headline,
        keyFindings: candidate.keyFindings
            .map(item => item.trim())
            .filter(Boolean)
            .slice(0, 5),
        recordHighlights: candidate.recordHighlights
            .map(item => ({
                label: item.label.trim(),
                value: item.value.trim(),
                note: item.note?.trim() || undefined,
            }))
            .filter(item => item.label && item.value)
            .slice(0, 5),
        sections: candidate.sections
            .map(section => ({
                id: section.id.trim(),
                title: section.title.trim(),
                items: section.items
                    .map(item => item.trim())
                    .filter(Boolean)
                    .slice(0, 5),
            }))
            .filter(section => section.id && section.title && section.items.length)
            .slice(0, 4),
    };
}

export async function enhanceAnalysisSummaryWithAi(params: {
    locale: Locale;
    organizationId?: string | null;
    userId?: string | null;
    sql: string;
    suggestion: {
        title: string;
        goal: string;
        description: string;
        resultTitle: string;
    };
    context: ResultContext;
    columns: Array<{ name: string; type: string | null }>;
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    fallback: AnalysisSummaryCore;
}): Promise<AnalysisSummaryCore> {
    try {
        const result = await runLLMJson({
            prompt: buildPrompt({
                locale: params.locale,
                sql: params.sql,
                suggestion: params.suggestion,
                context: params.context,
                columns: params.columns,
                rows: params.rows,
                rowCount: params.rowCount,
                ruleSummary: params.fallback,
            }),
            schema: aiOutcomeSchema,
            temperature: 0.2,
            maxRetries: 1,
            context: {
                organizationId: params.organizationId ?? null,
                userId: params.userId ?? null,
                feature: 'analysis_action_summary',
            },
        });

        return normalizeAiOutcome(result, params.fallback);
    } catch (error) {
        console.error('[analysis] AI summary enhancement failed; using rule summary.', error);
        return params.fallback;
    }
}
