import { ColumnInput, SchemaTag, SchemaTagResponse } from '@/types';
import { uniqueTags } from './clean-json';
export { buildColumnTaggingPrompt } from '@/lib/ai/prompts/tasks/schema.tag';
import { translate } from '@/lib/i18n/i18n';
import { Locale, routing } from '@/lib/i18n/routing';

const TAG_KEYS = [
    'PrimaryKey',
    'Identifier',
    'Key',
    'Time',
    'Name',
    'Dimension',
    'Description',
    'Status',
    'Type',
    'Code',
    'Address',
    'Amount',
    'Metric',
    'Geo',
    'Contact',
    'Network',
    'Boolean',
    'Enum',
    'Array',
    'Required',
    'Nullable',
    'Column',
    'LowCardinality',
    'Json',
] as const;

type TagKey = (typeof TAG_KEYS)[number];

function resolveLocale(locale?: string | null): Locale {
    if (locale && routing.locales.includes(locale as Locale)) {
        return locale as Locale;
    }
    return routing.defaultLocale;
}

function translateSchemaTag(locale: Locale, key: string, values?: Record<string, unknown>) {
    return translate(locale, `Ai.SchemaTags.${key}`, values);
}

function translateTag(locale: Locale, tagKey: TagKey) {
    return translateSchemaTag(locale, `Tags.${tagKey}`);
}

function resolveTagKey(tag: string): TagKey | null {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return null;
    for (const key of TAG_KEYS) {
        const enLabel = translateTag('en', key).toLowerCase();
        const zhLabel = translateTag('zh', key).toLowerCase();
        if (normalized === enLabel || normalized === zhLabel) {
            return key;
        }
    }
    return null;
}

function localizeTag(tag: string, locale?: string | null) {
    const effectiveLocale = resolveLocale(locale);
    const tagKey = resolveTagKey(tag);
    if (!tagKey) return tag;
    return translateTag(effectiveLocale, tagKey);
}

export function heuristicTagging(columns: ColumnInput[], locale?: string | null): SchemaTag[] {
    const effectiveLocale = resolveLocale(locale);
    const t = (key: string, values?: Record<string, unknown>) => translateSchemaTag(effectiveLocale, key, values);
    const keywords: Record<string, TagKey[]> = {
        id: ['PrimaryKey', 'Identifier'],
        key: ['Key'],
        time: ['Time'],
        date: ['Time'],
        at: ['Time'],
        ts: ['Time'],
        name: ['Name', 'Dimension'],
        title: ['Name', 'Dimension'],
        desc: ['Description'],
        status: ['Status'],
        state: ['Status'],
        flag: ['Status'],
        type: ['Type'],
        code: ['Code'],
        addr: ['Address'],
        city: ['Address'],
        province: ['Address'],
        country: ['Address'],
        price: ['Amount'],
        amount: ['Amount'],
        cost: ['Amount'],
        total: ['Metric'],
        count: ['Metric'],
        num: ['Metric'],
        quantity: ['Metric'],
        lat: ['Geo'],
        lon: ['Geo'],
        lng: ['Geo'],
        email: ['Contact'],
        phone: ['Contact'],
        mobile: ['Contact'],
        ip: ['Network'],
        url: ['Network'],
        bool: ['Boolean'],
        is_: ['Boolean'],
        has: ['Boolean'],
    };

    return columns.map(column => {
        const rawName = column.name || '';
        const lowerName = rawName.toLowerCase();
        const lowerType = (column.type ?? '').toLowerCase();
        const tags: TagKey[] = [];

        Object.entries(keywords).forEach(([key, mapped]) => {
            if (lowerName.includes(key.replace(/_$/, ''))) {
                tags.push(...mapped);
            }
        });

        if (lowerType.includes('enum')) tags.push('Enum');
        if (lowerType.includes('lowcardinality')) tags.push('LowCardinality');
        if (lowerType.includes('map')) tags.push('Json');
        if (lowerType.includes('array')) tags.push('Array');
        if (lowerType.includes('uuid')) tags.push('Identifier');

        if (column.nullable === false) tags.push('Required');
        if (column.nullable === true) tags.push('Nullable');

        const normalizedTags = uniqueTags(tags).slice(0, 4) as TagKey[];
        const localizedTags = normalizedTags.map(tag => translateTag(effectiveLocale, tag));
        const summaryParts: string[] = [];
        if (localizedTags.length) {
            summaryParts.push(t('Summary.Tags', { tags: localizedTags.join(' / ') }));
        }
        if (column.comment?.trim()) {
            summaryParts.push(t('Summary.Comment', { comment: column.comment.trim() }));
        }

        return {
            name: rawName,
            semanticTags: localizedTags.length ? localizedTags : [translateTag(effectiveLocale, 'Column')],
            semanticSummary: summaryParts.length ? summaryParts.join(t('Summary.Separator')) : null,
        };
    });
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
                    ? hit.semanticTags.map(tag => localizeTag(tag, locale))
                    : [translateTag(resolveLocale(locale), 'Column')],
                semanticSummary: hit.semanticSummary ?? null,
            };
        }
        return heuristicTagging([col], locale)[0]!;
    });
}
