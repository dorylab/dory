import { generateText, runAiWithCache } from '@/lib/ai/gateway';

import { computeSchemaHash } from '@/lib/utils/compute-schema-hash';
import {
    buildSchemaExplanationPrompt,
    normalizeSchemaExplanationPayload,
    parseExplanationResponse,
    fallbackSummaries,
    ColumnInput,
    SchemaExplanationResponse,
} from '../../core/schema-explanations';
import { getModelBundle, getProviderModel } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';

type GetColumnExplanationsOptions = {
    teamId: string;
    connectionId: string;

    dbType?: string | null;
    catalog?: string | null;
    database?: string | null;
    table?: string | null;
    locale?: string | null;

    columns: ColumnInput[];
    model?: string | null;

    feature?: string;        // Default column_explanations
    promptVersion?: number;  // Default 1
    algoVersion?: number;
};

export async function getColumnExplanationsWithCache(
    options: GetColumnExplanationsOptions,
): Promise<{ columns: SchemaExplanationResponse['columns']; raw?: string; fromCache: boolean }> {
    const {
        teamId,
        connectionId,
        dbType,
        catalog,
        database,
        table,
        locale,
        columns,
        model,
        feature = 'column_explanations',
        promptVersion = 1,
        algoVersion,
    } = options;

    if (!columns.length) {
        return { columns: [], raw: undefined, fromCache: false };
    }

    const { model: defaultModel, preset } = getModelBundle('schema_explanation');
    const providerModelName = model || preset.model;
    const chatModel = providerModelName === preset.model ? defaultModel : getProviderModel(providerModelName);
    const effectiveCatalog = catalog ?? 'default';
    const systemPrompt =
        compileSystemPrompt(preset.system) ?? 'Output JSON only (no code fences or extra text).';

    // Standardize schemaHash: align with tags/table-summary
    const schemaHash = await computeSchemaHash({
        dbType,
        catalog: effectiveCatalog,
        database,
        table,
        columns: columns.map(col => ({
            name: col.name,
            type: col.type,
            comment: col.comment,
            defaultValue: col.defaultValue,
            nullable: col.nullable,
        })),
    });
    const localeKey = locale ?? 'en';

    const { normalized, payload, fromCache } = await runAiWithCache<
        SchemaExplanationResponse['columns'],
        SchemaExplanationResponse | null
    >({
        teamId,
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
        normalize: (savedPayload) => normalizeSchemaExplanationPayload(columns, savedPayload, locale).columns,
        run: async () => {
            const prompt = buildSchemaExplanationPrompt({ columns, dbType, database, table, locale });

            const { text } = await generateText({
                model: chatModel,
                system: systemPrompt,
                prompt,
                temperature: preset.temperature,
                topP: 1,
                context: {
                    teamId,
                    feature,
                    model: providerModelName,
                    promptVersion,
                    algoVersion,
                },
            });

            const { parsed, cleaned } = parseExplanationResponse(text);
            const normalizedResult = normalizeSchemaExplanationPayload(columns, parsed, locale);

            const payloadToSave: SchemaExplanationResponse = {
                columns: normalizedResult.columns,
                raw: parsed?.raw ?? cleaned,
            };

            return { payload: payloadToSave };
        },
    });

    return {
        columns: normalized ?? fallbackSummaries(columns, locale),
        raw: payload?.raw,
        fromCache,
    };
}
