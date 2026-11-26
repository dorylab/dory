import { generateText } from '@/lib/ai/gateway';

import type { NextRequest } from 'next/server';
import { cleanJson } from '../../core/clean-json';
import { buildColumnTaggingPrompt, normalizeAIResult } from '../../core/column-tagging';
import { ColumnInput, SchemaTag, SchemaTagResponse } from '@dory/shared';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';

type GetColumnTagsOptions = {
    organizationId: string;
    userId?: string | null;
    req?: NextRequest | null;
    columns: ColumnInput[];

    dbType?: string | null;
    database?: string | null;
    table?: string | null;
    locale?: string | null;

    model?: string | null;
    feature?: string;
    promptVersion?: number;
    algoVersion?: number;
};

export async function getColumnTags(options: GetColumnTagsOptions) {
    const {
        organizationId,
        userId,
        req,
        columns,
        dbType,
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

    const {
        model: chatModel,
        preset,
        modelName: providerModelName,
        providerKey,
        gateway,
    } = await resolveAiLanguageModel({
        role: 'column_tagging',
        organizationId,
        requestedModel: model,
        req,
    });
    const systemPrompt = compileSystemPrompt(preset.system) ?? 'Output JSON only (no code fences or extra text).';

    const prompt = buildColumnTaggingPrompt({ columns, dbType, database, table, locale });

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

    const cleaned = cleanJson(text);
    let parsed: SchemaTagResponse | null = null;
    try {
        parsed = JSON.parse(cleaned) as SchemaTagResponse;
    } catch {
        console.error('[getColumnTags] parse failed.');
    }

    return {
        columns: normalizeAIResult(columns, parsed, locale),
        raw: parsed?.raw ?? cleaned,
        fromCache: false,
    };
}
