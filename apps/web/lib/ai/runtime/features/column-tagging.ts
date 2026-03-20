import { generateText, runAiWithCache } from '@/lib/ai/gateway';

import { computeSchemaHash } from '@/lib/utils/compute-schema-hash';
import { cleanJson } from '../../core/clean-json';
import { buildColumnTaggingPrompt, heuristicTagging, normalizeAIResult } from '../../core/column-tagging';
import { ColumnInput, SchemaTag, SchemaTagResponse } from '@/types';
import { getEffectiveModelBundle } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';

type GetColumnTagsWithCacheOptions = {
    organizationId: string;
    userId?: string | null;
    connectionId: string;
    columns: ColumnInput[];

    dbType?: string | null;
    catalog?: string | null;
    database?: string | null;
    table?: string | null;
    locale?: string | null;

    model?: string | null;
    feature?: string;
    promptVersion?: number;
    algoVersion?: number;
};

export async function getColumnTagsWithCache(options: GetColumnTagsWithCacheOptions) {
    const {
        organizationId,
        userId,
        connectionId,
        columns,
        dbType,
        catalog,
        database,
        table,
        locale,
        model,
        feature = 'column_tagging',
        promptVersion = 1,
        algoVersion,
    } = options;

    if (!columns.length) {
        return {
            columns: [] as SchemaTag[],
            raw: undefined,
            fromCache: false as const,
        };
    }

    const { model: chatModel, preset, modelName: providerModelName } = getEffectiveModelBundle(
        'column_tagging',
        model,
    );
    const effectiveCatalog = catalog ?? 'default';
    const systemPrompt = compileSystemPrompt(preset.system) ?? 'Output JSON only (no code fences or extra text).';

    const schemaHash = await computeSchemaHash({
        dbType,
        catalog: effectiveCatalog,
        database,
        table,
        columns,
    });
    const localeKey = locale ?? 'en';

    const { normalized, payload, fromCache } = await runAiWithCache<SchemaTag[], SchemaTagResponse | null>({
        organizationId,
        connectionId,
        feature,
        model: providerModelName,
        inputHash: `${schemaHash}:${localeKey}`,
        catalog: effectiveCatalog,
        dbType: dbType ?? null,
        databaseName: database ?? null,
        tableName: table ?? null,
        promptVersion,
        algoVersion,
        context: {
            organizationId,
            userId: userId ?? null,
            feature,
            model: providerModelName,
            promptVersion,
            algoVersion,
        },
        normalize: (savedPayload) => {
            if (savedPayload?.columns) return savedPayload.columns;
            return heuristicTagging(columns, locale);
        },
        run: async () => {
            const prompt = buildColumnTaggingPrompt({ columns, dbType, database, table, locale });

            const { text } = await generateText({
                model: chatModel,
                system: systemPrompt,
                prompt,
                temperature: preset.temperature,
                topP: 1,
                context: {
                    organizationId,
                    userId: userId ?? null,
                    feature,
                    model: providerModelName,
                    promptVersion,
                    algoVersion,
                },
            });

            const cleaned = cleanJson(text);
            let parsed: SchemaTagResponse | null = null;
            try {
                parsed = JSON.parse(cleaned) as SchemaTagResponse;
            } catch (error) {
                console.error('[getColumnTagsWithCache] parse failed, raw:', text);
            }

            const normalizedResult = normalizeAIResult(columns, parsed, locale);
            const payloadToSave: SchemaTagResponse = {
                columns: normalizedResult,
                raw: parsed?.raw ?? cleaned,
            };

            return { payload: payloadToSave };
        },
    });

    return {
        columns: normalized,
        raw: payload?.raw,
        fromCache,
    };
}
