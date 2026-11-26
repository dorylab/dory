import { generateText } from '@/lib/ai/gateway';

import type { NextRequest } from 'next/server';
import {
    buildSchemaExplanationPrompt,
    normalizeSchemaExplanationPayload,
    parseExplanationResponse,
    ColumnInput,
    SchemaExplanationResponse,
} from '../../core/schema-explanations';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';

type GetColumnExplanationsOptions = {
    organizationId: string;
    userId?: string | null;
    req?: NextRequest | null;

    dbType?: string | null;
    database?: string | null;
    table?: string | null;
    locale?: string | null;

    columns: ColumnInput[];
    model?: string | null;

    feature?: string; // Default column_explanations
    promptVersion?: number; // Default 1
    algoVersion?: number;
};

export async function getColumnExplanations(
    options: GetColumnExplanationsOptions,
): Promise<{ columns: SchemaExplanationResponse['columns']; raw?: string; fromCache: boolean }> {
    const {
        organizationId,
        userId,
        req,
        dbType,
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

    const {
        model: chatModel,
        preset,
        modelName: providerModelName,
        providerKey,
        gateway,
    } = await resolveAiLanguageModel({
        role: 'schema_explanation',
        organizationId,
        requestedModel: model,
        req,
    });
    const systemPrompt = compileSystemPrompt(preset.system) ?? 'Output JSON only (no code fences or extra text).';

    const prompt = buildSchemaExplanationPrompt({ columns, dbType, database, table, locale });

    const { text } = await generateText({
        model: chatModel,
        instructions: systemPrompt,
        prompt,
        temperature: preset.temperature,
        topP: 1,
        context: {
            organizationId,
            userId: userId ?? null,
            feature,
            model: providerModelName,
            provider: providerKey ?? undefined,
            gateway: gateway ?? undefined,
            promptVersion,
            algoVersion,
        },
    });

    const { parsed, cleaned } = parseExplanationResponse(text);
    const normalizedResult = normalizeSchemaExplanationPayload(columns, parsed, locale);

    return {
        ...normalizedResult,
        raw: parsed?.raw ?? cleaned,
        fromCache: false,
    };
}
