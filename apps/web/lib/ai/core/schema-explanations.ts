import { cleanJson } from './clean-json';
export { buildSchemaExplanationPrompt } from '@/lib/ai/prompts/tasks/schema.explain';
import { generateColumnInsightColumns } from '@/lib/schema/column-insights';

export type ColumnInput = {
    name: string;
    type?: string;
    comment?: string | null;
    defaultValue?: string | null;
    nullable?: boolean;
};

export type ColumnExplanation = {
    name: string;
    semanticSummary: string | null;
};

export type SchemaExplanationResponse = {
    columns: ColumnExplanation[];
    raw?: string;
};

export function fallbackSummaries(columns: ColumnInput[], locale?: string | null): ColumnExplanation[] {
    return generateColumnInsightColumns(columns, locale).map(col => ({
        name: col.name,
        semanticSummary: col.semanticSummary ?? null,
    }));
}

export function normalizeAIResult(columns: ColumnInput[], aiResult?: SchemaExplanationResponse | null, locale?: string | null): ColumnExplanation[] {
    const aiMap = new Map<string, string | null>();
    aiResult?.columns?.forEach(col => {
        if (!col?.name) return;
        aiMap.set(col.name.toLowerCase(), col.semanticSummary ?? null);
    });

    return columns.map(col => {
        const hit = aiMap.get(col.name.toLowerCase());
        return {
            name: col.name,
            semanticSummary: typeof hit === 'string' ? hit : (fallbackSummaries([col], locale)[0]?.semanticSummary ?? null),
        };
    });
}

export function normalizeSchemaExplanationPayload(columns: ColumnInput[], payload?: SchemaExplanationResponse | null, locale?: string | null) {
    const normalized = normalizeAIResult(columns, payload, locale);
    return {
        columns: normalized,
        raw: payload?.raw,
    };
}

export function parseExplanationResponse(text: string) {
    const cleaned = cleanJson(text);
    let parsed: SchemaExplanationResponse | null = null;
    try {
        parsed = JSON.parse(cleaned) as SchemaExplanationResponse;
    } catch (error) {
        console.error('[schema-explanations] parse failed, raw:', text);
    }
    return { parsed, cleaned };
}
