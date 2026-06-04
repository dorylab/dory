import { ColumnInput, SchemaTag, SchemaTagResponse } from '@dory/shared';
import { uniqueTags } from './clean-json';
export { buildColumnTaggingPrompt } from '@/lib/ai/prompts/tasks/schema.tag';
import { generateColumnInsightColumns, localizeSchemaTag, resolveColumnInsightLocale } from '@/lib/schema/column-insights';

export function heuristicTagging(columns: ColumnInput[], locale?: string | null): SchemaTag[] {
    return generateColumnInsightColumns(columns, locale);
}

export function normalizeAIResult(columns: ColumnInput[], aiResult?: SchemaTagResponse | null, locale?: string | null): SchemaTag[] {
    const aiMap = new Map<string, SchemaTag>();
    aiResult?.columns?.forEach(col => {
        if (!col?.name) return;
        aiMap.set(col.name.toLowerCase(), {
            name: col.name,
            semanticTags: Array.isArray(col.semanticTags) ? uniqueTags(col.semanticTags).slice(0, 6) : [],
            semanticSummary: col.semanticSummary ?? null,
        });
    });

    return columns.map(col => {
        const hit = aiMap.get(col.name.toLowerCase());
        if (hit) {
            return {
                name: col.name,
                semanticTags: hit.semanticTags?.length
                    ? hit.semanticTags.map(tag => localizeSchemaTag(tag, locale))
                    : (heuristicTagging([col], resolveColumnInsightLocale(locale))[0]?.semanticTags ?? []),
                semanticSummary: hit.semanticSummary ?? null,
            };
        }
        return heuristicTagging([col], locale)[0]!;
    });
}
