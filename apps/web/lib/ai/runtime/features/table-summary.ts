import { generateText, runAiWithCache } from '@/lib/ai/gateway';

import { computeSchemaHash } from '@/lib/utils/compute-schema-hash';
import type { TablePropertiesRow } from '@/types/table-info';
import {
    buildFallbackSummary,
    buildFallbackDetail,
    buildFallbackHighlights,
    buildFallbackSnippets,
    buildTableSummaryPrompt,
    normalizeTableSummary,
    parseTableSummaryResponse,
    ColumnInput,
    TableSummaryResponse,
} from '../../core/table-summary';
import { getModelBundle, getProviderModel } from '@/lib/ai/model';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { resolveModelName } from '@/lib/ai/model/presets';

type GetTableSummaryOptions = {
    teamId: string;
    connectionId: string;
    columns: ColumnInput[];

    properties?: TablePropertiesRow | null;
    dbType?: string | null;
    catalog?: string | null;
    database?: string | null;
    table?: string | null;
    locale?: string | null;

    model?: string | null;
    feature?: string;        // Default 'table_summary'
    promptVersion?: number;  // Default 1
    algoVersion?: number;
};

export async function getTableSummaryWithCache(options: GetTableSummaryOptions) {
    const {
        teamId,
        connectionId,
        columns,
        properties,
        dbType,
        catalog,
        database,
        table,
        locale,
        model,
        feature = 'table_summary',
        promptVersion = 1,
        algoVersion,
    } = options;

    const colList = columns ?? [];
    if (!colList.length) {
        return {
            summary: buildFallbackSummary({ database, table, columns: colList, properties, locale }),
            detail: buildFallbackDetail({ database, table, columns: colList, properties, locale }),
            highlights: buildFallbackHighlights(colList, locale),
            snippets: buildFallbackSnippets(table, colList, locale),
            raw: undefined,
            fromCache: false as const,
        };
    }

    const { model: defaultModel, preset } = getModelBundle('table_summary');
    const providerModelName =
        model ??
        resolveModelName('table_summary', { variant: colList.length > 50 ? 'fast' : 'default' });
    const chatModel = providerModelName === preset.model ? defaultModel : getProviderModel(providerModelName);
    const effectiveCatalog = catalog ?? 'default';
    const systemPrompt =
        compileSystemPrompt(preset.system) ?? 'Output JSON only (no code fences or extra text).';

    const schemaHash = await computeSchemaHash({
        dbType,
        catalog: effectiveCatalog,
        database,
        table,
        columns: colList.map(col => ({
            name: col.name,
            type: col.type,
            comment: col.comment,
            defaultValue: col.defaultValue,
            nullable: col.nullable,
        })),
    });
    const localeKey = locale ?? 'en';

    const { normalized, payload, fromCache } = await runAiWithCache<TableSummaryResponse, TableSummaryResponse | null>({
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
        normalize: (savedPayload) =>
            normalizeTableSummary({
                payload: savedPayload,
                columns: colList,
                properties: properties ?? null,
                database: database ?? null,
                table: table ?? null,
                locale,
            }),
        run: async () => {
            const prompt = buildTableSummaryPrompt({
                dbType,
                database,
                table,
                properties: properties ?? null,
                columns: colList,
                locale,
            });

            const { text } = await generateText({
                model: chatModel,
                system: systemPrompt,
                prompt,
                temperature: preset.temperature,
                topP: 1,
                maxOutputTokens: preset.maxTokens ?? 512,
                context: {
                    teamId,
                    feature,
                    model: providerModelName,
                    promptVersion,
                    algoVersion,
                },
            });

            const { parsed, cleaned } = parseTableSummaryResponse(text);
            const normalizedResult = normalizeTableSummary({
                payload: parsed,
                columns: colList,
                properties: properties ?? null,
                database: database ?? null,
                table: table ?? null,
                locale,
            });

            const payloadToSave: TableSummaryResponse = {
                ...normalizedResult,
                raw: parsed?.raw ?? cleaned,
            };

            return { payload: payloadToSave };
        },
    });

    return {
        ...normalized,
        raw: payload?.raw ?? normalized.raw,
        fromCache,
    };
}
