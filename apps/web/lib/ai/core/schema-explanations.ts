import { cleanJson } from './clean-json';
export { buildSchemaExplanationPrompt } from '@/lib/ai/prompts/tasks/schema.explain';
import { translate } from '@/lib/i18n/i18n';
import { Locale, routing } from '@/lib/i18n/routing';

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

function resolveLocale(locale?: string | null): Locale {
    if (locale && routing.locales.includes(locale as Locale)) {
        return locale as Locale;
    }
    return routing.defaultLocale;
}

function translateSchemaExplanation(locale: Locale, key: string, values?: Record<string, unknown>) {
    return translate(locale, `Ai.SchemaExplanations.${key}`, values);
}

function buildFallbackSummary(column: ColumnInput, locale?: string | null) {
    const pieces: string[] = [];
    const effectiveLocale = resolveLocale(locale);
    const t = (key: string, values?: Record<string, unknown>) => translateSchemaExplanation(effectiveLocale, key, values);
    const name = column.name || t('Fallback name');
    const type = column.type || t('Fallback type');
    pieces.push(t('Fallback summary', { name, type }));
    if (column.nullable === false) {
        pieces.push(t('Fallback required'));
    } else if (column.nullable === true) {
        pieces.push(t('Fallback nullable'));
    }
    if (column.comment?.trim()) {
        pieces.push(t('Fallback comment', { comment: column.comment.trim() }));
    }
    return pieces.join(t('Fallback separator')).slice(0, 60) || t('Fallback default', { name });
}

export function fallbackSummaries(columns: ColumnInput[], locale?: string | null): ColumnExplanation[] {
    return columns.map(col => ({
        name: col.name,
        semanticSummary: buildFallbackSummary(col, locale),
    }));
}

export function normalizeAIResult(
    columns: ColumnInput[],
    aiResult?: SchemaExplanationResponse | null,
    locale?: string | null,
): ColumnExplanation[] {
    const aiMap = new Map<string, string | null>();
    aiResult?.columns?.forEach(col => {
        if (!col?.name) return;
        aiMap.set(col.name.toLowerCase(), col.semanticSummary ?? null);
    });

    return columns.map(col => {
        const hit = aiMap.get(col.name.toLowerCase());
        return {
            name: col.name,
            semanticSummary: typeof hit === 'string' ? hit : buildFallbackSummary(col, locale),
        };
    });
}

export function normalizeSchemaExplanationPayload(
    columns: ColumnInput[],
    payload?: SchemaExplanationResponse | null,
    locale?: string | null,
) {
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
