import type { TablePropertiesRow } from '@/types/table-info';
import { cleanJson } from './clean-json';
export { buildColumnLinesForPrompt, buildTableSummaryPrompt } from '@/lib/ai/prompts/tasks/schema.summary';
import { translate } from '@/lib/i18n/i18n';
import { Locale, routing } from '@/lib/i18n/routing';

export type ColumnInput = {
    name: string;
    type?: string;
    comment?: string | null;
    defaultValue?: string | null;
    nullable?: boolean;
    semanticTags?: string[];
};

export type TableSummaryResponse = {
    summary: string;
    detail?: string | null;
    highlights?: { field: string; description: string }[];
    snippets?: { title?: string | null; sql: string }[];
    raw?: string;
};

function resolveLocale(locale?: string | null): Locale {
    if (locale && routing.locales.includes(locale as Locale)) {
        return locale as Locale;
    }
    return routing.defaultLocale;
}

function translateTableBrowser(locale: Locale, key: string, values?: Record<string, unknown>) {
    return translate(locale, `TableBrowser.${key}`, values);
}

function translateSchemaTag(locale: Locale, key: string, values?: Record<string, unknown>) {
    return translate(locale, `Ai.SchemaTags.${key}`, values);
}

function buildTagSet(tagKeys: string[]) {
    const values = new Set<string>();
    routing.locales.forEach(locale => {
        tagKeys.forEach(key => {
            const translated = translateSchemaTag(locale, `Tags.${key}`);
            if (translated) values.add(translated);
        });
    });
    return values;
}

// ==== Fallback construction ====

export function buildFallbackSummary({
    database,
    table,
    columns,
    properties,
    locale,
}: {
    database?: string | null;
    table?: string | null;
    columns?: ColumnInput[] | null;
    properties?: TablePropertiesRow | null;
    locale?: string | null;
}) {
    const effectiveLocale = resolveLocale(locale);
    const t = (key: string, values?: Record<string, unknown>) => translateTableBrowser(effectiveLocale, key, values);
    const colCount = columns?.length ?? 0;
    const sampleCols = (columns || [])
        .slice(0, 3)
        .map(col => col?.name)
        .filter(Boolean);

    const pieces: string[] = [];
    const tableLabel = table ?? t('Fallback current table');
    pieces.push(
        t('Fallback summary', {
            table: tableLabel,
            count: colCount ? String(colCount) : t('Fallback unknown count'),
        }),
    );

    if (database) {
        pieces.push(t('Fallback database', { database }));
    }

    if (sampleCols.length) {
        pieces.push(t('Fallback example columns', { columns: sampleCols.join(', ') }));
    }

    if (properties?.engine) {
        pieces.push(t('Fallback engine', { engine: properties.engine }));
    }

    if (properties?.partitionKey) {
        pieces.push(t('Fallback partition', { partition: properties.partitionKey }));
    }

    if (properties?.comment?.trim()) {
        pieces.push(t('Fallback comment', { comment: properties.comment.trim() }));
    }

    return (
        pieces.join(t('Fallback summary separator')).slice(0, 160) || t('Fallback no summary')
    );
}

export function buildFallbackDetail({
    database,
    table,
    columns,
    properties,
    locale,
}: {
    database?: string | null;
    table?: string | null;
    columns?: ColumnInput[] | null;
    properties?: TablePropertiesRow | null;
    locale?: string | null;
}) {
    const effectiveLocale = resolveLocale(locale);
    const t = (key: string, values?: Record<string, unknown>) => translateTableBrowser(effectiveLocale, key, values);
    const summary = buildFallbackSummary({ database, table, columns, properties, locale });
    const numericCols = (columns || []).filter(col => (col.type ?? '').toLowerCase().includes('int'));
    const timeCols = (columns || []).filter(col => {
        const lower = (col.name ?? '').toLowerCase();
        return lower.includes('time') || lower.includes('date') || lower.includes('ts');
    });
    const partition = properties?.partitionKey ? t('Fallback detail partition', { partition: properties.partitionKey }) : '';
    const sorting = properties?.sortingKey ? t('Fallback detail sorting', { sorting: properties.sortingKey }) : '';
    const engine = properties?.engine ? t('Fallback detail engine', { engine: properties.engine }) : '';
    const commonUses =
        numericCols.length && timeCols.length
            ? t('Fallback detail common queries metrics')
            : t('Fallback detail common queries generic');
    return `${summary}${t('Fallback detail separator')}${engine}${partition}${sorting}${commonUses}`.slice(0, 260);
}

export function buildFallbackHighlights(columns: ColumnInput[], locale?: string | null) {
    const effectiveLocale = resolveLocale(locale);
    const t = (key: string, values?: Record<string, unknown>) => translateTableBrowser(effectiveLocale, key, values);
    const picks = columns.slice(0, 4);
    if (!picks.length) return [];
    return picks.map(col => ({
        field: col.name,
        description:
            col.comment?.slice(0, 80) ||
            t('Fallback column description', {
                name: col.name,
                type: col.type ?? t('Fallback unknown type'),
                required: col.nullable === false ? t('Fallback required') : '',
            }),
    }));
}

export function buildFallbackSnippets(table?: string | null, columns?: ColumnInput[], locale?: string | null) {
    if (!table) return [];
    const effectiveLocale = resolveLocale(locale);
    const t = (key: string, values?: Record<string, unknown>) => translateTableBrowser(effectiveLocale, key, values);
    const list = columns || [];
    const dimensionTags = buildTagSet(['Dimension']);
    const metricTags = buildTagSet(['Metric', 'Amount']);
    const firstDim = list.find(col => (col.semanticTags || []).some(tag => dimensionTags.has(tag)))?.name || list[0]?.name;
    const firstMeasure =
        list.find(col => (col.semanticTags || []).some(tag => metricTags.has(tag)))
            ?.name || list[1]?.name;

    const snippets: { title: string; sql: string }[] = [];
    snippets.push({
        title: t('Fallback snippet title'),
        sql: `SELECT *\nFROM ${table}\nLIMIT 50;`,
    });

    if (firstDim && firstMeasure) {
        snippets.push({
            title: t('Fallback snippet aggregate by dimension'),
            sql: `SELECT ${firstDim}, COUNT(${firstMeasure}) AS cnt\nFROM ${table}\nGROUP BY ${firstDim}\nORDER BY cnt DESC\nLIMIT 20;`,
        });
    }

    const timeCol = list.find(col => (col.name ?? '').toLowerCase().includes('time'))?.name;
    if (timeCol) {
        snippets.push({
            title: t('Fallback snippet time range filter'),
            sql: `SELECT *\nFROM ${table}\nWHERE ${timeCol} >= today() - 7\nLIMIT 200;`,
        });
    }

    return snippets;
}


export function normalizeTableSummary(input: {
    payload?: TableSummaryResponse | null;
    columns: ColumnInput[];
    properties?: TablePropertiesRow | null;
    database?: string | null;
    table?: string | null;
    locale?: string | null;
}) {
    const { payload, columns, properties, database, table, locale } = input;
    const colList = columns ?? [];

    const summary =
        payload?.summary?.trim() ||
        buildFallbackSummary({ database, table, columns: colList, properties, locale });

    const detail =
        payload?.detail?.trim() ||
        buildFallbackDetail({ database, table, columns: colList, properties, locale });

    const parsedHighlights =
        (payload?.highlights ?? []).filter(item => item?.field && item?.description).slice(0, 6);
    const highlights =
        parsedHighlights.length > 0
            ? parsedHighlights
            : buildFallbackHighlights(colList, locale);

    const parsedSnippets =
        (payload?.snippets ?? []).filter(item => item?.sql).slice(0, 5);
    const snippets =
        parsedSnippets.length > 0
            ? parsedSnippets
            : buildFallbackSnippets(table, colList, locale);

    return {
        summary,
        detail,
        highlights,
        snippets,
        raw: payload?.raw,
    };
}

export function parseTableSummaryResponse(text: string) {
    console.debug('[table-summary] raw response:', text);
    const cleaned = cleanJson(text);
    let parsed: TableSummaryResponse | null = null;
    try {
        parsed = JSON.parse(cleaned) as TableSummaryResponse;
    } catch (error) {
        console.error(error);
        console.error('[table-summary] parse failed, raw:', text);
    }
    return { parsed, cleaned };
}
