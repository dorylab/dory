import type { ColumnInput, SchemaTag } from '@dory/shared';
import { translate } from '@dory/i18n/translate';
import type { Locale } from '@dory/i18n/routing';
import { routing } from '@dory/i18n/routing';
import { uniqueTags } from '@dory/web-utils/schema-tags';

export type ColumnInsight = SchemaTag;

export type ColumnInsights = {
    columns: ColumnInsight[];
    tags: Record<string, string[]>;
    summaries: Record<string, string | null>;
};

const TAG_KEYS = [
    'PrimaryKey',
    'Identifier',
    'Key',
    'Time',
    'Date',
    'Timestamp',
    'Name',
    'Dimension',
    'Category',
    'Description',
    'Status',
    'Type',
    'Code',
    'Address',
    'Amount',
    'Metric',
    'Measure',
    'Numeric',
    'Geo',
    'Contact',
    'Network',
    'Boolean',
    'Enum',
    'Array',
    'Required',
    'Column',
    'LowCardinality',
    'Json',
    'Text',
] as const;

export type SchemaTagKey = (typeof TAG_KEYS)[number];

export function resolveColumnInsightLocale(locale?: string | null): Locale {
    if (locale && routing.locales.includes(locale as Locale)) {
        return locale as Locale;
    }
    return routing.defaultLocale;
}

function translateSchemaTag(locale: Locale, key: string, values?: Record<string, unknown>) {
    return translate(locale, `Ai.SchemaTags.${key}`, values);
}

function translateSchemaExplanation(locale: Locale, key: string, values?: Record<string, unknown>) {
    return translate(locale, `Ai.SchemaExplanations.${key}`, values);
}

function translateTag(locale: Locale, tagKey: SchemaTagKey) {
    return translateSchemaTag(locale, `Tags.${tagKey}`);
}

export function resolveSchemaTagKey(tag: string): SchemaTagKey | null {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return null;

    for (const key of TAG_KEYS) {
        for (const locale of routing.locales) {
            if (normalized === translateTag(locale, key).toLowerCase()) {
                return key;
            }
        }
    }

    return null;
}

export function localizeSchemaTag(tag: string, locale?: string | null) {
    const effectiveLocale = resolveColumnInsightLocale(locale);
    const tagKey = resolveSchemaTagKey(tag);
    return tagKey ? translateTag(effectiveLocale, tagKey) : tag;
}

function addNameTags(name: string, tags: SchemaTagKey[]) {
    const add = (...nextTags: SchemaTagKey[]) => {
        tags.push(...nextTags);
    };

    if (/^(id|.*_id|id_.*)$/.test(name)) add('PrimaryKey', 'Identifier');
    if (/(^|_)key$|^key$/.test(name)) add('Key');
    if (/(date|day|week|month|year)/.test(name)) add('Time', 'Date');
    if (/(time|timestamp|datetime|created_at|updated_at|_at$)/.test(name)) add('Time', 'Timestamp');
    if (/(^|_)(name|title|label)$/.test(name)) add('Name', 'Dimension');
    if (/(desc|description|note|comment|text)/.test(name)) add('Description', 'Text');
    if (/(^|_)(status|state|flag)$/.test(name)) add('Status');
    if (/(^|_)(type|kind|category|segment)$/.test(name)) add('Dimension', 'Category');
    if (/(^|_)(code|sku)$/.test(name)) add('Code', 'Identifier');
    if (/(post_?code|postal|zip)/.test(name)) add('Geo', 'Identifier');
    if (/(addr|address|city|province|state|country|region)/.test(name)) add('Geo', 'Address');
    if (/(^|_)(price|amount|cost|revenue|sales|balance|salary)$/.test(name)) add('Amount');
    if (/(^|_)(total|count|num|quantity|qty|score|rate|value|size|avg|average)$/.test(name)) add('Metric', 'Measure');
    if (/(^|_)(lat|latitude|lon|lng|longitude)$/.test(name)) add('Geo');
    if (/(email|phone|mobile)/.test(name)) add('Contact', 'Identifier');
    if (/(ip|url|uri|host|domain)/.test(name)) add('Network', 'Identifier');
    if (/^(is_|has_|can_|should_|allow_|enable_|enabled|active|deleted|dead|new$)/.test(name)) add('Boolean', 'Status');
}

function addTypeTags(type: string, tags: SchemaTagKey[]) {
    const normalizedType = type.toLowerCase();
    const innerType = normalizedType.replace(/lowcardinality\((.*)\)/, '$1');
    const hasBooleanTag = tags.includes('Boolean');

    if (/lowcardinality/.test(normalizedType)) tags.push('LowCardinality');
    if (/(enum|set)/.test(normalizedType)) tags.push('Dimension', 'Enum', 'LowCardinality');
    if (/(bool|boolean)/.test(innerType)) tags.push('Boolean');
    if (/(timestamp|datetime|timestamptz)/.test(innerType)) tags.push('Time', 'Timestamp');
    if (/^date(?:32)?$/.test(innerType.trim())) tags.push('Time', 'Date');
    if (/(array|\[\])/.test(innerType)) tags.push('Array');
    if (/(json|jsonb|map|object|variant)/.test(innerType)) tags.push('Json');
    if (/(uuid|guid)/.test(innerType)) tags.push('Identifier');
    if (!hasBooleanTag && /(int|integer|bigint|smallint|tinyint|uint|float|double|decimal|numeric|real|money)/.test(innerType)) {
        tags.push('Numeric');
    }
    if (/(char|text|string|varchar|citext)/.test(innerType) && !tags.includes('Identifier') && !tags.includes('LowCardinality')) {
        tags.push('Text');
    }
}

function buildSummary(column: ColumnInput, localizedTags: string[], locale?: string | null) {
    const effectiveLocale = resolveColumnInsightLocale(locale);
    const tagT = (key: string, values?: Record<string, unknown>) => translateSchemaTag(effectiveLocale, key, values);
    const explanationT = (key: string, values?: Record<string, unknown>) => translateSchemaExplanation(effectiveLocale, key, values);
    const pieces: string[] = [];
    const name = column.name || explanationT('Fallback name');
    const type = column.type || explanationT('Fallback type');

    if (localizedTags.length) {
        pieces.push(tagT('Summary.Tags', { tags: localizedTags.join(' / ') }));
    }

    pieces.push(explanationT('Fallback summary', { name, type }));

    if (column.nullable === false) {
        pieces.push(explanationT('Fallback required'));
    } else if (column.nullable === true) {
        pieces.push(explanationT('Fallback nullable'));
    }

    if (column.comment?.trim()) {
        pieces.push(explanationT('Fallback comment', { comment: column.comment.trim() }));
    }

    return pieces.join(explanationT('Fallback separator')).slice(0, 100) || explanationT('Fallback default', { name });
}

export function generateColumnInsightColumns(columns: ColumnInput[], locale?: string | null): ColumnInsight[] {
    const effectiveLocale = resolveColumnInsightLocale(locale);

    return columns.map(column => {
        const rawName = column.name || '';
        const tags: SchemaTagKey[] = [];

        addNameTags(rawName.toLowerCase(), tags);
        addTypeTags(column.type ?? '', tags);

        if (column.nullable === false) {
            tags.push('Required');
        }

        const normalizedTags = uniqueTags(tags).slice(0, 4) as SchemaTagKey[];
        const localizedTags = normalizedTags.map(tag => translateTag(effectiveLocale, tag));
        const semanticTags = localizedTags.length ? localizedTags : [translateTag(effectiveLocale, 'Column')];

        return {
            name: rawName,
            semanticTags,
            semanticSummary: buildSummary(column, semanticTags, effectiveLocale),
        };
    });
}

export function generateColumnInsights(columns: ColumnInput[], locale?: string | null): ColumnInsights {
    const insightColumns = generateColumnInsightColumns(columns, locale);
    const tags: Record<string, string[]> = {};
    const summaries: Record<string, string | null> = {};

    insightColumns.forEach(column => {
        const key = column.name.toLowerCase();
        tags[key] = column.semanticTags;
        summaries[key] = column.semanticSummary ?? null;
    });

    return {
        columns: insightColumns,
        tags,
        summaries,
    };
}
